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
