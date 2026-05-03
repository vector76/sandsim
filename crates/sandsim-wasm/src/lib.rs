use wasm_bindgen::prelude::*;
use sandsim_core::parser::{parse, ParserConfig};

#[wasm_bindgen]
pub fn parse_gcode(
    gcode: &str,
    table_width_mm: f32,
    table_height_mm: f32,
    ball_radius_mm: f32,
    default_feedrate_mm_per_min: f32,
) -> Result<JsValue, JsValue> {
    let config = ParserConfig { table_width_mm, table_height_mm, ball_radius_mm, default_feedrate_mm_per_min };
    let output = parse(gcode, &config);
    serde_wasm_bindgen::to_value(&output).map_err(|e| JsValue::from_str(&e.to_string()))
}
