use crate::heightmap::Heightmap;

pub fn relax(
    hmap: &mut Heightmap,
    touched: &[(usize, usize)],
    theta_repose_deg: f32,
    max_iters: usize,
) -> usize {
    if touched.is_empty() || max_iters == 0 {
        return 0;
    }
    let nx = hmap.nx();
    let ny = hmap.ny();
    if nx == 0 || ny == 0 {
        return 0;
    }
    let cell_mm = hmap.cell_mm();
    let thr_axis = theta_repose_deg.to_radians().tan() * cell_mm;
    let thr_diag = thr_axis * std::f32::consts::SQRT_2;

    // Active mask: dilate `touched` by 1 cell (8-connected), clipped to bounds.
    let mut active = vec![false; nx * ny];
    for &(i, j) in touched {
        if i >= nx || j >= ny {
            continue;
        }
        let i_lo = i.saturating_sub(1);
        let j_lo = j.saturating_sub(1);
        let i_hi = (i + 1).min(nx - 1);
        let j_hi = (j + 1).min(ny - 1);
        for jj in j_lo..=j_hi {
            for ii in i_lo..=i_hi {
                active[jj * nx + ii] = true;
            }
        }
    }

    // All 8 neighbours. After a transfer between A and B the gap is reduced to
    // exactly `thr`, so the symmetric visit from the other side is a no-op and
    // volume is preserved per pair-visit. Visiting all 8 is required so that
    // material can propagate outward from any active cell, including in the
    // -i / -j directions across the active-set boundary.
    let neighbours: [(isize, isize, f32); 8] = [
        (1, 0, thr_axis),
        (-1, 0, thr_axis),
        (0, 1, thr_axis),
        (0, -1, thr_axis),
        (1, 1, thr_diag),
        (-1, 1, thr_diag),
        (1, -1, thr_diag),
        (-1, -1, thr_diag),
    ];

    let mut iters_run = 0;
    for _ in 0..max_iters {
        iters_run += 1;
        let mut any_transfer = false;

        // Snapshot of currently-active cells; cells added during this pass
        // become eligible next iteration.
        let mut cells: Vec<(usize, usize)> = Vec::new();
        for j in 0..ny {
            for i in 0..nx {
                if active[j * nx + i] {
                    cells.push((i, j));
                }
            }
        }

        for (i, j) in cells {
            for &(di, dj, thr) in &neighbours {
                let ni = i as isize + di;
                let nj = j as isize + dj;
                if ni < 0 || nj < 0 || ni >= nx as isize || nj >= ny as isize {
                    continue;
                }
                let ni = ni as usize;
                let nj = nj as usize;
                let h_a = hmap.get(i, j);
                let h_b = hmap.get(ni, nj);
                let diff = h_a - h_b;
                let abs_diff = diff.abs();
                if abs_diff > thr {
                    let transfer = (abs_diff - thr) / 2.0;
                    if diff > 0.0 {
                        hmap.set(i, j, h_a - transfer);
                        hmap.set(ni, nj, h_b + transfer);
                    } else {
                        hmap.set(i, j, h_a + transfer);
                        hmap.set(ni, nj, h_b - transfer);
                    }
                    any_transfer = true;
                    active[nj * nx + ni] = true;
                }
            }
        }

        if !any_transfer {
            break;
        }
    }
    iters_run
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat_with_spike(nx: usize, ny: usize, cell_mm: f32, base: f32, spike_h: f32) -> Heightmap {
        let mut hmap = Heightmap::from_raw(vec![base; nx * ny], nx, ny, cell_mm);
        let ci = nx / 2;
        let cj = ny / 2;
        hmap.set(ci, cj, base + spike_h);
        hmap
    }

    fn touched_block(ci: usize, cj: usize, radius: usize) -> Vec<(usize, usize)> {
        let mut v = Vec::new();
        for dj in 0..=2 * radius {
            for di in 0..=2 * radius {
                let i = ci + di;
                let j = cj + dj;
                if i >= radius && j >= radius {
                    v.push((i - radius, j - radius));
                }
            }
        }
        v
    }

    #[test]
    fn volume_conservation_after_relax() {
        let nx = 32usize;
        let ny = 32usize;
        let cell_mm = 0.5f32;
        let base = 3.0f32;
        let spike_h = 5.0f32;
        let mut hmap = flat_with_spike(nx, ny, cell_mm, base, spike_h);

        let sum_before: f64 = hmap.as_slice().iter().map(|&v| v as f64).sum();

        let touched = touched_block(nx / 2, ny / 2, 6);
        relax(&mut hmap, &touched, 30.0, 64);

        let sum_after: f64 = hmap.as_slice().iter().map(|&v| v as f64).sum();
        let tol = (nx * ny) as f64 * 1e-5;
        assert!(
            (sum_after - sum_before).abs() < tol,
            "volume changed: before={sum_before}, after={sum_after}, tol={tol}"
        );
    }

    #[test]
    fn slope_bound_after_relax() {
        let nx = 32usize;
        let ny = 32usize;
        let cell_mm = 0.5f32;
        let base = 3.0f32;
        let spike_h = 5.0f32;
        let theta_deg = 30.0f32;
        let mut hmap = flat_with_spike(nx, ny, cell_mm, base, spike_h);

        let radius = 6usize;
        let touched = touched_block(nx / 2, ny / 2, radius);
        relax(&mut hmap, &touched, theta_deg, 64);

        let max_4 = theta_deg.to_radians().tan() * cell_mm;
        let eps = 1e-4f32;

        let mut in_touched = vec![false; nx * ny];
        for &(i, j) in &touched {
            in_touched[j * nx + i] = true;
        }

        // 4-connected bound is universal — holds whether the implementation is 4- or 8-connected.
        // If the implementation is 8-connected, also assert diagonal pairs against
        // `max_4 * sqrt(2)`. (4-connected relaxation can leave diagonals at up to 2*max_4,
        // so don't assert the diagonal bound unconditionally.)
        for j in 0..ny {
            for i in 0..nx {
                if !in_touched[j * nx + i] {
                    continue;
                }
                let h = hmap.get(i, j);
                if i + 1 < nx && in_touched[j * nx + (i + 1)] {
                    let d = (h - hmap.get(i + 1, j)).abs();
                    assert!(d <= max_4 + eps, "4-conn slope {d} > {max_4} at ({i},{j})");
                }
                if j + 1 < ny && in_touched[(j + 1) * nx + i] {
                    let d = (h - hmap.get(i, j + 1)).abs();
                    assert!(d <= max_4 + eps, "4-conn slope {d} > {max_4} at ({i},{j})");
                }
            }
        }
    }

    #[test]
    fn terminates_within_iter_cap() {
        let nx = 64usize;
        let ny = 64usize;
        let cell_mm = 0.5f32;
        let base = 0.0f32;
        // Adversarial: very tall single spike.
        let spike_h = 1000.0f32;
        let mut hmap = flat_with_spike(nx, ny, cell_mm, base, spike_h);

        let touched = touched_block(nx / 2, ny / 2, 8);
        let max_iters = 16usize;
        let iters = relax(&mut hmap, &touched, 30.0, max_iters);
        assert!(
            iters <= max_iters,
            "relax used {iters} iters, exceeds cap {max_iters}"
        );
    }

    #[test]
    fn untouched_region_unchanged() {
        let nx = 64usize;
        let ny = 64usize;
        let cell_mm = 0.5f32;
        let base = 3.0f32;
        let spike_h = 5.0f32;
        let mut hmap = flat_with_spike(nx, ny, cell_mm, base, spike_h);

        // Snapshot a far-away row before relax.
        let far_j = 2usize;
        let row_before: Vec<f32> = (0..nx).map(|i| hmap.get(i, far_j)).collect();

        let touched = touched_block(nx / 2, ny / 2, 6);
        relax(&mut hmap, &touched, 30.0, 64);

        let row_after: Vec<f32> = (0..nx).map(|i| hmap.get(i, far_j)).collect();
        // Compare bit patterns rather than `==` so any change (including NaN/sign-bit flips)
        // is caught.
        assert_eq!(
            f32_bits(&row_before),
            f32_bits(&row_after),
            "untouched far row was modified by relax"
        );
    }

    fn f32_bits(v: &[f32]) -> Vec<u32> {
        v.iter().map(|x| x.to_bits()).collect()
    }
}
