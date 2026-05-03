use crate::{carve::carve_naive, heightmap::Heightmap, parser::MoveEvent};

#[derive(Debug, Clone, Copy)]
pub struct SimConfig {
    pub table_width_mm: f32,
    pub table_height_mm: f32,
    pub cell_mm: f32,
    pub h0_mm: f32,
    pub ball_radius_mm: f32,
    pub default_feedrate_mm_per_min: f32,
    pub interp_fraction: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LoadMode {
    Reset,
    Append,
}

pub struct Sim {
    config: SimConfig,
    hmap: Heightmap,
    ball_x: f32,
    ball_y: f32,
    moves: Vec<MoveEvent>,
    seg_idx: usize,
    /// Sim-time left over from the previous `advance` call that wasn't
    /// large enough to take a full sub-step. Carried into the next call.
    pending_dt: f32,
    loaded: bool,
}

impl Sim {
    pub fn new(config: SimConfig) -> Self {
        let hmap = Heightmap::new(
            config.table_width_mm,
            config.table_height_mm,
            config.cell_mm,
            config.h0_mm,
        );
        let r = config.ball_radius_mm;
        Self {
            config,
            hmap,
            ball_x: r,
            ball_y: r,
            moves: Vec::new(),
            seg_idx: 0,
            pending_dt: 0.0,
            loaded: false,
        }
    }

    pub fn load(&mut self, mut moves: Vec<MoveEvent>, mode: LoadMode) {
        let r = self.config.ball_radius_mm;
        for m in moves.iter_mut() {
            m.x_mm += r;
            m.y_mm += r;
        }
        match mode {
            LoadMode::Reset => {
                self.hmap = Heightmap::new(
                    self.config.table_width_mm,
                    self.config.table_height_mm,
                    self.config.cell_mm,
                    self.config.h0_mm,
                );
                self.ball_x = r;
                self.ball_y = r;
                self.moves = moves;
                self.seg_idx = 0;
                self.pending_dt = 0.0;
            }
            LoadMode::Append => {
                let remaining = self.moves.split_off(self.seg_idx);
                self.moves = remaining;
                self.moves.extend(moves);
                self.seg_idx = 0;
            }
        }
        self.loaded = true;
    }

    pub fn advance(&mut self, dt_seconds: f32) {
        let r = self.config.ball_radius_mm;
        let step_mm = self.config.interp_fraction * self.config.cell_mm;
        let mut remaining_dt = dt_seconds + self.pending_dt;
        self.pending_dt = 0.0;

        while self.seg_idx < self.moves.len() {
            let target = self.moves[self.seg_idx].clone();
            let dx = target.x_mm - self.ball_x;
            let dy = target.y_mm - self.ball_y;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist < 1e-6 {
                carve_naive(&mut self.hmap, self.ball_x, self.ball_y, r);
                self.seg_idx += 1;
                continue;
            }

            let speed = target.feedrate_mm_per_min / 60.0; // mm/s
            let time_to_target = dist / speed;

            if remaining_dt >= time_to_target {
                let n = ((dist / step_mm).ceil() as usize).max(1);
                let start_x = self.ball_x;
                let start_y = self.ball_y;
                for k in 1..=n {
                    let t = k as f32 / n as f32;
                    let cx = start_x + dx * t;
                    let cy = start_y + dy * t;
                    carve_naive(&mut self.hmap, cx, cy, r);
                }
                self.ball_x = target.x_mm;
                self.ball_y = target.y_mm;
                remaining_dt -= time_to_target;
                self.seg_idx += 1;
                continue;
            }

            // Partial-segment branch: take whole sub-steps while we have
            // enough time for them; carry the leftover into pending_dt.
            let step_time = step_mm / speed;
            let mut took_step = false;
            while remaining_dt >= step_time {
                let ddx = target.x_mm - self.ball_x;
                let ddy = target.y_mm - self.ball_y;
                let ddist = (ddx * ddx + ddy * ddy).sqrt();
                if ddist < step_mm {
                    break;
                }
                let ux = ddx / ddist;
                let uy = ddy / ddist;
                self.ball_x += ux * step_mm;
                self.ball_y += uy * step_mm;
                carve_naive(&mut self.hmap, self.ball_x, self.ball_y, r);
                remaining_dt -= step_time;
                took_step = true;
            }
            if !took_step {
                // No progress this call; save the unused time for next call.
                self.pending_dt = remaining_dt;
                return;
            }
        }
    }

    pub fn ball_position_table(&self) -> (f32, f32) {
        (self.ball_x, self.ball_y)
    }

    pub fn heightmap_buffer(&self) -> &[f32] {
        self.hmap.as_slice()
    }

    pub fn is_done(&self) -> bool {
        self.loaded && self.seg_idx >= self.moves.len()
    }

    pub fn nx(&self) -> usize {
        self.hmap.nx()
    }

    pub fn ny(&self) -> usize {
        self.hmap.ny()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> SimConfig {
        SimConfig {
            table_width_mm: 100.0,
            table_height_mm: 80.0,
            cell_mm: 0.5,
            h0_mm: 5.0,
            ball_radius_mm: 5.0,
            default_feedrate_mm_per_min: 1000.0,
            interp_fraction: 0.5,
        }
    }

    #[test]
    fn is_done_false_before_any_load() {
        let sim = Sim::new(cfg());
        assert!(!sim.is_done());
    }

    #[test]
    fn zero_length_move_completes_after_advance() {
        let mut sim = Sim::new(cfg());
        let mv = MoveEvent {
            line: 1,
            x_mm: 0.0,
            y_mm: 0.0,
            feedrate_mm_per_min: 1000.0,
        };
        sim.load(vec![mv], LoadMode::Reset);
        sim.advance(1.0);
        assert!(sim.is_done());
    }

    #[test]
    fn small_dt_calls_accumulate_to_make_progress() {
        // Regression: each advance(dt) used to discard `dt` whenever it was
        // smaller than one sub-step's worth of time, so the ball never moved
        // when stepped at a fast cadence (e.g. ~5 ms ticks).
        let c = cfg();
        let r = c.ball_radius_mm;
        let mut sim = Sim::new(c);
        let mv = MoveEvent {
            line: 1,
            x_mm: 50.0,
            y_mm: 0.0,
            feedrate_mm_per_min: 1000.0, // 16.67 mm/s
        };
        sim.load(vec![mv], LoadMode::Reset);
        let dt = 0.005; // 5 ms — well under one sub-step time
        for _ in 0..400 {
            sim.advance(dt);
        }
        // 400 * 5 ms = 2 s @ 16.67 mm/s = ~33 mm of travel
        let (bx, _) = sim.ball_position_table();
        assert!(
            bx > r + 25.0,
            "ball did not advance under small-dt cadence: bx={bx}",
        );
    }

    #[test]
    fn many_small_dts_complete_segment() {
        let c = cfg();
        let r = c.ball_radius_mm;
        let mut sim = Sim::new(c);
        let mv = MoveEvent {
            line: 1,
            x_mm: 10.0,
            y_mm: 0.0,
            feedrate_mm_per_min: 1000.0,
        };
        sim.load(vec![mv], LoadMode::Reset);
        // Move target = (10 + r, r). Ball starts at (r, r), so distance = 10 mm.
        // At 1000 mm/min = 16.67 mm/s, the move takes ~0.6 s.
        // 1000 * 1 ms = 1 s of sim time should be more than enough.
        for _ in 0..1000 {
            sim.advance(0.001);
        }
        assert!(sim.is_done(), "sim should have completed the move");
    }

    #[test]
    fn ball_position_unchanged_after_zero_length_move() {
        let c = cfg();
        let r = c.ball_radius_mm;
        let mut sim = Sim::new(c);
        let mv = MoveEvent {
            line: 1,
            x_mm: 0.0,
            y_mm: 0.0,
            feedrate_mm_per_min: 1000.0,
        };
        sim.load(vec![mv], LoadMode::Reset);
        sim.advance(0.5);
        assert_eq!(sim.ball_position_table(), (r, r));
    }
}
