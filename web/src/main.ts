import type { Line, Material } from 'three';
import { initScene } from './render/scene.js';
import { buildToolpathLine } from './render/toolpath.js';
import { setupFileDrop } from './ui/file-drop.js';
import { renderWarnings } from './ui/warnings.js';
import { parseGcode } from './wasm.js';
import { DEFAULT_CONFIG } from './types.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const warningsEl = document.getElementById('warnings') as HTMLElement;

const sceneHandle = initScene(canvas, DEFAULT_CONFIG.table_width_mm, DEFAULT_CONFIG.table_height_mm);

let currentLine: Line | null = null;

setupFileDrop(async (text: string) => {
  try {
    const output = await parseGcode(text, DEFAULT_CONFIG);
    if (currentLine !== null) {
      sceneHandle.removeLine(currentLine);
      currentLine.geometry.dispose();
      (currentLine.material as Material).dispose();
    }
    currentLine = buildToolpathLine(output.moves, DEFAULT_CONFIG.ball_radius_mm);
    sceneHandle.addLine(currentLine);
    renderWarnings(warningsEl, output.warnings);
  } catch (err) {
    console.error('Failed to parse gcode:', err);
  }
});

renderWarnings(warningsEl, []);
