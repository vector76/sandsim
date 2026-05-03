import { initScene } from './render/scene.js';
import { setupFileDrop } from './ui/file-drop.js';
import { renderWarnings } from './ui/warnings.js';
import { createSandMesh, updateSandMesh } from './render/sand-mesh.js';
import { createBallMesh, updateBallMesh } from './render/ball.js';
import { DEFAULT_SIM_CONFIG } from './types.js';
import type { WorkerMessage, MainMessage } from './sim-protocol.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const warningsEl = document.getElementById('warnings') as HTMLElement;

const DEBUG_PREF_KEY = 'sandsim.showDebug';
const debugVisible = localStorage.getItem(DEBUG_PREF_KEY) === '1';

const debugToggleLabel = document.createElement('label');
debugToggleLabel.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:11;background:rgba(0,0,0,0.6);color:#eee;font:12px sans-serif;padding:4px 6px;cursor:pointer;user-select:none;';
const debugToggle = document.createElement('input');
debugToggle.type = 'checkbox';
debugToggle.checked = debugVisible;
debugToggleLabel.appendChild(debugToggle);
debugToggleLabel.appendChild(document.createTextNode(' debug log'));
document.body.appendChild(debugToggleLabel);

const debugEl = document.createElement('div');
debugEl.style.cssText = 'position:fixed;bottom:36px;left:8px;z-index:10;background:rgba(0,0,0,0.6);color:#0f0;font:12px monospace;padding:6px;max-width:60vw;white-space:pre-wrap;';
debugEl.style.display = debugVisible ? '' : 'none';
document.body.appendChild(debugEl);
debugToggle.addEventListener('change', () => {
  debugEl.style.display = debugToggle.checked ? '' : 'none';
  localStorage.setItem(DEBUG_PREF_KEY, debugToggle.checked ? '1' : '0');
});

let frameCount = 0;
function dbg(s: string): void {
  const t = (performance.now() / 1000).toFixed(2);
  debugEl.textContent = `[${t}s] ${s}\n` + debugEl.textContent;
  if (debugEl.textContent.length > 2000) debugEl.textContent = debugEl.textContent.slice(0, 2000);
}
dbg('main.ts loaded');

const cfg = DEFAULT_SIM_CONFIG;
const nx = Math.ceil(cfg.table_width_mm / cfg.cell_mm);
const ny = Math.ceil(cfg.table_height_mm / cfg.cell_mm);

const sceneHandle = initScene(canvas, cfg.table_width_mm, cfg.table_height_mm);
const sandMesh = createSandMesh(nx, ny, cfg.table_width_mm, cfg.table_height_mm);
sceneHandle.addObject(sandMesh);
const ballMesh = createBallMesh(cfg.ball_radius_mm);
sceneHandle.addObject(ballMesh);

let workerReady = false;
let pendingLoad: { gcode: string; mode: 'reset' | 'append' } | null = null;

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
worker.onerror = (e) => dbg('WORKER ERROR: ' + (e.message || e));
worker.onmessageerror = (e) => dbg('WORKER MSG ERROR: ' + JSON.stringify(e));
dbg('Worker constructed');

worker.onmessage = (evt: MessageEvent<WorkerMessage>) => {
  const msg = evt.data;
  switch (msg.type) {
    case 'ready':
      dbg('worker ready');
      workerReady = true;
      worker.postMessage({ type: 'config', config: cfg } as MainMessage);
      dbg('sent config');
      if (pendingLoad !== null) {
        worker.postMessage({ type: 'load', gcode: pendingLoad.gcode, mode: pendingLoad.mode } as MainMessage);
        dbg('sent pending load');
        pendingLoad = null;
      }
      break;
    case 'warnings':
      dbg('warnings: ' + msg.warnings.length);
      renderWarnings(warningsEl, msg.warnings);
      break;
    case 'frame': {
      frameCount++;
      if (frameCount <= 3 || frameCount % 60 === 0) {
        dbg(`frame #${frameCount} ball=(${msg.ballPos.x.toFixed(1)},${msg.ballPos.y.toFixed(1)}) t=${msg.simTime.toFixed(2)}`);
      }
      const view = new Float32Array(msg.buf);
      updateSandMesh(sandMesh, view, nx);
      updateBallMesh(ballMesh, msg.ballPos.x, msg.ballPos.y, cfg.ball_radius_mm);
      worker.postMessage({ type: 'release', buf: msg.buf } as MainMessage, [msg.buf]);
      break;
    }
    case 'done':
      dbg('simulation done');
      break;
    default:
      if ((msg as { type: string }).type === 'debug') {
        dbg('W: ' + (msg as unknown as { msg: string }).msg);
      }
      break;
  }
};

setupFileDrop((text: string, mode: 'reset' | 'append') => {
  dbg(`file received (${text.length} chars), mode=${mode}, workerReady=${workerReady}`);
  if (!workerReady) { pendingLoad = { gcode: text, mode }; return; }
  worker.postMessage({ type: 'load', gcode: text, mode } as MainMessage);
  dbg('sent load to worker');
});

renderWarnings(warningsEl, []);
