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
  onDebugToggle?: {
    initial: boolean;
    setVisible: (visible: boolean) => void;
  };
}

const COLLAPSE_PREF_KEY = 'sandsim.controlsCollapsed';

interface FieldSpec {
  key: keyof SimConfig;
  label: string;
  step: string;
  validate: (v: number) => string | null;
}

interface LightingSliderSpec {
  key: 'azimuth' | 'altitude' | 'balance';
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  apply: (lighting: LightingControls, v: number) => void;
}

const LIGHTING_SLIDERS: LightingSliderSpec[] = [
  {
    key: 'azimuth',
    label: 'azimuth (deg)',
    min: 0,
    max: 360,
    step: 1,
    defaultValue: 135,
    apply: (l, v) => l.setAzimuth(v),
  },
  {
    key: 'altitude',
    label: 'altitude (deg)',
    min: 0,
    max: 90,
    step: 1,
    defaultValue: 30,
    apply: (l, v) => l.setAltitude(v),
  },
  {
    key: 'balance',
    label: 'balance',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.3,
    apply: (l, v) => l.setBalance(v),
  },
];

const FIELDS: FieldSpec[] = [
  { key: 'gcode_width_mm', label: 'gcode width (mm)', step: '1', validate: positive },
  { key: 'gcode_height_mm', label: 'gcode height (mm)', step: '1', validate: positive },
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

  const collapsed = localStorage.getItem(COLLAPSE_PREF_KEY) === '1';

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'controls-toggle';
  toggleBtn.type = 'button';
  toggleBtn.style.cssText = 'background:#333;color:#eee;border:1px solid #555;padding:4px 10px;cursor:pointer;font:12px sans-serif;width:100%;text-align:left;margin-bottom:4px;';
  container.appendChild(toggleBtn);

  const body = document.createElement('div');
  body.id = 'controls-body';
  container.appendChild(body);

  function applyCollapsed(c: boolean): void {
    body.style.display = c ? 'none' : '';
    toggleBtn.textContent = c ? '▶ settings' : '▼ settings';
  }
  applyCollapsed(collapsed);
  toggleBtn.addEventListener('click', () => {
    const isHidden = body.style.display === 'none';
    applyCollapsed(!isHidden);
    localStorage.setItem(COLLAPSE_PREF_KEY, !isHidden ? '1' : '0');
  });

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
    body.appendChild(row);
    inputs.set(spec.key, input);
  }

  if (opts.onLighting) {
    const lighting = opts.onLighting;
    for (const spec of LIGHTING_SLIDERS) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';

      const label = document.createElement('label');
      label.textContent = spec.label;
      label.style.cssText = 'flex:1;font:12px sans-serif;';

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(spec.defaultValue);
      input.dataset.lightingKey = spec.key;
      input.style.cssText = 'width:120px;';

      const valueEl = document.createElement('span');
      valueEl.textContent = String(spec.defaultValue);
      valueEl.style.cssText = 'font:12px monospace;color:#ccc;min-width:3em;text-align:right;';

      input.addEventListener('input', () => {
        const v = Number(input.value);
        valueEl.textContent = input.value;
        spec.apply(lighting, v);
      });

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(valueEl);
      body.appendChild(row);
    }
  }

  if (opts.onDebugToggle) {
    const dbg = opts.onDebugToggle;
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:6px 0 2px;font:12px sans-serif;cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'controls-debug';
    cb.checked = dbg.initial;
    cb.addEventListener('change', () => dbg.setVisible(cb.checked));
    const lbl = document.createElement('span');
    lbl.textContent = 'show debug log';
    row.appendChild(cb);
    row.appendChild(lbl);
    body.appendChild(row);
  }

  const errorEl = document.createElement('div');
  errorEl.style.cssText = 'color:#f66;font:12px sans-serif;min-height:1em;margin:4px 0;';
  body.appendChild(errorEl);

  const applyBtn = document.createElement('button');
  applyBtn.id = 'controls-apply';
  applyBtn.type = 'button';
  applyBtn.textContent = 'Apply';
  applyBtn.style.cssText = 'background:#333;color:#eee;border:1px solid #555;padding:4px 10px;cursor:pointer;';
  body.appendChild(applyBtn);

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
