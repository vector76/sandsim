use sandsim_core::parser::{parse, ParserConfig};

fn cfg() -> ParserConfig {
    ParserConfig {
        table_width_mm: 300.0,
        table_height_mm: 200.0,
        ball_radius_mm: 5.0,
        default_feedrate_mm_per_min: 1000.0,
    }
}

fn fixture(name: &str) -> String {
    let path = format!(
        "{}/../../tests/fixtures/{}",
        env!("CARGO_MANIFEST_DIR"),
        name
    );
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {}", path, e))
}

#[test]
fn single_g1_move() {
    let out = parse("G1 X10 Y20 F500", &cfg());
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    assert_eq!(out.moves.len(), 1);
    let m = &out.moves[0];
    assert_eq!(m.line, 1);
    assert_eq!(m.x_mm, 10.0);
    assert_eq!(m.y_mm, 20.0);
    assert_eq!(m.feedrate_mm_per_min, 500.0);
}

#[test]
fn g0_treated_as_g1() {
    let out = parse("G0 X10 Y20 F500", &cfg());
    assert!(out.warnings.is_empty());
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].x_mm, 10.0);
    assert_eq!(out.moves[0].y_mm, 20.0);
}

#[test]
fn modal_feedrate_inherited() {
    let out = parse("G1 X10 Y20 F500\nG1 X30 Y40", &cfg());
    assert!(out.warnings.is_empty());
    assert_eq!(out.moves.len(), 2);
    assert_eq!(out.moves[0].feedrate_mm_per_min, 500.0);
    assert_eq!(out.moves[1].feedrate_mm_per_min, 500.0);
}

#[test]
fn default_feedrate_used_when_unspecified() {
    let out = parse("G1 X10 Y20", &cfg());
    assert_eq!(out.moves[0].feedrate_mm_per_min, 1000.0);
}

#[test]
fn modal_axis_inheritance_x_only() {
    let out = parse("G1 X10 Y20 F500\nG1 X30", &cfg());
    assert_eq!(out.moves.len(), 2);
    assert_eq!(out.moves[1].x_mm, 30.0);
    assert_eq!(out.moves[1].y_mm, 20.0);
}

#[test]
fn modal_g_retention() {
    let out = parse("G1 X10 Y20 F500\nX30 Y40", &cfg());
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    assert_eq!(out.moves.len(), 2);
    assert_eq!(out.moves[1].x_mm, 30.0);
    assert_eq!(out.moves[1].y_mm, 40.0);
}

#[test]
fn semicolon_comment_stripped() {
    let out = parse("G1 X10 Y20 F500 ; trailing comment", &cfg());
    assert!(out.warnings.is_empty());
    assert_eq!(out.moves.len(), 1);
}

#[test]
fn paren_comment_stripped() {
    let out = parse("G1 X10 ( inline ) Y20 F500", &cfg());
    assert!(out.warnings.is_empty());
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].x_mm, 10.0);
    assert_eq!(out.moves[0].y_mm, 20.0);
}

#[test]
fn line_number_stripped() {
    let out = parse("N100 G1 X10 Y20 F500", &cfg());
    assert!(out.warnings.is_empty());
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].line, 1);
}

#[test]
fn blank_lines_skipped() {
    let out = parse("\n\nG1 X10 Y20 F500\n", &cfg());
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].line, 3);
}

#[test]
fn z_word_dropped_silently() {
    let out = parse("G1 X10 Y20 Z5 F500", &cfg());
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].x_mm, 10.0);
    assert_eq!(out.moves[0].y_mm, 20.0);
}

#[test]
fn g28_expands_to_two_moves() {
    let out = parse("G1 X100 Y50 F500\nG28", &cfg());
    assert!(out.warnings.is_empty());
    assert_eq!(out.moves.len(), 3);
    assert_eq!((out.moves[1].x_mm, out.moves[1].y_mm), (0.0, 50.0));
    assert_eq!((out.moves[2].x_mm, out.moves[2].y_mm), (0.0, 0.0));
    assert_eq!(out.moves[1].line, 2);
    assert_eq!(out.moves[2].line, 2);
    assert_eq!(out.moves[1].feedrate_mm_per_min, 500.0);
}

#[test]
fn dollar_h_expands_to_two_moves_and_is_case_insensitive() {
    let out = parse("G1 X100 Y50 F500\n$h", &cfg());
    assert!(out.warnings.is_empty());
    assert_eq!(out.moves.len(), 3);
    assert_eq!((out.moves[1].x_mm, out.moves[1].y_mm), (0.0, 50.0));
    assert_eq!((out.moves[2].x_mm, out.moves[2].y_mm), (0.0, 0.0));
}

#[test]
fn dollar_h_uppercase_works_too() {
    let out = parse("$H", &cfg());
    assert_eq!(out.moves.len(), 2);
}

#[test]
fn wall_clamp_high_x() {
    let out = parse("G1 X400 Y100 F500", &cfg());
    assert_eq!(out.warnings.len(), 1);
    assert_eq!(out.warnings[0].line, 1);
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].x_mm, 290.0); // 300 - 2*5
    assert_eq!(out.moves[0].y_mm, 100.0);
}

#[test]
fn wall_clamp_negative() {
    let out = parse("G1 X-10 Y-5 F500", &cfg());
    assert_eq!(out.warnings.len(), 1);
    assert_eq!(out.moves[0].x_mm, 0.0);
    assert_eq!(out.moves[0].y_mm, 0.0);
}

#[test]
fn wall_clamp_high_y() {
    let out = parse("G1 X100 Y300 F500", &cfg());
    assert_eq!(out.warnings.len(), 1);
    assert_eq!(out.moves[0].x_mm, 100.0);
    assert_eq!(out.moves[0].y_mm, 190.0); // 200 - 2*5
}

#[test]
fn unsupported_g_code_warns_and_skips() {
    let out = parse("G2 X10 Y10", &cfg());
    assert_eq!(out.warnings.len(), 1);
    assert_eq!(out.moves.len(), 0);
}

#[test]
fn unsupported_m_code_warns() {
    let out = parse("M3 S1000", &cfg());
    assert!(out.warnings.len() >= 1);
    assert_eq!(out.moves.len(), 0);
}

#[test]
fn unsupported_axis_word_warns() {
    let out = parse("G1 X10 Y10 I5", &cfg());
    assert_eq!(out.warnings.len(), 1);
    assert_eq!(out.moves.len(), 0);
}

#[test]
fn axis_word_without_modal_g_warns() {
    let out = parse("X10 Y20", &cfg());
    assert_eq!(out.warnings.len(), 1);
    assert_eq!(out.moves.len(), 0);
}

#[test]
fn f_only_line_updates_modal_feedrate() {
    let out = parse("F1500\nG1 X10 Y10", &cfg());
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].feedrate_mm_per_min, 1500.0);
}

#[test]
fn g1_f_only_updates_feedrate_no_move() {
    let out = parse("G1 F1500\nX10 Y10", &cfg());
    assert!(out.warnings.is_empty());
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].feedrate_mm_per_min, 1500.0);
}

#[test]
fn signed_coordinates_parse() {
    let out = parse("G1 X+10 Y-5 F500", &cfg());
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].x_mm, 10.0);
    // -5 clamps to 0, with a warning
    assert_eq!(out.moves[0].y_mm, 0.0);
    assert_eq!(out.warnings.len(), 1);
}

#[test]
fn fractional_coordinates_parse() {
    let out = parse("G1 X10.5 Y20.25 F500", &cfg());
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].x_mm, 10.5);
    assert_eq!(out.moves[0].y_mm, 20.25);
}

#[test]
fn whitespace_between_letter_and_number_ok() {
    let out = parse("G 1 X 10 Y 20 F 500", &cfg());
    assert!(out.warnings.is_empty());
    assert_eq!(out.moves.len(), 1);
    assert_eq!(out.moves[0].x_mm, 10.0);
}

#[test]
fn fixture_square() {
    let out = parse(&fixture("square.gcode"), &cfg());
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    assert_eq!(out.moves.len(), 5);
    assert_eq!(out.moves[0].feedrate_mm_per_min, 1000.0);
    assert_eq!(out.moves[4].feedrate_mm_per_min, 1000.0);
    assert_eq!((out.moves[0].x_mm, out.moves[0].y_mm), (95.0, 45.0));
    assert_eq!((out.moves[2].x_mm, out.moves[2].y_mm), (195.0, 145.0));
    assert_eq!((out.moves[4].x_mm, out.moves[4].y_mm), (95.0, 45.0));
}

#[test]
fn fixture_homing() {
    let out = parse(&fixture("homing.gcode"), &cfg());
    assert!(out.warnings.is_empty(), "warnings: {:?}", out.warnings);
    // G1 X100 Y100 F1000  -> 1 move
    // G28                 -> 2 moves: (0, 100), (0, 0)
    // G1 X50 Y50          -> 1 move
    // $H                  -> 2 moves: (0, 50), (0, 0)
    assert_eq!(out.moves.len(), 6);
    assert_eq!((out.moves[0].x_mm, out.moves[0].y_mm), (100.0, 100.0));
    assert_eq!((out.moves[1].x_mm, out.moves[1].y_mm), (0.0, 100.0));
    assert_eq!((out.moves[2].x_mm, out.moves[2].y_mm), (0.0, 0.0));
    assert_eq!((out.moves[3].x_mm, out.moves[3].y_mm), (50.0, 50.0));
    assert_eq!((out.moves[4].x_mm, out.moves[4].y_mm), (0.0, 50.0));
    assert_eq!((out.moves[5].x_mm, out.moves[5].y_mm), (0.0, 0.0));
}

#[test]
fn fixture_wall_clamp() {
    let out = parse(&fixture("wall_clamp.gcode"), &cfg());
    assert_eq!(out.warnings.len(), 3);
    assert_eq!(out.moves.len(), 3);
    assert_eq!((out.moves[0].x_mm, out.moves[0].y_mm), (290.0, 100.0));
    assert_eq!((out.moves[1].x_mm, out.moves[1].y_mm), (0.0, 50.0));
    assert_eq!((out.moves[2].x_mm, out.moves[2].y_mm), (100.0, 190.0));
}

#[test]
fn fixture_unsupported() {
    let out = parse(&fixture("unsupported.gcode"), &cfg());
    // N10 G21       -> warn (G21 unsupported)
    // N20 M3 S1000  -> warn (M unsupported)
    // N30 G1 X10 Y20 F1000  -> move
    // N40 G2 X20 Y20 I5 J0  -> warn (G2 unsupported)
    // N50 G1 X30 Y30  -> move
    assert_eq!(out.moves.len(), 2);
    assert_eq!((out.moves[0].x_mm, out.moves[0].y_mm), (10.0, 20.0));
    assert_eq!((out.moves[1].x_mm, out.moves[1].y_mm), (30.0, 30.0));
    assert!(out.warnings.len() >= 3);
    // Warnings should reference original line numbers
    assert!(out.warnings.iter().any(|w| w.line == 1));
    assert!(out.warnings.iter().any(|w| w.line == 2));
    assert!(out.warnings.iter().any(|w| w.line == 4));
}

#[test]
fn warning_includes_source_line() {
    let out = parse("G1 X10 Y10\nG2 X20 Y20", &cfg());
    assert_eq!(out.warnings.len(), 1);
    assert_eq!(out.warnings[0].source, "G2 X20 Y20");
}
