import init, { parse_gcode } from '../pkg/sandsim_wasm.js';
import type { ParserConfig, ParseOutput } from './types.js';

let initPromise: Promise<void> | null = null;

async function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = init().then(() => {});
  }
  return initPromise;
}

export async function parseGcode(text: string, config: ParserConfig): Promise<ParseOutput> {
  await ensureInit();
  return parse_gcode(
    text,
    config.table_width_mm,
    config.table_height_mm,
    config.ball_radius_mm,
    config.default_feedrate_mm_per_min,
  ) as ParseOutput;
}
