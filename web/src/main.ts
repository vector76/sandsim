import { initScene } from './render/scene.js';
import { setupFileDrop } from './ui/file-drop.js';
import { renderWarnings } from './ui/warnings.js';
import { createSandMesh, updateSandMesh } from './render/sand-mesh.js';
import { createBallMesh, updateBallMesh } from './render/ball.js';
import { DEFAULT_SIM_CONFIG } from './types.js';
import type { WorkerMessage, MainMessage } from './sim-protocol.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const warningsEl = document.getElementById('warnings') as HTMLElement;

const cfg = DEFAULT_SIM_CONFIG;
const nx = Math.ceil(cfg.table_width_mm / cfg.cell_mm);
const ny = Math.ceil(cfg.table_height_mm / cfg.cell_mm);

const sceneHandle = initScene(canvas, cfg.table_width_mm, cfg.table_height_mm);
const sandMesh = createSandMesh(nx, ny, cfg.table_width_mm, cfg.table_height_mm);
sceneHandle.addObject(sandMesh);
const ballMesh = createBallMesh(cfg.ball_radius_mm);
sceneHandle.addObject(ballMesh);

let workerReady = false;
let pendingGcode: string | null = null;

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

worker.onmessage = (evt: MessageEvent<WorkerMessage>) => {
  const msg = evt.data;
  switch (msg.type) {
    case 'ready':
      workerReady = true;
      worker.postMessage({ type: 'config', config: cfg } as MainMessage);
      if (pendingGcode !== null) {
        worker.postMessage({ type: 'load', gcode: pendingGcode, mode: 'reset' } as MainMessage);
        pendingGcode = null;
      }
      break;
    case 'warnings':
      renderWarnings(warningsEl, msg.warnings);
      break;
    case 'frame': {
      const view = new Float32Array(msg.buf);
      updateSandMesh(sandMesh, view, nx);
      updateBallMesh(ballMesh, msg.ballPos.x, msg.ballPos.y, cfg.ball_radius_mm);
      worker.postMessage({ type: 'release', buf: msg.buf } as MainMessage, [msg.buf]);
      break;
    }
    case 'done':
      console.log('Simulation complete');
      break;
  }
};

setupFileDrop((text: string) => {
  if (!workerReady) { pendingGcode = text; return; }
  worker.postMessage({ type: 'load', gcode: text, mode: 'reset' } as MainMessage);
});

renderWarnings(warningsEl, []);
