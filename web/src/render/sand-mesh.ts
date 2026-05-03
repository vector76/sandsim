import * as THREE from 'three';

export function createSandMesh(nx: number, ny: number, tableW: number, tableH: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(tableW, tableH, nx - 1, ny - 1);
  geo.translate(tableW / 2, tableH / 2, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0xc2a97a });
  return new THREE.Mesh(geo, mat);
}

export function updateSandMesh(mesh: THREE.Mesh, heightmap: Float32Array, nx: number): void {
  const ny = heightmap.length / nx;
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < heightmap.length; k++) {
    pos.setZ(k, heightmap[(ny - 1 - Math.floor(k / nx)) * nx + (k % nx)]);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}
