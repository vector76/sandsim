import * as THREE from 'three';

export function createBallMesh(r_mm: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(r_mm, 16, 16);
  const mat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  return new THREE.Mesh(geo, mat);
}

export function updateBallMesh(mesh: THREE.Mesh, x: number, y: number, r_mm: number): void {
  mesh.position.set(x, y, r_mm);
}
