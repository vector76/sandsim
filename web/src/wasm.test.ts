import { describe, it, expect } from 'vitest';
import { parseGcode } from './wasm.js';
import { DEFAULT_CONFIG } from './types.js';

describe('parseGcode smoke test', () => {
  it('parses minimal gcode and returns correct move and warning counts', async () => {
    const gcode = 'G0 X50 Y50\nG1 X100 Y100 F1000\n';
    const output = await parseGcode(gcode, DEFAULT_CONFIG);

    expect(output.moves).toHaveLength(2);
    expect(output.warnings).toHaveLength(0);

    expect(typeof output.moves[0].x_mm).toBe('number');
    expect(typeof output.moves[0].y_mm).toBe('number');
  });
});
