import * as THREE from 'three';
import type { MoveEvent } from '../types.js';

export function buildToolpathLine(moves: MoveEvent[], ballRadiusMm: number): THREE.Line {
  const points: THREE.Vector3[] = [];
  // Starting position: gcode origin = (0,0), table frame = (r, r)
  points.push(new THREE.Vector3(ballRadiusMm, ballRadiusMm, 0.1));
  for (const move of moves) {
    // gcode-to-table-frame translation: +r on both axes
    // z=0.1 prevents z-fighting with the table at z=0
    points.push(new THREE.Vector3(move.x_mm + ballRadiusMm, move.y_mm + ballRadiusMm, 0.1));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x1a73e8, linewidth: 1 });
  return new THREE.Line(geometry, material);
}
