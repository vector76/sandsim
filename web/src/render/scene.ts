import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface SceneHandle {
  addLine(line: THREE.Line): void;
  removeLine(line: THREE.Line): void;
  addObject(obj: THREE.Object3D): void;
  removeObject(obj: THREE.Object3D): void;
  dispose(): void;
}

export function initScene(canvas: HTMLCanvasElement, tableW: number, tableH: number): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas });

  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  renderer.setSize(w, h, false);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, w / (h || 1), 0.1, 10000);
  camera.up.set(0, 0, 1);
  camera.position.set(tableW / 2, -tableH, tableH * 1.5);
  camera.lookAt(tableW / 2, tableH / 2, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(tableW / 2, tableH / 2, 0);
  controls.update();

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(tableW, tableH, tableH);
  scene.add(dirLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const tableMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(tableW, tableH),
    new THREE.MeshLambertMaterial({ color: 0xc2a97a }),
  );
  tableMesh.position.set(tableW / 2, tableH / 2, -0.1);
  scene.add(tableMesh);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  const onResize = () => {
    const newW = canvas.clientWidth || canvas.width;
    const newH = canvas.clientHeight || canvas.height;
    renderer.setSize(newW, newH, false);
    camera.aspect = newW / (newH || 1);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return {
    addLine(line: THREE.Line): void {
      scene.add(line);
    },
    removeLine(line: THREE.Line): void {
      scene.remove(line);
    },
    addObject(obj: THREE.Object3D): void {
      scene.add(obj);
    },
    removeObject(obj: THREE.Object3D): void {
      scene.remove(obj);
    },
    dispose(): void {
      window.removeEventListener('resize', onResize);
    },
  };
}
