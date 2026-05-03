import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildToolpathLine } from './toolpath.js';
import type { MoveEvent } from '../types.js';

describe('buildToolpathLine', () => {
  it('returns a THREE.Line instance', () => {
    const line = buildToolpathLine([], 5);
    expect(line).toBeInstanceOf(THREE.Line);
  });

  it('origin point is offset by ballRadius on both axes at z=0.1', () => {
    const line = buildToolpathLine([], 5);
    const pos = line.geometry.attributes.position;
    expect(pos.getX(0)).toBeCloseTo(5);
    expect(pos.getY(0)).toBeCloseTo(5);
    expect(pos.getZ(0)).toBeCloseTo(0.1);
  });

  it('translates move coords by ballRadius offset on both axes', () => {
    const moves: MoveEvent[] = [{ line: 1, x_mm: 10, y_mm: 20, feedrate_mm_per_min: 1000 }];
    const line = buildToolpathLine(moves, 5);
    const pos = line.geometry.attributes.position;
    expect(pos.getX(1)).toBeCloseTo(15);
    expect(pos.getY(1)).toBeCloseTo(25);
    expect(pos.getZ(1)).toBeCloseTo(0.1);
  });

  it('produces moves.length + 1 points (origin + each move)', () => {
    const moves: MoveEvent[] = [
      { line: 1, x_mm: 10, y_mm: 10, feedrate_mm_per_min: 1000 },
      { line: 2, x_mm: 20, y_mm: 20, feedrate_mm_per_min: 1000 },
      { line: 3, x_mm: 30, y_mm: 30, feedrate_mm_per_min: 1000 },
    ];
    const line = buildToolpathLine(moves, 5);
    expect(line.geometry.attributes.position.count).toBe(4);
  });

  it('empty moves produces exactly one point (the origin)', () => {
    const line = buildToolpathLine([], 5);
    expect(line.geometry.attributes.position.count).toBe(1);
  });

  it('zero ball radius: origin is at (0, 0, 0.1)', () => {
    const line = buildToolpathLine([], 0);
    const pos = line.geometry.attributes.position;
    expect(pos.getX(0)).toBeCloseTo(0);
    expect(pos.getY(0)).toBeCloseTo(0);
    expect(pos.getZ(0)).toBeCloseTo(0.1);
  });

  it('all move z values are 0.1 regardless of move count', () => {
    const moves: MoveEvent[] = [
      { line: 1, x_mm: 0, y_mm: 0, feedrate_mm_per_min: 500 },
      { line: 2, x_mm: 100, y_mm: 50, feedrate_mm_per_min: 500 },
    ];
    const line = buildToolpathLine(moves, 3);
    const pos = line.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getZ(i)).toBeCloseTo(0.1);
    }
  });
});
