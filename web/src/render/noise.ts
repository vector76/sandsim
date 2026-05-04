import * as THREE from 'three';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createNoiseTexture(size = 256): THREE.DataTexture {
  const rand = mulberry32(0x9e3779b1);
  const n = size * size;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = rand();

  const blurred = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = (y + dy + size) % size;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = (x + dx + size) % size;
          sum += raw[yy * size + xx];
        }
      }
      blurred[y * size + x] = sum / 9;
    }
  }

  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    data[i] = Math.max(0, Math.min(255, Math.round(blurred[i] * 255)));
  }

  const tex = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}
