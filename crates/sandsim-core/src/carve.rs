use crate::heightmap::Heightmap;

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
}
