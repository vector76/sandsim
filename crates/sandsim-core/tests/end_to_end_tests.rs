use sandsim_core::{
    heightmap::Heightmap,
    parser::{parse, ParserConfig},
    sim::{LoadMode, Sim, SimConfig},
};

const SQUARE_GCODE: &str = include_str!("../../../tests/fixtures/square.gcode");

#[test]
fn square_gcode_produces_grooves_and_piles_with_volume_conservation() {
    let cfg = SimConfig {
        table_width_mm: 300.0,
        table_height_mm: 200.0,
        ball_radius_mm: 5.0,
        h0_mm: 3.0,
        cell_mm: 1.0,
        interp_fraction: 1.0,
        theta_repose_deg: 30.0,
        n_segments: 8,
        repose_max_iters: 16,
        default_feedrate_mm_per_min: 1000.0,
    };

    let parser_cfg = ParserConfig {
        table_width_mm: cfg.table_width_mm,
        table_height_mm: cfg.table_height_mm,
        ball_radius_mm: cfg.ball_radius_mm,
        default_feedrate_mm_per_min: cfg.default_feedrate_mm_per_min,
    };
    let parsed = parse(SQUARE_GCODE, &parser_cfg);
    assert!(
        parsed.warnings.is_empty(),
        "unexpected parser warnings: {:?}",
        parsed.warnings
    );

    let mut sim = Sim::new(cfg);
    sim.load(parsed.moves, LoadMode::Reset);

    // One large slice should consume the whole program; loop defensively in
    // case `advance` ever caps the per-call work.
    for _ in 0..8 {
        if sim.is_done() {
            break;
        }
        sim.advance(1.0e6);
    }
    assert!(sim.is_done(), "sim did not finish after large advance");

    let buf = sim.heightmap_buffer();
    let nx = sim.nx();
    let ny = sim.ny();
    assert_eq!(buf.len(), nx * ny);

    // Volume conservation: total sand volume should match the initial slab to
    // within ~0.5% (carve+repose only redistributes, never sources/sinks).
    let cell_area = cfg.cell_mm * cfg.cell_mm;
    let total_volume: f64 = buf.iter().map(|&h| h as f64).sum::<f64>() * cell_area as f64;
    let expected_volume =
        cfg.h0_mm as f64 * cfg.table_width_mm as f64 * cfg.table_height_mm as f64;
    let rel_err = (total_volume - expected_volume).abs() / expected_volume;
    assert!(
        rel_err < 0.005,
        "volume not conserved: total={}, expected={}, rel_err={}",
        total_volume,
        expected_volume,
        rel_err
    );

    let probe = Heightmap::new(cfg.table_width_mm, cfg.table_height_mm, cfg.cell_mm, cfg.h0_mm);
    let h_at = |x: f32, y: f32| -> f32 {
        let (i, j) = probe.world_to_cell(x, y);
        buf[j * nx + i]
    };

    // Carve check: in table frame the path's top edge runs from (100, 50) to
    // (200, 50). Sample the centerline well away from the corners — it should
    // be carved below h0.
    let carved = h_at(150.0, 50.0);
    assert!(
        carved < cfg.h0_mm,
        "expected carved cell on top edge centerline below h0; got {}",
        carved
    );

    // Pile check: just outside the carve swath (ball radius 5, so swath is
    // y ∈ [45, 55] along the top edge). Cells at y ≈ 44 should hold the
    // displaced material. Probe a few candidates and require at least one
    // above h0 — exact location depends on repose redistribution.
    let pile_candidates = [
        (110.0, 44.0),
        (130.0, 44.0),
        (150.0, 44.0),
        (170.0, 44.0),
        (190.0, 44.0),
    ];
    let max_pile = pile_candidates
        .iter()
        .map(|&(x, y)| h_at(x, y))
        .fold(f32::NEG_INFINITY, f32::max);
    assert!(
        max_pile > cfg.h0_mm,
        "no pile cell above h0 along top edge; max={}",
        max_pile
    );
}
