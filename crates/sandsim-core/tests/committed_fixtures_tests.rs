use sandsim_core::parser::{parse, ParserConfig};

const SPIRAL: &str = include_str!("../../../tests/fixtures/spiral.gcode");
const ROSE: &str = include_str!("../../../tests/fixtures/rose.gcode");

fn cfg() -> ParserConfig {
    ParserConfig {
        gcode_width_mm: 300.0,
        gcode_height_mm: 200.0,
        ball_radius_mm: 5.0,
        default_feedrate_mm_per_min: 1000.0,
    }
}

#[test]
fn committed_spiral_parses_clean() {
    let out = parse(SPIRAL, &cfg());
    assert!(
        out.warnings.is_empty(),
        "spiral.gcode produced warnings: {:?}",
        out.warnings
    );
    assert!(!out.moves.is_empty(), "spiral.gcode produced no moves");
}

#[test]
fn committed_rose_parses_clean() {
    let out = parse(ROSE, &cfg());
    assert!(
        out.warnings.is_empty(),
        "rose.gcode produced warnings: {:?}",
        out.warnings
    );
    assert!(!out.moves.is_empty(), "rose.gcode produced no moves");
}
