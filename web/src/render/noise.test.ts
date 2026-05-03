import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createNoiseTexture } from './noise.js';

describe('createNoiseTexture', () => {
  it('returns a DataTexture with the requested dimensions', () => {
    const tex = createNoiseTexture(64);
    expect(tex).toBeInstanceOf(THREE.DataTexture);
    expect(tex.image.width).toBe(64);
    expect(tex.image.height).toBe(64);
  });

  it('uses RepeatWrapping on both axes', () => {
    const tex = createNoiseTexture(32);
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.RepeatWrapping);
  });

  it('produces a non-uniform buffer (min !== max)', () => {
    const tex = createNoiseTexture(64);
    const data = tex.image.data as Uint8Array;
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    expect(min).not.toBe(max);
  });
});
