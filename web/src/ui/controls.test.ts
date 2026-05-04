// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupControls } from './controls.js';
import { DEFAULT_SIM_CONFIG } from '../types.js';
import type { SimConfig } from '../types.js';

function setupDom(): void {
  const newBody = document.createElement('body');
  newBody.innerHTML = '<div id="controls"></div>';
  document.documentElement.replaceChild(newBody, document.body);
}

function getInput(key: keyof SimConfig): HTMLInputElement {
  const el = document.querySelector(`input[data-key="${String(key)}"]`);
  if (!el) throw new Error(`input for ${String(key)} not found`);
  return el as HTMLInputElement;
}

function applyBtn(): HTMLButtonElement {
  return document.getElementById('controls-apply') as HTMLButtonElement;
}

describe('setupControls', () => {
  beforeEach(() => {
    setupDom();
  });

  it('renders one number input per SimConfig field plus Apply button', () => {
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply: () => {} });
    const keys: (keyof SimConfig)[] = [
      'table_width_mm', 'table_height_mm', 'cell_mm', 'h0_mm',
      'ball_radius_mm', 'theta_repose_deg', 'n_segments',
      'interp_fraction', 'repose_max_iters',
    ];
    for (const k of keys) {
      const input = getInput(k);
      expect(input.type).toBe('number');
      expect(input.value).toBe(String(DEFAULT_SIM_CONFIG[k]));
    }
    expect(applyBtn()).not.toBeNull();
  });

  it('does nothing if #controls container is absent', () => {
    document.body.innerHTML = '';
    expect(() => setupControls({ initial: DEFAULT_SIM_CONFIG, onApply: () => {} })).not.toThrow();
  });

  it('calls onApply with merged config when inputs are valid', () => {
    const onApply = vi.fn();
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply });
    getInput('table_width_mm').value = '400';
    getInput('cell_mm').value = '0.25';
    getInput('n_segments').value = '16';
    applyBtn().click();
    expect(onApply).toHaveBeenCalledTimes(1);
    const cfg = onApply.mock.calls[0][0] as SimConfig;
    expect(cfg.table_width_mm).toBe(400);
    expect(cfg.cell_mm).toBe(0.25);
    expect(cfg.n_segments).toBe(16);
    expect(cfg.default_feedrate_mm_per_min).toBe(DEFAULT_SIM_CONFIG.default_feedrate_mm_per_min);
  });

  it('rejects non-positive numbers and does not call onApply', () => {
    const onApply = vi.fn();
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply });
    getInput('table_width_mm').value = '-1';
    applyBtn().click();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('rejects empty fields', () => {
    const onApply = vi.fn();
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply });
    getInput('cell_mm').value = '';
    applyBtn().click();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('rejects repose angle outside 0-60', () => {
    const onApply = vi.fn();
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply });
    getInput('theta_repose_deg').value = '75';
    applyBtn().click();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('accepts repose angle at boundary 0 and 60', () => {
    const onApply = vi.fn();
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply });
    getInput('theta_repose_deg').value = '0';
    applyBtn().click();
    expect(onApply).toHaveBeenCalledTimes(1);
    onApply.mockClear();
    getInput('theta_repose_deg').value = '60';
    applyBtn().click();
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('rejects n_segments outside 4-64 or non-integer', () => {
    const onApply = vi.fn();
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply });
    getInput('n_segments').value = '3';
    applyBtn().click();
    expect(onApply).not.toHaveBeenCalled();
    getInput('n_segments').value = '65';
    applyBtn().click();
    expect(onApply).not.toHaveBeenCalled();
    getInput('n_segments').value = '8.5';
    applyBtn().click();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('accepts n_segments at boundaries 4 and 64', () => {
    const onApply = vi.fn();
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply });
    getInput('n_segments').value = '4';
    applyBtn().click();
    expect(onApply).toHaveBeenCalledTimes(1);
    onApply.mockClear();
    getInput('n_segments').value = '64';
    applyBtn().click();
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('shows an error message and clears it on a subsequent valid apply', () => {
    const onApply = vi.fn();
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply });
    getInput('cell_mm').value = '-1';
    applyBtn().click();
    const container = document.getElementById('controls')!;
    expect(container.textContent).toMatch(/cell/);
    getInput('cell_mm').value = '0.5';
    applyBtn().click();
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('accepts onLighting field without invoking it', () => {
    const lighting = {
      setAzimuth: vi.fn(),
      setAltitude: vi.fn(),
      setBalance: vi.fn(),
    };
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply: () => {}, onLighting: lighting });
    expect(lighting.setAzimuth).not.toHaveBeenCalled();
    expect(lighting.setAltitude).not.toHaveBeenCalled();
    expect(lighting.setBalance).not.toHaveBeenCalled();
  });

  it('renders three lighting sliders with default values when onLighting is provided', () => {
    const lighting = {
      setAzimuth: vi.fn(),
      setAltitude: vi.fn(),
      setBalance: vi.fn(),
    };
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply: () => {}, onLighting: lighting });
    const az = document.querySelector('input[data-lighting-key="azimuth"]') as HTMLInputElement;
    const alt = document.querySelector('input[data-lighting-key="altitude"]') as HTMLInputElement;
    const bal = document.querySelector('input[data-lighting-key="balance"]') as HTMLInputElement;
    expect(az.type).toBe('range');
    expect(az.min).toBe('0');
    expect(az.max).toBe('360');
    expect(az.value).toBe('135');
    expect(alt.type).toBe('range');
    expect(alt.min).toBe('0');
    expect(alt.max).toBe('90');
    expect(alt.value).toBe('30');
    expect(bal.type).toBe('range');
    expect(bal.min).toBe('0');
    expect(bal.max).toBe('1');
    expect(bal.value).toBe('0.3');
  });

  it('omits lighting sliders when onLighting is not provided', () => {
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply: () => {} });
    expect(document.querySelector('input[data-lighting-key="azimuth"]')).toBeNull();
    expect(document.querySelector('input[data-lighting-key="altitude"]')).toBeNull();
    expect(document.querySelector('input[data-lighting-key="balance"]')).toBeNull();
  });

  it('invokes lighting setters immediately on slider input', () => {
    const lighting = {
      setAzimuth: vi.fn(),
      setAltitude: vi.fn(),
      setBalance: vi.fn(),
    };
    setupControls({ initial: DEFAULT_SIM_CONFIG, onApply: () => {}, onLighting: lighting });
    const az = document.querySelector('input[data-lighting-key="azimuth"]') as HTMLInputElement;
    const alt = document.querySelector('input[data-lighting-key="altitude"]') as HTMLInputElement;
    const bal = document.querySelector('input[data-lighting-key="balance"]') as HTMLInputElement;

    az.value = '210';
    az.dispatchEvent(new Event('input'));
    expect(lighting.setAzimuth).toHaveBeenCalledWith(210);

    alt.value = '60';
    alt.dispatchEvent(new Event('input'));
    expect(lighting.setAltitude).toHaveBeenCalledWith(60);

    bal.value = '0.75';
    bal.dispatchEvent(new Event('input'));
    expect(lighting.setBalance).toHaveBeenCalledWith(0.75);
  });
});
