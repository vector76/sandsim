use std::f32::consts::PI;

use sandsim_core::generators::{rose_gcode, spiral_gcode, RoseParams, SpiralParams};
use sandsim_core::parser::{parse, ParserConfig};

fn cfg() -> ParserConfig {
    ParserConfig {
        gcode_width_mm: 300.0,
        gcode_height_mm: 200.0,
        ball_radius_mm: 5.0,
        default_feedrate_mm_per_min: 1000.0,
    }
}

fn spiral_params() -> SpiralParams {
    SpiralParams {
        centre_offset: (0.0, 0.0),
        max_radius_mm: 80.0,
        pitch_mm: 10.0,
        sample_spacing_mm: 2.0,
        feedrate_mm_per_min: 1500.0,
    }
}

fn rose_params() -> RoseParams {
    RoseParams {
        centre_offset: (0.0, 0.0),
        max_radius_mm: 60.0,
        petal_count: 5,
        sample_spacing_mm: 2.0,
        feedrate_mm_per_min: 1200.0,
    }
}

#[test]
fn spiral_round_trips_with_no_warnings() {
    let c = cfg();
    let g = spiral_gcode(&c, spiral_params());
    let out = parse(&g, &c);
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
}

#[test]
fn rose_round_trips_with_no_warnings() {
    let c = cfg();
    let g = rose_gcode(&c, rose_params());
    let out = parse(&g, &c);
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
}

#[test]
fn spiral_move_count_in_expected_range() {
    let c = cfg();
    let p = spiral_params();
    let g = spiral_gcode(&c, p);
    let out = parse(&g, &c);

    // Archimedean spiral arc length ≈ π·r² / pitch; sample count ≈ length / spacing.
    let r = p.max_radius_mm;
    let expected = (PI * r * r) / (p.sample_spacing_mm * p.pitch_mm);
    let lower = (0.5 * expected) as usize;
    let upper = (2.0 * expected) as usize;
    let n = out.moves.len();
    assert!(
        n >= lower && n <= upper,
        "spiral move count {} outside [{}, {}] (expected ≈ {:.0})",
        n,
        lower,
        upper,
        expected
    );
}

#[test]
fn rose_move_count_in_expected_range() {
    let c = cfg();
    let p = rose_params();
    let g = rose_gcode(&c, p);
    let out = parse(&g, &c);

    // A k-petal rose has per-petal arc length ≈ 2·a (empirically slightly
    // above 2·a for moderate k); total ≈ 2·a·k, divided by spacing for the
    // sample count. Bounds widened to 0.5x..3x to absorb the elliptic-integral
    // dependence on k.
    let a = p.max_radius_mm;
    let k = p.petal_count as f32;
    let expected = (2.0 * a * k) / p.sample_spacing_mm;
    let lower = (0.5 * expected) as usize;
    let upper = (3.0 * expected) as usize;
    let n = out.moves.len();
    assert!(
        n >= lower && n <= upper,
        "rose move count {} outside [{}, {}] (expected ≈ {:.0})",
        n,
        lower,
        upper,
        expected
    );
}

#[test]
fn spiral_endpoints_inside_reachable_region() {
    let c = cfg();
    let g = spiral_gcode(&c, spiral_params());
    let out = parse(&g, &c);
    let max_x = c.reachable_max_x();
    let max_y = c.reachable_max_y();
    for m in &out.moves {
        assert!(
            m.x_mm >= 0.0 && m.x_mm <= max_x,
            "x={} outside [0,{}]",
            m.x_mm,
            max_x
        );
        assert!(
            m.y_mm >= 0.0 && m.y_mm <= max_y,
            "y={} outside [0,{}]",
            m.y_mm,
            max_y
        );
    }
}

#[test]
fn rose_endpoints_inside_reachable_region() {
    let c = cfg();
    let g = rose_gcode(&c, rose_params());
    let out = parse(&g, &c);
    let max_x = c.reachable_max_x();
    let max_y = c.reachable_max_y();
    for m in &out.moves {
        assert!(
            m.x_mm >= 0.0 && m.x_mm <= max_x,
            "x={} outside [0,{}]",
            m.x_mm,
            max_x
        );
        assert!(
            m.y_mm >= 0.0 && m.y_mm <= max_y,
            "y={} outside [0,{}]",
            m.y_mm,
            max_y
        );
    }
}
