import { describe, it, expect } from 'vitest';
import init, { Sim } from '../pkg/sandsim_wasm.js';

const TABLE_W = 100;
const TABLE_H = 80;
const CELL = 0.5;
const H0 = 5.0;
const BALL_R = 5.0;
const FEED = 1000;
const INTERP_FRACTION = 0.5;
const THETA_REPOSE_DEG = 30.0;
const N_SEGMENTS = 8;
const REPOSE_MAX_ITERS = 16;

describe('Sim WASM wrapper', () => {
  it('carves a crater along a swept path', async () => {
    await init();

    const sim = new Sim(
      TABLE_W,
      TABLE_H,
      CELL,
      H0,
      BALL_R,
      FEED,
      INTERP_FRACTION,
      THETA_REPOSE_DEG,
      N_SEGMENTS,
      REPOSE_MAX_ITERS,
    );
    const result = sim.load('G1 X10 Y10 F1000\n', 'reset') as { warnings: unknown[] };
    expect(result).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.warnings).toHaveLength(0);

    const nx = sim.nx();
    const ny = sim.ny();
    expect(nx).toBeGreaterThan(0);
    expect(ny).toBeGreaterThan(0);

    for (let i = 0; i < 50; i++) {
      sim.step(0.1);
    }
    expect(sim.is_done()).toBe(true);

    const buf = new Float32Array(nx * ny);
    sim.fill_heightmap(buf);

    let belowH0 = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] < H0 - 1e-6) belowH0++;
    }
    expect(belowH0).toBeGreaterThan(0);

    const pos = sim.ball_position();
    expect(pos.length).toBe(2);
    // ball position is in table-frame (G-code + ball_radius offset)
    expect(pos[0]).toBeCloseTo(10 + BALL_R, 3);
    expect(pos[1]).toBeCloseTo(10 + BALL_R, 3);
  });
});
