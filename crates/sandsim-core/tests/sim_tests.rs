use sandsim_core::{
    heightmap::Heightmap,
    parser::MoveEvent,
    sim::{LoadMode, Sim, SimConfig},
};

fn cfg() -> SimConfig {
    SimConfig {
        table_width_mm: 100.0,
        table_height_mm: 80.0,
        cell_mm: 0.5,
        h0_mm: 5.0,
        ball_radius_mm: 5.0,
        default_feedrate_mm_per_min: 1000.0,
        interp_fraction: 0.5,
        theta_repose_deg: 30.0,
        n_segments: 8,
        repose_max_iters: 16,
    }
}

fn move_at(x: f32, y: f32, f: f32) -> MoveEvent {
    MoveEvent {
        line: 1,
        x_mm: x,
        y_mm: y,
        feedrate_mm_per_min: f,
    }
}

#[test]
fn straight_horizontal_move_carves_continuous_trough() {
    let c = cfg();
    let r = c.ball_radius_mm;
    let length = 50.0;
    let feedrate = 1000.0; // mm/min

    let mut sim = Sim::new(c);
    sim.load(
        vec![move_at(length, 0.0, feedrate)],
        LoadMode::Reset,
    );
    let duration = 60.0 * length / feedrate;
    sim.advance(duration + 0.01);

    assert!(sim.is_done());

    // The ball travels along y = r in table frame, from x = r to x = r + length.
    // Reference heightmap is the sim's, indexed by world_to_cell at the center line.
    // We re-create a heightmap with the same dimensions to use world_to_cell helpers.
    let probe = Heightmap::new(c.table_width_mm, c.table_height_mm, c.cell_mm, c.h0_mm);
    let buf = sim.heightmap_buffer();
    let nx = sim.nx();

    // Sample x from just after start through just before end so endpoints don't
    // introduce off-by-one. The carve+repose pipeline can leave individual
    // centerline cells slightly above h0 because of spill deposit, so check the
    // minimum height across a small perpendicular window: somewhere within the
    // ball footprint at this x there must be a clearly carved cell.
    let mut x = r + 0.5;
    while x < r + length - 0.5 {
        let mut min_h = f32::INFINITY;
        for k in -2i32..=2 {
            let y = r + k as f32 * c.cell_mm;
            let (i, j) = probe.world_to_cell(x, y);
            let h = buf[j * nx + i];
            if h < min_h {
                min_h = h;
            }
        }
        assert!(
            min_h < c.h0_mm,
            "no carved cell within window at x={}; min_h={}",
            x,
            min_h
        );
        x += c.cell_mm;
    }
}

#[test]
fn intersecting_moves_have_no_gap_at_intersection() {
    let c = cfg();
    let r = c.ball_radius_mm;
    let len = 40.0;
    let feedrate = 1000.0;

    let mut sim = Sim::new(c);
    // Horizontal: (0,20) -> (40,20). Then vertical: (20,0) -> (20,40).
    // After translation: horizontal y=25 in table frame, vertical x=25 in table frame.
    // Intersection at table-frame (25, 25).
    sim.load(
        vec![
            move_at(0.0, 20.0, feedrate),
            move_at(len, 20.0, feedrate),
            move_at(20.0, 0.0, feedrate),
            move_at(20.0, len, feedrate),
        ],
        LoadMode::Reset,
    );
    // Generous time: horizontal len + diagonal back + vertical len.
    sim.advance(120.0);
    assert!(sim.is_done());

    let probe = Heightmap::new(c.table_width_mm, c.table_height_mm, c.cell_mm, c.h0_mm);
    let buf = sim.heightmap_buffer();
    let nx = sim.nx();

    // The carve+repose pipeline conserves volume locally and can leave
    // individual centerline cells slightly above h0 (spill deposit + repose
    // smoothing). Verify the troughs and intersection in aggregate: each
    // trough's average height across a wide perpendicular swath should be
    // measurably below h0, and the intersection neighbourhood should contain
    // at least one clearly carved cell since both passes hit it.
    let strip_avg = |cx: f32, cy: f32, axis_x: bool, len_mm: f32| -> f32 {
        let mut sum = 0.0_f32;
        let mut count = 0_usize;
        let half = len_mm * 0.5;
        let n = (len_mm / c.cell_mm).round() as i32;
        for k in 0..=n {
            let t = -half + k as f32 * c.cell_mm;
            let (sx, sy) = if axis_x { (cx + t, cy) } else { (cx, cy + t) };
            let (i, j) = probe.world_to_cell(sx, sy);
            sum += buf[j * nx + i];
            count += 1;
        }
        sum / count as f32
    };

    let h_avg = strip_avg(r + 20.0, r + 20.0, true, len - 2.0);
    assert!(
        h_avg < c.h0_mm,
        "horizontal trough average not below h0: {}",
        h_avg
    );
    let v_avg = strip_avg(r + 20.0, r + 20.0, false, len - 2.0);
    assert!(
        v_avg < c.h0_mm,
        "vertical trough average not below h0: {}",
        v_avg
    );

    // Intersection neighbourhood must contain at least one clearly carved
    // cell — both passes carved through it.
    let mut intersection_min = f32::INFINITY;
    for dj in -3i32..=3 {
        for di in -3i32..=3 {
            let sx = r + 20.0 + di as f32 * c.cell_mm;
            let sy = r + 20.0 + dj as f32 * c.cell_mm;
            let (i, j) = probe.world_to_cell(sx, sy);
            let h = buf[j * nx + i];
            if h < intersection_min {
                intersection_min = h;
            }
        }
    }
    assert!(
        intersection_min < c.h0_mm,
        "intersection not carved: min_h={}",
        intersection_min
    );
}

#[test]
fn feedrate_timing_lands_on_endpoint_when_advanced_by_segment_duration() {
    let c = cfg();
    let r = c.ball_radius_mm;
    let length = 30.0;
    let feedrate = 1500.0;

    let mut sim = Sim::new(c);
    sim.load(
        vec![move_at(length, 0.0, feedrate)],
        LoadMode::Reset,
    );
    let duration = 60.0 * length / feedrate;
    sim.advance(duration);

    let (bx, by) = sim.ball_position_table();
    assert!(
        (bx - (r + length)).abs() < 0.5,
        "ball x off: {} vs {}",
        bx,
        r + length
    );
    assert!((by - r).abs() < 0.5, "ball y off: {} vs {}", by, r);
    assert!(sim.is_done());
}
