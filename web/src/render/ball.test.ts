import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createBallMesh, updateBallMesh } from './ball.js';

describe('createBallMesh', () => {
  it('returns a THREE.Mesh', () => {
    const mesh = createBallMesh(5);
    expect(mesh).toBeInstanceOf(THREE.Mesh);
  });
});

describe('updateBallMesh', () => {
  it('sets mesh.position to (x, y, r)', () => {
    const mesh = createBallMesh(5);
    updateBallMesh(mesh, 10, 20, 5);
    expect(mesh.position.x).toBeCloseTo(10);
    expect(mesh.position.y).toBeCloseTo(20);
    expect(mesh.position.z).toBeCloseTo(5);
  });
});
