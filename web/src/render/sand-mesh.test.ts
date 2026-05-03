import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSandMesh, updateSandMesh } from './sand-mesh.js';

describe('createSandMesh', () => {
  it('produces a geometry whose vertex count equals nx * ny', () => {
    const mesh = createSandMesh(5, 4, 100, 80);
    expect(mesh.geometry.attributes.position.count).toBe(5 * 4);
  });

  it('returns a THREE.Mesh', () => {
    const mesh = createSandMesh(3, 3, 10, 10);
    expect(mesh).toBeInstanceOf(THREE.Mesh);
  });
});

describe('updateSandMesh', () => {
  it('Y-axis remap: 2x2 grid [1,2,3,4] yields vertex Z values [3,4,1,2]', () => {
    const mesh = createSandMesh(2, 2, 10, 10);
    const data = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    updateSandMesh(mesh, data, 2);
    const pos = mesh.geometry.attributes.position;
    expect(pos.getZ(0)).toBeCloseTo(3.0);
    expect(pos.getZ(1)).toBeCloseTo(4.0);
    expect(pos.getZ(2)).toBeCloseTo(1.0);
    expect(pos.getZ(3)).toBeCloseTo(2.0);
  });
});
