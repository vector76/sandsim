import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createSandMesh, updateSandMesh, checkFloatTextureSupport } from './sand-mesh.js';

describe('createSandMesh', () => {
  it('produces a geometry whose vertex count equals nx * ny', () => {
    const handle = createSandMesh(5, 4, 100, 80);
    expect(handle.mesh.geometry.attributes.position.count).toBe(5 * 4);
  });

  it('returns a handle whose mesh is a THREE.Mesh', () => {
    const handle = createSandMesh(3, 3, 10, 10);
    expect(handle.mesh).toBeInstanceOf(THREE.Mesh);
  });

  it('records nx and ny on the handle', () => {
    const handle = createSandMesh(7, 5, 20, 15);
    expect(handle.nx).toBe(7);
    expect(handle.ny).toBe(5);
  });

  it('returns a DataTexture sized nx x ny with the configured format/type/wrap', () => {
    const handle = createSandMesh(3, 2, 10, 10);
    expect(handle.texture).toBeInstanceOf(THREE.DataTexture);
    expect(handle.texture.image.width).toBe(3);
    expect(handle.texture.image.height).toBe(2);
    expect(handle.texture.image.data).toBeInstanceOf(Float32Array);
    expect((handle.texture.image.data as unknown as Float32Array).length).toBe(3 * 2);
    expect(handle.texture.format).toBe(THREE.RedFormat);
    expect(handle.texture.type).toBe(THREE.FloatType);
    expect(handle.texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(handle.texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
  });
});

describe('updateSandMesh', () => {
  it('copies heightmap into texture.image.data', () => {
    const handle = createSandMesh(2, 2, 10, 10);
    const data = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    updateSandMesh(handle, data);
    const tex = handle.texture.image.data as unknown as Float32Array;
    expect(Array.from(tex)).toEqual([1.0, 2.0, 3.0, 4.0]);
  });

  it('marks the texture as needing a GPU upload (bumps version)', () => {
    const handle = createSandMesh(2, 2, 10, 10);
    const versionBefore = handle.texture.version;
    updateSandMesh(handle, new Float32Array([0, 0, 0, 0]));
    expect(handle.texture.version).toBeGreaterThan(versionBefore);
  });

  it('does not retain a reference to the input array', () => {
    const handle = createSandMesh(2, 2, 10, 10);
    const data = new Float32Array([1, 2, 3, 4]);
    updateSandMesh(handle, data);
    data[0] = 99;
    expect((handle.texture.image.data as unknown as Float32Array)[0]).toBeCloseTo(1.0);
  });

  it('does not mutate the geometry position attribute', () => {
    const handle = createSandMesh(2, 2, 10, 10);
    const pos = handle.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const before = Array.from({ length: pos.count }, (_, i) => pos.getZ(i));
    updateSandMesh(handle, new Float32Array([1, 2, 3, 4]));
    const after = Array.from({ length: pos.count }, (_, i) => pos.getZ(i));
    expect(after).toEqual(before);
  });
});

describe('checkFloatTextureSupport', () => {
  it('returns false and logs error when the context is not WebGL2', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderer = {
      capabilities: { isWebGL2: false },
      getContext: () => ({ getExtension: () => null }),
    } as unknown as THREE.WebGLRenderer;
    expect(checkFloatTextureSupport(renderer)).toBe(false);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('returns false and logs error when OES_texture_float_linear is missing', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderer = {
      capabilities: { isWebGL2: true },
      getContext: () => ({ getExtension: () => null }),
    } as unknown as THREE.WebGLRenderer;
    expect(checkFloatTextureSupport(renderer)).toBe(false);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('returns true on WebGL2 with float-linear support and does not log', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderer = {
      capabilities: { isWebGL2: true },
      getContext: () => ({ getExtension: () => ({}) }),
    } as unknown as THREE.WebGLRenderer;
    expect(checkFloatTextureSupport(renderer)).toBe(true);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
