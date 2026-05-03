pub struct Heightmap {
    data: Vec<f32>,
    nx: usize,
    ny: usize,
    cell_mm: f32,
}

impl Heightmap {
    pub fn new(table_width_mm: f32, table_height_mm: f32, cell_mm: f32, h0: f32) -> Self {
        let nx = (table_width_mm / cell_mm).ceil() as usize;
        let ny = (table_height_mm / cell_mm).ceil() as usize;
        Self {
            data: vec![h0; nx * ny],
            nx,
            ny,
            cell_mm,
        }
    }

    pub fn from_raw(data: Vec<f32>, nx: usize, ny: usize, cell_mm: f32) -> Self {
        Self { data, nx, ny, cell_mm }
    }

    pub fn idx(&self, i: usize, j: usize) -> usize {
        assert!(
            i < self.nx && j < self.ny,
            "Heightmap index out of bounds: ({i}, {j}) for grid ({} x {})",
            self.nx,
            self.ny
        );
        j * self.nx + i
    }

    pub fn get(&self, i: usize, j: usize) -> f32 {
        let idx = self.idx(i, j);
        self.data[idx]
    }

    pub fn set(&mut self, i: usize, j: usize, v: f32) {
        let idx = self.idx(i, j);
        self.data[idx] = v;
    }

    pub fn world_to_cell(&self, x_mm: f32, y_mm: f32) -> (usize, usize) {
        let i = ((x_mm / self.cell_mm).floor() as usize).min(self.nx - 1);
        let j = ((y_mm / self.cell_mm).floor() as usize).min(self.ny - 1);
        (i, j)
    }

    pub fn cell_center(&self, i: usize, j: usize) -> (f32, f32) {
        (
            (i as f32 + 0.5) * self.cell_mm,
            (j as f32 + 0.5) * self.cell_mm,
        )
    }

    pub fn as_slice(&self) -> &[f32] {
        &self.data
    }

    pub fn nx(&self) -> usize {
        self.nx
    }

    pub fn ny(&self) -> usize {
        self.ny
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grid_dimensions_300x200_at_half_mm() {
        let hm = Heightmap::new(300.0, 200.0, 0.5, 0.0);
        assert_eq!(hm.nx(), 600);
        assert_eq!(hm.ny(), 400);
    }

    #[test]
    fn flat_init_all_cells_equal_h0() {
        let h0 = 42.5;
        let hm = Heightmap::new(100.0, 80.0, 1.0, h0);
        assert!(hm.as_slice().iter().all(|&v| v == h0));
    }

    #[test]
    fn world_to_cell_then_cell_center_round_trips() {
        let cell_mm = 0.5;
        let hm = Heightmap::new(300.0, 200.0, cell_mm, 0.0);
        let points = [(0.0f32, 0.0f32), (1.3, 2.7), (149.9, 99.9), (299.0, 199.0)];
        for (x, y) in points {
            let (i, j) = hm.world_to_cell(x, y);
            let (cx, cy) = hm.cell_center(i, j);
            assert!(
                (cx - x).abs() <= cell_mm / 2.0 + 1e-4,
                "x={x} -> cell_center_x={cx}, diff={}",
                (cx - x).abs()
            );
            assert!(
                (cy - y).abs() <= cell_mm / 2.0 + 1e-4,
                "y={y} -> cell_center_y={cy}, diff={}",
                (cy - y).abs()
            );
        }
    }

    #[test]
    fn idx_corners() {
        let hm = Heightmap::new(10.0, 8.0, 1.0, 0.0);
        assert_eq!(hm.idx(0, 0), 0);
        assert_eq!(hm.idx(hm.nx() - 1, hm.ny() - 1), hm.nx() * hm.ny() - 1);
    }
}
