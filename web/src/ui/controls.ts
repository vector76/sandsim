import type { SimConfig } from '../types.js';

export interface LightingControls {
  setAzimuth: (deg: number) => void;
  setAltitude: (deg: number) => void;
  setBalance: (b: number) => void;
}

export interface ControlsOptions {
  initial: SimConfig;
  onApply: (cfg: SimConfig) => void;
  onLighting?: LightingControls;
}

interface FieldSpec {
  key: keyof SimConfig;
  label: string;
  step: string;
  validate: (v: number) => string | null;
}

const FIELDS: FieldSpec[] = [
  { key: 'table_width_mm', label: 'table width (mm)', step: '1', validate: positive },
  { key: 'table_height_mm', label: 'table height (mm)', step: '1', validate: positive },
  { key: 'cell_mm', label: 'cell (mm)', step: '0.1', validate: positive },
  { key: 'h0_mm', label: 'initial sand height h0 (mm)', step: '0.1', validate: positive },
  { key: 'ball_radius_mm', label: 'ball radius (mm)', step: '0.1', validate: positive },
  { key: 'theta_repose_deg', label: 'repose angle (deg)', step: '0.5', validate: angle0to60 },
  { key: 'n_segments', label: 'ball segments', step: '1', validate: segments4to64 },
  { key: 'interp_fraction', label: 'interp fraction', step: '0.05', validate: positive },
  { key: 'repose_max_iters', label: 'repose max iters', step: '1', validate: positive },
];

function positive(v: number): string | null {
  return Number.isFinite(v) && v > 0 ? null : 'must be a positive number';
}

function angle0to60(v: number): string | null {
  return Number.isFinite(v) && v >= 0 && v <= 60 ? null : 'must be between 0 and 60';
}

function segments4to64(v: number): string | null {
  return Number.isFinite(v) && Number.isInteger(v) && v >= 4 && v <= 64
    ? null
    : 'must be an integer between 4 and 64';
}

export function setupControls(opts: ControlsOptions): void {
  const container = document.getElementById('controls');
  if (!container) return;

  container.innerHTML = '';

  const inputs = new Map<keyof SimConfig, HTMLInputElement>();

  for (const spec of FIELDS) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';

    const label = document.createElement('label');
    label.textContent = spec.label;
    label.style.cssText = 'flex:1;font:12px sans-serif;';

    const input = document.createElement('input');
    input.type = 'number';
    input.step = spec.step;
    input.value = String(opts.initial[spec.key]);
    input.dataset.key = String(spec.key);
    input.style.cssText = 'width:80px;background:#222;color:#eee;border:1px solid #444;';

    label.appendChild(input);
    row.appendChild(label);
    container.appendChild(row);
    inputs.set(spec.key, input);
  }

  const errorEl = document.createElement('div');
  errorEl.style.cssText = 'color:#f66;font:12px sans-serif;min-height:1em;margin:4px 0;';
  container.appendChild(errorEl);

  const applyBtn = document.createElement('button');
  applyBtn.id = 'controls-apply';
  applyBtn.type = 'button';
  applyBtn.textContent = 'Apply';
  applyBtn.style.cssText = 'background:#333;color:#eee;border:1px solid #555;padding:4px 10px;cursor:pointer;';
  container.appendChild(applyBtn);

  applyBtn.addEventListener('click', () => {
    const next: Partial<SimConfig> = {};
    const errors: string[] = [];
    for (const spec of FIELDS) {
      const input = inputs.get(spec.key)!;
      const raw = input.value.trim();
      const num = Number(raw);
      const err = raw === '' || Number.isNaN(num) ? 'must be a number' : spec.validate(num);
      if (err !== null) {
        errors.push(`${spec.label}: ${err}`);
      } else {
        (next as Record<string, number>)[spec.key as string] = num;
      }
    }
    if (errors.length > 0) {
      errorEl.textContent = errors.join('; ');
      return;
    }
    errorEl.textContent = '';
    const cfg: SimConfig = { ...opts.initial, ...next };
    opts.onApply(cfg);
  });
}
