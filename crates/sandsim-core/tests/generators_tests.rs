use sandsim_core::generators::{rose_gcode, spiral_gcode, RoseParams, SpiralParams};
use sandsim_core::parser::{parse, ParserConfig};

fn cfg() -> ParserConfig {
    ParserConfig {
        table_width_mm: 300.0,
        table_height_mm: 200.0,
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
    let g = spiral_gcode(&cfg(), spiral_params());
    let out = parse(&g, &cfg());
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    assert!(out.moves.len() > 5, "expected many moves, got {}", out.moves.len());
}

#[test]
fn spiral_stays_inside_reachable_region() {
    let c = cfg();
    let g = spiral_gcode(&c, spiral_params());
    let out = parse(&g, &c);
    let max_x = c.reachable_max_x();
    let max_y = c.reachable_max_y();
    for m in &out.moves {
        assert!(
            m.x_mm >= 0.0 && m.x_mm <= max_x,
            "x={} out of [0,{}]",
            m.x_mm,
            max_x
        );
        assert!(
            m.y_mm >= 0.0 && m.y_mm <= max_y,
            "y={} out of [0,{}]",
            m.y_mm,
            max_y
        );
    }
}

#[test]
fn spiral_clamps_oversized_radius() {
    let c = cfg();
    let mut p = spiral_params();
    p.max_radius_mm = 1_000.0;
    let g = spiral_gcode(&c, p);
    let out = parse(&g, &c);
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);

    let cx = c.reachable_max_x() * 0.5;
    let cy = c.reachable_max_y() * 0.5;
    // The smaller of the two half-extents caps the radius.
    let cap = (c.reachable_max_x().min(c.reachable_max_y())) * 0.5;
    for m in &out.moves {
        let dx = (m.x_mm - cx) as f64;
        let dy = (m.y_mm - cy) as f64;
        let d = (dx * dx + dy * dy).sqrt();
        assert!(
            d <= cap as f64 + 1e-3,
            "point ({:.3},{:.3}) is {:.3} mm from centre, exceeds cap {:.3}",
            m.x_mm,
            m.y_mm,
            d,
            cap
        );
    }
}

#[test]
fn spiral_starts_with_g0_then_g1_only() {
    let g = spiral_gcode(&cfg(), spiral_params());
    let mut lines = g.lines();
    let first = lines.next().expect("at least one line");
    assert!(first.starts_with("G0 "), "first line: {}", first);
    assert!(first.contains('F'), "feedrate must appear on the leading G0: {}", first);
    let mut count_with_f = 0;
    for line in g.lines() {
        if line.contains('F') {
            count_with_f += 1;
        }
    }
    assert_eq!(count_with_f, 1, "expected exactly one F word in output");
    for line in lines {
        assert!(line.starts_with("G1 "), "subsequent line: {}", line);
    }
}

#[test]
fn spiral_emits_endpoint_even_when_spacing_exceeds_arc_length() {
    // With huge sample spacing the per-spacing emit branch never fires; the
    // generator must still terminate at max_r so the spiral isn't reduced to
    // a bare G0 to the centre.
    let c = cfg();
    let g = spiral_gcode(
        &c,
        SpiralParams {
            centre_offset: (0.0, 0.0),
            max_radius_mm: 80.0,
            pitch_mm: 10.0,
            sample_spacing_mm: 10_000.0,
            feedrate_mm_per_min: 1500.0,
        },
    );
    let out = parse(&g, &c);
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    assert!(
        out.moves.len() >= 2,
        "spiral collapsed to {} move(s); endpoint missing",
        out.moves.len()
    );
    let first = &out.moves[0];
    let last = out.moves.last().unwrap();
    let dx = (last.x_mm - first.x_mm) as f64;
    let dy = (last.y_mm - first.y_mm) as f64;
    let radial = (dx * dx + dy * dy).sqrt();
    assert!(
        (radial - 80.0).abs() < 1e-2,
        "endpoint should sit on the requested max radius (got {:.4} from centre)",
        radial
    );
}

#[test]
fn centre_offset_keeps_figure_inside_bounds() {
    // A huge offset should saturate against the reachable boundary rather
    // than push samples out of range or emit clamp warnings.
    let c = cfg();
    let g = spiral_gcode(
        &c,
        SpiralParams {
            centre_offset: (10_000.0, -10_000.0),
            max_radius_mm: 40.0,
            pitch_mm: 5.0,
            sample_spacing_mm: 1.5,
            feedrate_mm_per_min: 1500.0,
        },
    );
    let out = parse(&g, &c);
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    let max_x = c.reachable_max_x();
    let max_y = c.reachable_max_y();
    for m in &out.moves {
        assert!(m.x_mm >= 0.0 && m.x_mm <= max_x);
        assert!(m.y_mm >= 0.0 && m.y_mm <= max_y);
    }
    // The first move (G0 to centre) should land near the +x / -y corner,
    // i.e. at (max_x - max_r, max_r), proving the offset was saturated.
    let first = &out.moves[0];
    assert!(
        (first.x_mm - (max_x - 40.0)).abs() < 1e-2,
        "centre x should be saturated to max_x - max_r: got {}",
        first.x_mm
    );
    assert!(
        (first.y_mm - 40.0).abs() < 1e-2,
        "centre y should be saturated to max_r: got {}",
        first.y_mm
    );
}

#[test]
fn generators_do_not_panic_on_degenerate_config() {
    // Ball larger than the table (reachable extent < 0). Generators should
    // still produce parseable output rather than panicking inside `clamp`.
    let c = ParserConfig {
        table_width_mm: 5.0,
        table_height_mm: 5.0,
        ball_radius_mm: 10.0,
        default_feedrate_mm_per_min: 1000.0,
    };
    let _ = spiral_gcode(&c, spiral_params());
    let _ = rose_gcode(&c, rose_params());
}

#[test]
fn rose_round_trips_with_no_warnings() {
    let g = rose_gcode(&cfg(), rose_params());
    let out = parse(&g, &cfg());
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    assert!(out.moves.len() > 5, "expected many moves, got {}", out.moves.len());
}

#[test]
fn rose_stays_inside_reachable_region() {
    let c = cfg();
    let mut p = rose_params();
    // Exercise the even-k branch too.
    p.petal_count = 4;
    let g = rose_gcode(&c, p);
    let out = parse(&g, &c);
    let max_x = c.reachable_max_x();
    let max_y = c.reachable_max_y();
    for m in &out.moves {
        assert!(m.x_mm >= 0.0 && m.x_mm <= max_x);
        assert!(m.y_mm >= 0.0 && m.y_mm <= max_y);
    }
}

#[test]
fn rose_clamps_oversized_radius() {
    let c = cfg();
    let mut p = rose_params();
    p.max_radius_mm = 1_000.0;
    let g = rose_gcode(&c, p);
    let out = parse(&g, &c);
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    let max_x = c.reachable_max_x();
    let max_y = c.reachable_max_y();
    for m in &out.moves {
        assert!(m.x_mm >= 0.0 && m.x_mm <= max_x);
        assert!(m.y_mm >= 0.0 && m.y_mm <= max_y);
    }
}

#[test]
fn rose_starts_with_g0_and_single_feedrate() {
    let g = rose_gcode(&cfg(), rose_params());
    let first = g.lines().next().unwrap();
    assert!(first.starts_with("G0 "), "first line: {}", first);
    let f_count = g.lines().filter(|l| l.contains('F')).count();
    assert_eq!(f_count, 1, "expected exactly one leading F word");
    for line in g.lines().skip(1) {
        assert!(line.starts_with("G1 "), "non-first line: {}", line);
    }
}

#[test]
fn rose_closes_curve() {
    // The last sample should be at (or very near) the start point so the
    // closed curve is actually closed.
    let c = cfg();
    let g = rose_gcode(&c, rose_params());
    let out = parse(&g, &c);
    let first = &out.moves[0];
    let last = out.moves.last().unwrap();
    let dx = last.x_mm - first.x_mm;
    let dy = last.y_mm - first.y_mm;
    let dist = (dx * dx + dy * dy).sqrt();
    assert!(dist < 1e-2, "rose did not close: gap = {} mm", dist);
}
