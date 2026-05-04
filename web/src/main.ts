import { initScene } from './render/scene.js';
import { setupFileDrop, setupBuiltinFixtures } from './ui/file-drop.js';
import { renderWarnings } from './ui/warnings.js';
import { setupControls } from './ui/controls.js';
import type { Warning, SimConfig } from './types.js';
import { createSandMesh, updateSandMesh, checkFloatTextureSupport, type SandMeshHandle } from './render/sand-mesh.js';
import { createBallMesh, updateBallMesh } from './render/ball.js';
import { DEFAULT_SIM_CONFIG, tableWidthMm, tableHeightMm } from './types.js';
import type { WorkerMessage, MainMessage } from './sim-protocol.js';
import type * as THREE from 'three';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const warningsEl = document.getElementById('warnings') as HTMLElement;

const DEBUG_PREF_KEY = 'sandsim.showDebug';
const debugVisible = localStorage.getItem(DEBUG_PREF_KEY) === '1';

const debugEl = document.createElement('div');
debugEl.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:10;background:rgba(0,0,0,0.6);color:#0f0;font:12px monospace;padding:6px;max-width:60vw;white-space:pre-wrap;';
debugEl.style.display = debugVisible ? '' : 'none';
document.body.appendChild(debugEl);

function setDebugVisible(v: boolean): void {
  debugEl.style.display = v ? '' : 'none';
  localStorage.setItem(DEBUG_PREF_KEY, v ? '1' : '0');
}

let frameCount = 0;
function dbg(s: string): void {
  const t = (performance.now() / 1000).toFixed(2);
  debugEl.textContent = `[${t}s] ${s}\n` + debugEl.textContent;
  if (debugEl.textContent.length > 2000) debugEl.textContent = debugEl.textContent.slice(0, 2000);
}
dbg('main.ts loaded');

let cfg: SimConfig = { ...DEFAULT_SIM_CONFIG };
let nx = Math.ceil(tableWidthMm(cfg) / cfg.cell_mm);
let ny = Math.ceil(tableHeightMm(cfg) / cfg.cell_mm);

const sceneHandle = initScene(canvas, tableWidthMm(cfg), tableHeightMm(cfg));
checkFloatTextureSupport(sceneHandle.renderer);

let sandHandle: SandMeshHandle = createSandMesh(nx, ny, tableWidthMm(cfg), tableHeightMm(cfg));
sandHandle.material.uniforms.uLightDir = sceneHandle.lighting.uniforms.uLightDir;
sandHandle.material.uniforms.uLightColor = sceneHandle.lighting.uniforms.uLightColor;
sandHandle.material.uniforms.uAmbient = sceneHandle.lighting.uniforms.uAmbient;
updateSandMesh(sandHandle, new Float32Array(nx * ny).fill(cfg.h0_mm));
sceneHandle.addObject(sandHandle.mesh);

let ballMesh: THREE.Mesh = createBallMesh(cfg.ball_radius_mm);
updateBallMesh(ballMesh, cfg.ball_radius_mm, cfg.ball_radius_mm, cfg.ball_radius_mm);
sceneHandle.addObject(ballMesh);

let workerReady = false;
let pendingLoad: { gcode: string; mode: 'reset' | 'append' } | null = null;
let lastLoadMode: 'reset' | 'append' = 'reset';
let accumulatedWarnings: Warning[] = [];
let lastGcode: string | null = null;

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
        lastLoadMode = pendingLoad.mode;
        lastGcode = pendingLoad.gcode;
        worker.postMessage({ type: 'load', gcode: pendingLoad.gcode, mode: pendingLoad.mode } as MainMessage);
        dbg('sent pending load');
        pendingLoad = null;
      }
      break;
    case 'warnings':
      dbg('warnings: ' + msg.warnings.length);
      accumulatedWarnings = lastLoadMode === 'append'
        ? accumulatedWarnings.concat(msg.warnings)
        : msg.warnings.slice();
      renderWarnings(warningsEl, accumulatedWarnings);
      break;
    case 'frame': {
      frameCount++;
      if (frameCount <= 3 || frameCount % 60 === 0) {
        dbg(`frame #${frameCount} ball=(${msg.ballPos.x.toFixed(1)},${msg.ballPos.y.toFixed(1)}) t=${msg.simTime.toFixed(2)}`);
      }
      if (msg.nx !== nx || msg.ny !== ny) {
        // Stale frame from a previous config; worker has already reallocated, so let GC reclaim it.
        break;
      }
      const view = new Float32Array(msg.buf);
      updateSandMesh(sandHandle, view);
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

function handleGcodeLoad(text: string, mode: 'reset' | 'append'): void {
  dbg(`file received (${text.length} chars), mode=${mode}, workerReady=${workerReady}`);
  lastGcode = text;
  if (!workerReady) { pendingLoad = { gcode: text, mode }; return; }
  lastLoadMode = mode;
  worker.postMessage({ type: 'load', gcode: text, mode } as MainMessage);
  dbg('sent load to worker');
}

setupFileDrop(handleGcodeLoad);
setupBuiltinFixtures(handleGcodeLoad);

setupControls({
  initial: cfg,
  onApply: (newCfg: SimConfig) => {
    dbg('controls apply');
    const oldRadius = cfg.ball_radius_mm;
    cfg = newCfg;
    nx = Math.ceil(tableWidthMm(cfg) / cfg.cell_mm);
    ny = Math.ceil(tableHeightMm(cfg) / cfg.cell_mm);

    sceneHandle.removeObject(sandHandle.mesh);
    sandHandle.mesh.geometry.dispose();
    sandHandle.material.dispose();
    sandHandle.texture.dispose();
    sandHandle.noiseTexture.dispose();
    sandHandle = createSandMesh(nx, ny, tableWidthMm(cfg), tableHeightMm(cfg));
    sandHandle.material.uniforms.uLightDir = sceneHandle.lighting.uniforms.uLightDir;
    sandHandle.material.uniforms.uLightColor = sceneHandle.lighting.uniforms.uLightColor;
    sandHandle.material.uniforms.uAmbient = sceneHandle.lighting.uniforms.uAmbient;
    updateSandMesh(sandHandle, new Float32Array(nx * ny).fill(cfg.h0_mm));
    sceneHandle.addObject(sandHandle.mesh);

    if (cfg.ball_radius_mm !== oldRadius) {
      sceneHandle.removeObject(ballMesh);
      ballMesh.geometry.dispose();
      (ballMesh.material as THREE.Material).dispose();
      ballMesh = createBallMesh(cfg.ball_radius_mm);
      updateBallMesh(ballMesh, cfg.ball_radius_mm, cfg.ball_radius_mm, cfg.ball_radius_mm);
      sceneHandle.addObject(ballMesh);
    }

    if (!workerReady) {
      // 'ready' handler will post the current cfg (and pendingLoad if any) once init completes.
      return;
    }

    worker.postMessage({ type: 'config', config: cfg } as MainMessage);

    if (lastGcode !== null) {
      lastLoadMode = 'reset';
      worker.postMessage({ type: 'load', gcode: lastGcode, mode: 'reset' } as MainMessage);
      dbg('re-sent last gcode after reconfig');
    }
  },
  onLighting: {
    setAzimuth: sceneHandle.lighting.setAzimuth,
    setAltitude: sceneHandle.lighting.setAltitude,
    setBalance: sceneHandle.lighting.setBalance,
  },
  onDebugToggle: {
    initial: debugVisible,
    setVisible: setDebugVisible,
  },
});

renderWarnings(warningsEl, []);
