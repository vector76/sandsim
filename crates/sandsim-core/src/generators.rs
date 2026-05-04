//! Programmatic G-code generators for spiral and rose curves.
//!
//! See `docs/gcode-subset.md` and `docs/phase-c-hardening.md`.

use std::f32::consts::PI;
use std::fmt::Write as _;

use crate::parser::ParserConfig;

#[derive(Debug, Clone, Copy)]
pub struct SpiralParams {
    pub centre_offset: (f32, f32),
    pub max_radius_mm: f32,
    pub pitch_mm: f32,
    pub sample_spacing_mm: f32,
    pub feedrate_mm_per_min: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct RoseParams {
    pub centre_offset: (f32, f32),
    pub max_radius_mm: f32,
    pub petal_count: u32,
    pub sample_spacing_mm: f32,
    pub feedrate_mm_per_min: f32,
}

/// Archimedean spiral `r = (pitch / 2π) * θ`, sampled at fixed arc-length
/// spacing from the centre outward to `max_radius_mm`.
pub fn spiral_gcode(config: &ParserConfig, params: SpiralParams) -> String {
    let (cx, cy, max_r) = centre_and_radius(config, params.centre_offset, params.max_radius_mm);
    let spacing = params.sample_spacing_mm.max(1e-3);
    let mut points: Vec<(f32, f32)> = vec![(cx, cy)];

    if max_r > 0.0 && params.pitch_mm > 0.0 {
        let b = params.pitch_mm / (2.0 * PI);
        let theta_end = max_r / b;
        let dtheta = 0.001_f32;
        let mut theta = 0.0_f32;
        let mut arc = 0.0_f32;
        let mut next = spacing;
        while theta < theta_end {
            let ds = b * (theta * theta + 1.0).sqrt();
            arc += ds * dtheta;
            theta += dtheta;
            if arc >= next {
                let r = (b * theta).min(max_r);
                let t = r / b;
                points.push((cx + r * t.cos(), cy + r * t.sin()));
                next += spacing;
            }
        }
        let xf = cx + max_r * theta_end.cos();
        let yf = cy + max_r * theta_end.sin();
        let last = *points.last().unwrap();
        let dx = last.0 - xf;
        let dy = last.1 - yf;
        if (dx * dx + dy * dy).sqrt() > 1e-4 {
            points.push((xf, yf));
        }
    }

    emit_path(&points, params.feedrate_mm_per_min)
}

/// Rose curve `r = a * cos(k·θ)` traced over the smallest period that closes
/// the curve (`[0, π]` for odd `k`, `[0, 2π]` for even `k`).
pub fn rose_gcode(config: &ParserConfig, params: RoseParams) -> String {
    let (cx, cy, max_r) = centre_and_radius(config, params.centre_offset, params.max_radius_mm);
    let spacing = params.sample_spacing_mm.max(1e-3);
    let k_int = params.petal_count.max(1);
    let k = k_int as f32;
    let theta_end = if k_int % 2 == 1 { PI } else { 2.0 * PI };
    let a = max_r;

    let start = (cx + a, cy);
    let mut points: Vec<(f32, f32)> = vec![start];

    if max_r > 0.0 {
        let dtheta = 0.001_f32;
        let mut theta = 0.0_f32;
        let mut arc = 0.0_f32;
        let mut next = spacing;
        while theta < theta_end {
            let cos_kt = (k * theta).cos();
            let sin_kt = (k * theta).sin();
            let ds = a * (cos_kt * cos_kt + k * k * sin_kt * sin_kt).sqrt();
            arc += ds * dtheta;
            theta += dtheta;
            if arc >= next {
                let r = a * (k * theta).cos();
                points.push((cx + r * theta.cos(), cy + r * theta.sin()));
                next += spacing;
            }
        }
        let last = *points.last().unwrap();
        let dx = last.0 - start.0;
        let dy = last.1 - start.1;
        if (dx * dx + dy * dy).sqrt() > 1e-4 {
            points.push(start);
        }
    }

    emit_path(&points, params.feedrate_mm_per_min)
}

fn centre_and_radius(
    config: &ParserConfig,
    offset: (f32, f32),
    requested_r: f32,
) -> (f32, f32, f32) {
    // Guard against a degenerate ParserConfig where 2·r > table dimension:
    // a negative reachable extent would make `clamp(min, max)` panic below.
    let max_x = config.reachable_max_x().max(0.0);
    let max_y = config.reachable_max_y().max(0.0);
    // Inset the cap by 10 µm so f32 rounding never pushes a sample past the
    // reachable boundary (and triggers a clamp warning on round-trip parse).
    let cap = ((max_x.min(max_y)) * 0.5 - 0.01).max(0.0);
    let max_r = requested_r.min(cap).max(0.0);
    let cx = (max_x * 0.5 + offset.0).clamp(max_r, max_x - max_r);
    let cy = (max_y * 0.5 + offset.1).clamp(max_r, max_y - max_r);
    (cx, cy, max_r)
}

fn emit_path(points: &[(f32, f32)], feedrate: f32) -> String {
    let mut s = String::new();
    if points.is_empty() {
        return s;
    }
    let (sx, sy) = points[0];
    writeln!(s, "G0 X{:.4} Y{:.4} F{:.4}", sx, sy, feedrate).unwrap();
    for &(x, y) in &points[1..] {
        writeln!(s, "G1 X{:.4} Y{:.4}", x, y).unwrap();
    }
    s
}
