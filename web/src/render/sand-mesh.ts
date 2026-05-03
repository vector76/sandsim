import * as THREE from 'three';

export interface SandMeshHandle {
  mesh: THREE.Mesh;
  texture: THREE.DataTexture;
  nx: number;
  ny: number;
}

export function createSandMesh(nx: number, ny: number, tableW: number, tableH: number): SandMeshHandle {
  const geo = new THREE.PlaneGeometry(tableW, tableH, nx - 1, ny - 1);
  geo.translate(tableW / 2, tableH / 2, 0);

  const data = new Float32Array(nx * ny);
  const texture = new THREE.DataTexture(data, nx, ny, THREE.RedFormat, THREE.FloatType);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const mat = new THREE.MeshLambertMaterial({ color: 0xc2a97a });
  const mesh = new THREE.Mesh(geo, mat);

  return { mesh, texture, nx, ny };
}

export function updateSandMesh(handle: SandMeshHandle, heightmap: Float32Array): void {
  const data = handle.texture.image.data as unknown as Float32Array;
  data.set(heightmap);
  handle.texture.needsUpdate = true;
}

export function checkFloatTextureSupport(renderer: THREE.WebGLRenderer): boolean {
  const caps = renderer.capabilities;
  if (!caps || !caps.isWebGL2) {
    console.error('SandSim: WebGL2 is required for R32F float textures; current context is not WebGL2.');
    return false;
  }
  const gl = renderer.getContext();
  if (!gl.getExtension('OES_texture_float_linear')) {
    console.error('SandSim: OES_texture_float_linear extension is not available; float-texture linear filtering will not work.');
    return false;
  }
  return true;
}
