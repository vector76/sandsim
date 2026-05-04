//! Regenerate the committed spiral.gcode and rose.gcode fixtures.
//!
//! Run with: `cargo run --example generate_fixtures -p sandsim-core`

use std::path::PathBuf;

use sandsim_core::generators::{rose_gcode, spiral_gcode, RoseParams, SpiralParams};
use sandsim_core::parser::ParserConfig;

fn main() {
    let config = ParserConfig {
        gcode_width_mm: 300.0,
        gcode_height_mm: 200.0,
        ball_radius_mm: 5.0,
        default_feedrate_mm_per_min: 1000.0,
    };

    let spiral = spiral_gcode(
        &config,
        SpiralParams {
            centre_offset: (0.0, 0.0),
            max_radius_mm: 95.0,
            pitch_mm: 3.0,
            sample_spacing_mm: 1.0,
            feedrate_mm_per_min: config.default_feedrate_mm_per_min,
        },
    );

    let rose = rose_gcode(
        &config,
        RoseParams {
            centre_offset: (0.0, 0.0),
            max_radius_mm: 90.0,
            petal_count: 5,
            sample_spacing_mm: 0.5,
            feedrate_mm_per_min: config.default_feedrate_mm_per_min,
        },
    );

    let fixtures_dir: PathBuf = [
        env!("CARGO_MANIFEST_DIR"),
        "..",
        "..",
        "tests",
        "fixtures",
    ]
    .iter()
    .collect();
    std::fs::create_dir_all(&fixtures_dir).expect("create tests/fixtures");

    let spiral_path = fixtures_dir.join("spiral.gcode");
    let rose_path = fixtures_dir.join("rose.gcode");
    std::fs::write(&spiral_path, &spiral).expect("write spiral.gcode");
    std::fs::write(&rose_path, &rose).expect("write rose.gcode");

    println!("wrote {} ({} bytes)", spiral_path.display(), spiral.len());
    println!("wrote {} ({} bytes)", rose_path.display(), rose.len());
}
