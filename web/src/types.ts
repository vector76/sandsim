export interface MoveEvent {
  line: number;
  x_mm: number;
  y_mm: number;
  feedrate_mm_per_min: number;
}

export interface Warning {
  line: number;
  message: string;
  source: string;
}

export interface ParserConfig {
  table_width_mm: number;
  table_height_mm: number;
  ball_radius_mm: number;
  default_feedrate_mm_per_min: number;
}

export interface ParseOutput {
  moves: MoveEvent[];
  warnings: Warning[];
}

export const DEFAULT_CONFIG: ParserConfig = {
  table_width_mm: 300,
  table_height_mm: 200,
  ball_radius_mm: 5,
  default_feedrate_mm_per_min: 1000,
};

export interface SimConfig {
  table_width_mm: number;
  table_height_mm: number;
  cell_mm: number;
  h0_mm: number;
  ball_radius_mm: number;
  default_feedrate_mm_per_min: number;
  theta_repose_deg: number;
  n_segments: number;
  interp_fraction: number;
  repose_max_iters: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  table_width_mm: 300,
  table_height_mm: 200,
  cell_mm: 0.5,
  h0_mm: 3.0,
  ball_radius_mm: 5,
  default_feedrate_mm_per_min: 1000,
  theta_repose_deg: 30,
  n_segments: 8,
  interp_fraction: 0.5,
  repose_max_iters: 16,
};
