use sandsim_core::parser::{parse, ParserConfig, Warning};
use sandsim_core::sim::{LoadMode, Sim as CoreSim, SimConfig};
use serde::Serialize;
use wasm_bindgen::prelude::*;

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

#[derive(Serialize)]
struct LoadResult {
    warnings: Vec<Warning>,
}

#[wasm_bindgen]
pub struct Sim {
    inner: CoreSim,
    config: SimConfig,
}

#[wasm_bindgen]
impl Sim {
    #[wasm_bindgen(constructor)]
    pub fn new(
        table_width_mm: f32,
        table_height_mm: f32,
        cell_mm: f32,
        h0_mm: f32,
        ball_radius_mm: f32,
        default_feedrate_mm_per_min: f32,
    ) -> Sim {
        let config = SimConfig {
            table_width_mm,
            table_height_mm,
            cell_mm,
            h0_mm,
            ball_radius_mm,
            default_feedrate_mm_per_min,
            interp_fraction: 0.5,
            theta_repose_deg: 30.0,
            n_segments: 8,
            repose_max_iters: 16,
        };
        Sim {
            inner: CoreSim::new(config),
            config,
        }
    }

    pub fn load(&mut self, gcode_text: &str, mode: &str) -> Result<JsValue, JsValue> {
        let load_mode = match mode {
            "reset" => LoadMode::Reset,
            "append" => LoadMode::Append,
            other => return Err(JsValue::from_str(&format!("invalid load mode: {}", other))),
        };
        let parser_config = ParserConfig {
            table_width_mm: self.config.table_width_mm,
            table_height_mm: self.config.table_height_mm,
            ball_radius_mm: self.config.ball_radius_mm,
            default_feedrate_mm_per_min: self.config.default_feedrate_mm_per_min,
        };
        let parsed = parse(gcode_text, &parser_config);
        self.inner.load(parsed.moves, load_mode);
        let result = LoadResult { warnings: parsed.warnings };
        serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn step(&mut self, dt_seconds: f32) {
        self.inner.advance(dt_seconds);
    }

    pub fn fill_heightmap(&self, buf: &mut [f32]) {
        let src = self.inner.heightmap_buffer();
        assert_eq!(
            buf.len(),
            src.len(),
            "fill_heightmap: buf length {} != heightmap length {}",
            buf.len(),
            src.len()
        );
        buf.copy_from_slice(src);
    }

    pub fn ball_position(&self) -> Box<[f32]> {
        let (x, y) = self.inner.ball_position_table();
        Box::new([x, y])
    }

    pub fn is_done(&self) -> bool {
        self.inner.is_done()
    }

    pub fn nx(&self) -> u32 {
        self.inner.nx() as u32
    }

    pub fn ny(&self) -> u32 {
        self.inner.ny() as u32
    }
}
