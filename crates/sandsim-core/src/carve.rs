use crate::heightmap::Heightmap;

pub struct Footprint {
    pub r_mm: f32,
    pub cell_mm: f32,
    pub n_segments: usize,
    pub inner_offsets: Vec<(i32, i32)>,
    pub z_under: Vec<f32>,
    pub inner_segment: Vec<usize>,
    pub inner_by_segment: Vec<Vec<usize>>,
    pub spill_by_segment: Vec<Vec<(i32, i32)>>,
}

impl Footprint {
    pub fn new(r_mm: f32, cell_mm: f32, n_segments: usize) -> Self {
        assert!(n_segments > 0);
        assert!(r_mm > 0.0);
        assert!(cell_mm > 0.0);

        let r2 = r_mm * r_mm;
        let kmax = (r_mm / cell_mm).ceil() as i32 + 1;

        let two_pi = 2.0 * std::f32::consts::PI;
        let segment_for = |di: i32, dj: i32| -> usize {
            let a = (dj as f32).atan2(di as f32);
            let s = ((a + std::f32::consts::PI) / two_pi * n_segments as f32).floor() as i32;
            s.max(0).min(n_segments as i32 - 1) as usize
        };

        let mut inner_offsets: Vec<(i32, i32)> = Vec::new();
        let mut z_under: Vec<f32> = Vec::new();
        let mut inner_segment: Vec<usize> = Vec::new();
        let mut inner_by_segment: Vec<Vec<usize>> = vec![Vec::new(); n_segments];

        for dj in -kmax..=kmax {
            for di in -kmax..=kmax {
                let dx = di as f32 * cell_mm;
                let dy = dj as f32 * cell_mm;
                let d2 = dx * dx + dy * dy;
                if d2 <= r2 {
                    let idx = inner_offsets.len();
                    inner_offsets.push((di, dj));
                    z_under.push(-(r2 - d2).max(0.0).sqrt());
                    let seg = segment_for(di, dj);
                    inner_segment.push(seg);
                    inner_by_segment[seg].push(idx);
                }
            }
        }

        for seg in inner_by_segment.iter_mut() {
            seg.sort_by(|&a, &b| {
                let (ai, aj) = inner_offsets[a];
                let (bi, bj) = inner_offsets[b];
                let da2 = ai * ai + aj * aj;
                let db2 = bi * bi + bj * bj;
                da2.cmp(&db2)
            });
        }

        let inner_set: std::collections::HashSet<(i32, i32)> =
            inner_offsets.iter().copied().collect();
        let mut spill_by_segment: Vec<Vec<(i32, i32)>> = vec![Vec::new(); n_segments];
        for dj in -kmax..=kmax {
            for di in -kmax..=kmax {
                let dx = di as f32 * cell_mm;
                let dy = dj as f32 * cell_mm;
                let d2 = dx * dx + dy * dy;
                if d2 > r2 {
                    let has_inner_nbr = inner_set.contains(&(di + 1, dj))
                        || inner_set.contains(&(di - 1, dj))
                        || inner_set.contains(&(di, dj + 1))
                        || inner_set.contains(&(di, dj - 1));
                    if has_inner_nbr {
                        let seg = segment_for(di, dj);
                        spill_by_segment[seg].push((di, dj));
                    }
                }
            }
        }

        Self {
            r_mm,
            cell_mm,
            n_segments,
            inner_offsets,
            z_under,
            inner_segment,
            inner_by_segment,
            spill_by_segment,
        }
    }
}

pub fn carve_naive(hmap: &mut Heightmap, cx_mm: f32, cy_mm: f32, r_mm: f32) {
    let (i_min, j_min) = hmap.world_to_cell(cx_mm - r_mm, cy_mm - r_mm);
    let (i_max, j_max) = hmap.world_to_cell(cx_mm + r_mm, cy_mm + r_mm);

    let r2 = r_mm * r_mm;
    for j in j_min..=j_max {
        for i in i_min..=i_max {
            let (ccx, ccy) = hmap.cell_center(i, j);
            let dx = ccx - cx_mm;
            let dy = ccy - cy_mm;
            let d2 = dx * dx + dy * dy;
            if d2 <= r2 {
                let z_under = r_mm - (r2 - d2).sqrt();
                let current = hmap.get(i, j);
                if z_under < current {
                    hmap.set(i, j, z_under);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deepest_point_at_cell_center_is_zero() {
        let cell_mm = 0.5;
        let mut hmap = Heightmap::new(20.0, 20.0, cell_mm, 10.0);
        let r_mm = 5.0;
        // cell (10, 10) has center (5.25, 5.25) — place ball center exactly there.
        carve_naive(&mut hmap, 5.25, 5.25, r_mm);
        assert_eq!(hmap.get(10, 10), 0.0);
    }

    #[test]
    fn carving_twice_is_idempotent() {
        let cell_mm = 0.5;
        let mut a = Heightmap::new(20.0, 20.0, cell_mm, 10.0);
        let mut b = Heightmap::new(20.0, 20.0, cell_mm, 10.0);
        carve_naive(&mut a, 5.25, 5.25, 5.0);
        carve_naive(&mut b, 5.25, 5.25, 5.0);
        carve_naive(&mut b, 5.25, 5.25, 5.0);
        assert_eq!(a.as_slice(), b.as_slice());
    }

    #[test]
    fn cells_outside_footprint_unchanged() {
        let cell_mm = 0.5;
        let h0 = 10.0;
        let mut hmap = Heightmap::new(40.0, 40.0, cell_mm, h0);
        let cx = 10.0;
        let cy = 10.0;
        let r_mm = 3.0;
        carve_naive(&mut hmap, cx, cy, r_mm);

        // Pick a cell whose center is clearly farther than r + cell_mm from the ball center.
        let (fi, fj) = hmap.world_to_cell(20.0, 20.0);
        let (ccx, ccy) = hmap.cell_center(fi, fj);
        let dist = ((ccx - cx).powi(2) + (ccy - cy).powi(2)).sqrt();
        assert!(dist > r_mm + cell_mm);
        assert_eq!(hmap.get(fi, fj), h0);
    }

    #[test]
    fn footprint_inner_cell_count_in_ballpark() {
        let r = 5.0_f32;
        let cell = 0.5_f32;
        let fp = Footprint::new(r, cell, 8);
        let expected = std::f32::consts::PI * r * r / (cell * cell);
        let actual = fp.inner_offsets.len() as f32;
        let lo = expected * 0.9;
        let hi = expected * 1.1;
        assert!(
            actual >= lo && actual <= hi,
            "inner count {actual} not within 10% of {expected}"
        );
    }

    #[test]
    fn footprint_inner_and_spill_disjoint_and_partitioned() {
        let r = 5.0_f32;
        let cell = 0.5_f32;
        let r2 = r * r;
        let fp = Footprint::new(r, cell, 8);

        let inner_set: std::collections::HashSet<(i32, i32)> =
            fp.inner_offsets.iter().copied().collect();
        assert_eq!(inner_set.len(), fp.inner_offsets.len(), "duplicate inner offsets");

        for &(di, dj) in &fp.inner_offsets {
            let d2 = (di as f32 * cell).powi(2) + (dj as f32 * cell).powi(2);
            assert!(d2 <= r2 + 1e-6, "inner cell ({di},{dj}) violates disk inequality");
        }

        let mut spill_seen: std::collections::HashSet<(i32, i32)> = std::collections::HashSet::new();
        for spill in &fp.spill_by_segment {
            for &off in spill {
                let (di, dj) = off;
                let d2 = (di as f32 * cell).powi(2) + (dj as f32 * cell).powi(2);
                assert!(d2 > r2, "spill cell ({di},{dj}) is inside disk");
                assert!(!inner_set.contains(&off), "spill cell ({di},{dj}) overlaps inner");
                assert!(spill_seen.insert(off), "duplicate spill cell ({di},{dj})");
            }
        }
    }

    #[test]
    fn footprint_z_under_matches_disk_floor() {
        let r = 5.0_f32;
        let cell = 0.5_f32;
        let fp = Footprint::new(r, cell, 8);
        for (k, &(di, dj)) in fp.inner_offsets.iter().enumerate() {
            let dx = di as f32 * cell;
            let dy = dj as f32 * cell;
            let expected = -(r * r - dx * dx - dy * dy).max(0.0).sqrt();
            assert!(
                (fp.z_under[k] - expected).abs() < 1e-5,
                "z_under mismatch at ({di},{dj}): {} vs {}",
                fp.z_under[k],
                expected
            );
            assert!(fp.z_under[k] <= 0.0);
        }
    }

    #[test]
    fn footprint_inner_by_segment_sorted_by_distance() {
        let fp = Footprint::new(5.0, 0.5, 8);
        for (s, indices) in fp.inner_by_segment.iter().enumerate() {
            let mut prev_d2: i32 = -1;
            for &idx in indices {
                let (di, dj) = fp.inner_offsets[idx];
                let d2 = di * di + dj * dj;
                assert!(d2 >= prev_d2, "segment {s} not monotonic in distance");
                prev_d2 = d2;
            }
        }
    }

    // ---- Phase C.1 contract tests --------------------------------------
    //
    // These tests codify what the segmented carve & deposit kernel from
    // docs/sand-model.md must do. They run against the placeholder
    // `carve_naive` (which loses volume and never deposits) so they fail
    // here on purpose — that's the "red" half of the red/green motion the
    // phase-C plan calls out. They are #[ignore]d so the workspace stays
    // green between beads; remove the ignore once the segmented kernel
    // lands and the same assertions should turn green without edits.

    fn total_volume(hmap: &Heightmap) -> f64 {
        let cell_area = (hmap.cell_mm() as f64).powi(2);
        let sum: f64 = hmap.as_slice().iter().map(|&v| v as f64).sum();
        sum * cell_area
    }

    #[test]
    #[ignore = "drives the C.1 rewrite; passes once the segmented kernel lands"]
    fn volume_conservation_single_carve() {
        let cell_mm = 0.5_f32;
        let h0 = 5.0_f32;
        let r_mm = 3.0_f32;
        let mut hmap = Heightmap::new(15.0, 15.0, cell_mm, h0);

        let initial_vol = total_volume(&hmap);
        carve_naive(&mut hmap, 7.75, 7.75, r_mm);
        let final_vol = total_volume(&hmap);

        let tol = 1e-3 * initial_vol;
        assert!(
            (final_vol - initial_vol).abs() < tol,
            "volume not conserved: initial={initial_vol:.6}, final={final_vol:.6}, \
             diff={:.6}, tol={tol:.6}",
            final_vol - initial_vol
        );
    }

    #[test]
    #[ignore = "drives the C.1 rewrite; passes once the segmented kernel lands"]
    fn per_segment_trough_no_backfill() {
        let cell_mm = 0.5_f32;
        let h0 = 5.0_f32;
        let r_mm = 3.0_f32;
        let mut hmap = Heightmap::new(15.0, 15.0, cell_mm, h0);
        let cx = 7.75_f32;
        let cy = 7.75_f32;
        let (bi, bj) = hmap.world_to_cell(cx, cy);

        // Pre-carve every footprint cell the segmented kernel will assign
        // to the rear segment (segment 7 with N=8 — the wedge biased
        // toward -x). With the entire segment pre-carved below z_under,
        // the carve pass yields V_seg = 0 there, and the deposit pass
        // must add nothing back into the trough.
        let fp = Footprint::new(r_mm, cell_mm, 8);
        let trough_depth = 0.0_f32;
        let trough_cells: Vec<(usize, usize)> = fp.inner_by_segment[7]
            .iter()
            .map(|&idx| {
                let (di, dj) = fp.inner_offsets[idx];
                ((bi as i32 + di) as usize, (bj as i32 + dj) as usize)
            })
            .collect();
        assert!(!trough_cells.is_empty(), "rear segment unexpectedly empty");
        for &(i, j) in &trough_cells {
            hmap.set(i, j, trough_depth);
        }

        let initial_vol = total_volume(&hmap);
        carve_naive(&mut hmap, cx, cy, r_mm);

        for &(i, j) in &trough_cells {
            assert_eq!(
                hmap.get(i, j),
                trough_depth,
                "trough cell ({i},{j}) was modified to {}",
                hmap.get(i, j)
            );
        }

        // Volume from the front segments must show up as deposit (inner
        // fill or spill ring) elsewhere, never disappear.
        let final_vol = total_volume(&hmap);
        let tol = 1e-3 * initial_vol;
        assert!(
            (final_vol - initial_vol).abs() < tol,
            "volume not conserved: initial={initial_vol:.6}, final={final_vol:.6}, \
             diff={:.6}, tol={tol:.6}",
            final_vol - initial_vol
        );
    }

    #[test]
    #[ignore = "drives the C.1 rewrite; passes once the segmented kernel lands"]
    fn stationary_ring_symmetry() {
        let cell_mm = 0.5_f32;
        let h0 = 5.0_f32;
        let r_mm = 3.0_f32;
        let mut hmap = Heightmap::new(15.0, 15.0, cell_mm, h0);
        let cx = 7.75_f32;
        let cy = 7.75_f32;
        let (bi, bj) = hmap.world_to_cell(cx, cy);

        let fp = Footprint::new(r_mm, cell_mm, 8);
        carve_naive(&mut hmap, cx, cy, r_mm);

        // For uniform input, the deposit pass finds no room within inner
        // (every inner cell sits exactly at z_under after carve), so each
        // segment's V_seg overflows entirely onto its spill ring. Sum the
        // per-cell excess height per octant.
        let mut sums: Vec<f64> = vec![0.0; fp.n_segments];
        for (s, spill) in fp.spill_by_segment.iter().enumerate() {
            for &(di, dj) in spill {
                let i = (bi as i32 + di) as usize;
                let j = (bj as i32 + dj) as usize;
                sums[s] += (hmap.get(i, j) - h0) as f64;
            }
        }
        let avg = sums.iter().sum::<f64>() / fp.n_segments as f64;

        assert!(
            avg > 1e-6,
            "spill ring received no deposit (avg={avg}); kernel must \
             distribute V_seg overflow onto spill[s]"
        );

        // The 0.5 mm grid plus the seg_for atan2 boundary policy (in
        // particular the `-x` axis cells clamped from segment 8 down to
        // 7) make per-octant inner-cell counts uneven by construction —
        // for r=3, cell=0.5 they range from 9 (seg 0) to 19 (seg 7), so
        // V_seg[s] and the resulting spill sums differ by up to ~2.2x.
        // Allow `max - min < avg`: tight enough to flag a kernel that
        // dumps everything in one wedge, loose enough to accommodate the
        // existing Footprint geometry.
        let max = sums.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let min = sums.iter().copied().fold(f64::INFINITY, f64::min);
        let tol = avg;
        assert!(
            max - min < tol,
            "per-octant spill sums uneven: min={min}, max={max}, avg={avg}, \
             tol={tol}, sums={sums:?}"
        );
    }

    #[test]
    #[ignore = "drives the C.1 rewrite; passes once the segmented kernel lands"]
    fn cavity_fill_no_overflow() {
        let cell_mm = 0.5_f32;
        let h0 = 5.0_f32;
        let r_mm = 3.0_f32;
        let mut hmap = Heightmap::new(15.0, 15.0, cell_mm, h0);
        let cx = 7.75_f32;
        let cy = 7.75_f32;
        let (bi, bj) = hmap.world_to_cell(cx, cy);

        // Drop every footprint cell within r_mm/2 of ball center to a
        // very negative height, giving each segment far more "room"
        // inside its inner cells than its V_seg can fill. The segmented
        // kernel must consume V_seg entirely within the inner walk and
        // never spill onto the ring.
        let fp = Footprint::new(r_mm, cell_mm, 8);
        let cavity_depth = -100.0_f32;
        let cavity_cell_radius = (r_mm * 0.5) / cell_mm;
        let cavity_cell_radius_sq = cavity_cell_radius * cavity_cell_radius;
        for &(di, dj) in &fp.inner_offsets {
            let d2 = (di * di + dj * dj) as f32;
            if d2 <= cavity_cell_radius_sq {
                let i = (bi as i32 + di) as usize;
                let j = (bj as i32 + dj) as usize;
                hmap.set(i, j, cavity_depth);
            }
        }

        let initial_vol = total_volume(&hmap);

        // Snapshot every cell whose center lies outside the analytical
        // disk — none of these may change.
        let r2 = r_mm * r_mm;
        let mut outside: Vec<((usize, usize), f32)> = Vec::new();
        for j in 0..hmap.ny() {
            for i in 0..hmap.nx() {
                let (ccx, ccy) = hmap.cell_center(i, j);
                let d2 = (ccx - cx).powi(2) + (ccy - cy).powi(2);
                if d2 > r2 {
                    outside.push(((i, j), hmap.get(i, j)));
                }
            }
        }

        carve_naive(&mut hmap, cx, cy, r_mm);

        for &((i, j), v) in &outside {
            assert_eq!(
                hmap.get(i, j),
                v,
                "cell ({i},{j}) outside analytical footprint changed: \
                 {v} -> {}",
                hmap.get(i, j)
            );
        }

        let final_vol = total_volume(&hmap);
        let tol = 1e-3 * initial_vol.abs();
        assert!(
            (final_vol - initial_vol).abs() < tol,
            "volume not conserved: initial={initial_vol:.6}, final={final_vol:.6}, \
             diff={:.6}, tol={tol:.6}",
            final_vol - initial_vol
        );
    }

    #[test]
    fn footprint_segments_roughly_balanced() {
        let fp = Footprint::new(5.0, 0.5, 8);
        let total: usize = fp.inner_by_segment.iter().map(|v| v.len()).sum();
        assert_eq!(total, fp.inner_offsets.len());
        let avg = total as f32 / fp.n_segments as f32;
        for (s, seg) in fp.inner_by_segment.iter().enumerate() {
            assert!(!seg.is_empty(), "segment {s} is empty");
            let c = seg.len() as f32;
            assert!(
                c > avg * 0.5 && c < avg * 1.5,
                "segment {s} count {c} far from average {avg}"
            );
        }
        for (s, spill) in fp.spill_by_segment.iter().enumerate() {
            assert!(!spill.is_empty(), "spill segment {s} is empty");
        }
    }
}
