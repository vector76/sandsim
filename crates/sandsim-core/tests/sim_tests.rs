use sandsim_core::{
    carve::carve_naive,
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
fn stationary_ball_matches_direct_carve() {
    let c = cfg();
    let r = c.ball_radius_mm;

    let mut sim = Sim::new(c);
    sim.load(vec![move_at(0.0, 0.0, 1000.0)], LoadMode::Reset);
    sim.advance(1.0);

    let mut reference = Heightmap::new(c.table_width_mm, c.table_height_mm, c.cell_mm, c.h0_mm);
    carve_naive(&mut reference, r, r, r);

    assert_eq!(sim.heightmap_buffer(), reference.as_slice());
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

    // Sample x from just after start through just before end so endpoints don't introduce off-by-one.
    let mut x = r + 0.5;
    while x < r + length - 0.5 {
        let (i, j) = probe.world_to_cell(x, r);
        let h = buf[j * nx + i];
        assert!(
            h < c.h0_mm,
            "expected carved cell at ({}, {}) below h0; got h={}",
            x,
            r,
            h
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

    // Walk along horizontal center line (y = r + 20 = 25 in table frame).
    let mut x = r + 0.5;
    while x < r + len - 0.5 {
        let (i, j) = probe.world_to_cell(x, r + 20.0);
        let h = buf[j * nx + i];
        assert!(h < c.h0_mm, "horizontal gap at x={}", x);
        x += c.cell_mm;
    }
    // Walk along vertical center line (x = r + 20 = 25 in table frame).
    let mut y = r + 0.5;
    while y < r + len - 0.5 {
        let (i, j) = probe.world_to_cell(r + 20.0, y);
        let h = buf[j * nx + i];
        assert!(h < c.h0_mm, "vertical gap at y={}", y);
        y += c.cell_mm;
    }

    // Intersection cell must be carved.
    let (i, j) = probe.world_to_cell(r + 20.0, r + 20.0);
    let h = buf[j * nx + i];
    assert!(h < c.h0_mm, "intersection not carved: h={}", h);
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
