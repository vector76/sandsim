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

  it('uses a ShaderMaterial with the documented uniforms wired to the heightmap texture and table dims', () => {
    const handle = createSandMesh(8, 4, 200, 100);
    expect(handle.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(handle.mesh.material).toBe(handle.material);

    const u = handle.material.uniforms;
    expect(u.uHeightmap.value).toBe(handle.texture);

    const texel = u.uTexel.value as THREE.Vector2;
    expect(texel.x).toBeCloseTo(1 / 8);
    expect(texel.y).toBeCloseTo(1 / 4);

    const tableSize = u.uTableSize.value as THREE.Vector2;
    expect(tableSize.x).toBeCloseTo(200);
    expect(tableSize.y).toBeCloseTo(100);

    expect(u.uLightDir).toBeDefined();
    expect(u.uLightColor).toBeDefined();
    expect(u.uAmbient).toBeDefined();
  });

  it('shader sources reference heightmap sampling and the sand base colour', () => {
    const handle = createSandMesh(3, 3, 10, 10);
    expect(handle.material.vertexShader).toContain('uHeightmap');
    expect(handle.material.vertexShader).toContain('texture2D');
    expect(handle.material.fragmentShader).toContain('vec3(0.76, 0.66, 0.48)');
  });

  it('exposes uNoise and uNoiseScale uniforms with a default scale of ~5 mm', () => {
    const handle = createSandMesh(4, 4, 100, 100);
    const u = handle.material.uniforms;
    expect(u.uNoise).toBeDefined();
    expect(u.uNoise.value).toBeInstanceOf(THREE.DataTexture);
    expect(u.uNoise.value).toBe(handle.noiseTexture);
    expect(u.uNoiseScale).toBeDefined();
    expect(u.uNoiseScale.value).toBeCloseTo(5.0);
  });

  it('honours an explicit noiseScaleMm argument', () => {
    const handle = createSandMesh(4, 4, 100, 100, undefined, 12.5);
    expect(handle.material.uniforms.uNoiseScale.value).toBeCloseTo(12.5);
  });

  it('uses the supplied noise texture when one is provided', () => {
    const tex = new THREE.DataTexture(
      new Uint8Array(4),
      2,
      2,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    const handle = createSandMesh(4, 4, 100, 100, tex);
    expect(handle.material.uniforms.uNoise.value).toBe(tex);
    expect(handle.noiseTexture).toBe(tex);
  });

  it('vertex shader derives the noise UV from object-space position (world-anchored grain)', () => {
    const handle = createSandMesh(3, 3, 10, 10);
    expect(handle.material.vertexShader).toContain('uNoiseScale');
    expect(handle.material.vertexShader).toMatch(/position\.xy\s*\/\s*uNoiseScale/);
  });

  it('fragment shader samples uNoise and modulates the base colour with mix(0.85, 1.15, noise)', () => {
    const handle = createSandMesh(3, 3, 10, 10);
    expect(handle.material.fragmentShader).toContain('uNoise');
    expect(handle.material.fragmentShader).toContain('texture2D(uNoise');
    expect(handle.material.fragmentShader).toContain('mix(0.85, 1.15, noise)');
  });

  it('fragment shader perturbs the surface normal before the diffuse term', () => {
    const handle = createSandMesh(3, 3, 10, 10);
    const src = handle.material.fragmentShader;
    const perturbIdx = src.indexOf('perturbed');
    const diffIdx = src.indexOf('max(dot(');
    expect(perturbIdx).toBeGreaterThan(-1);
    expect(diffIdx).toBeGreaterThan(perturbIdx);
    expect(src).toContain('(noise - 0.5) * 0.1');
  });
});

describe('updateSandMesh', () => {
  it('writes the heightmap into texture.image.data and bumps texture.version', () => {
    const handle = createSandMesh(2, 2, 10, 10);
    const versionBefore = handle.texture.version;
    const data = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    updateSandMesh(handle, data);
    const tex = handle.texture.image.data as unknown as Float32Array;
    expect(Array.from(tex)).toEqual([1.0, 2.0, 3.0, 4.0]);
    expect(handle.texture.version).toBeGreaterThan(versionBefore);
  });

  it('copies the heightmap rather than retaining a reference to it', () => {
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
