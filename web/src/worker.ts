/// <reference lib="webworker" />
import init, { Sim as WasmSim } from '../pkg/sandsim_wasm.js';
import type { WorkerMessage, MainMessage } from './sim-protocol.js';
import type { Warning } from './types.js';

declare const self: DedicatedWorkerGlobalScope;

let initPromise: Promise<void> | null = null;

async function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = init().then(() => {});
  }
  return initPromise;
}

let sim: WasmSim | null = null;
let bufA: ArrayBuffer | null = null;
let bufB: ArrayBuffer | null = null;
let running = false;
let simTime = 0;
let lastTime: number | null = null;
let tickScheduled = false;

function tick(): void {
  tickScheduled = false;
  if (!running || !sim) return;
  const now = performance.now();
  const dt = lastTime !== null ? (now - lastTime) / 1000 : 0;
  lastTime = now;
  sim.step(dt);
  simTime += dt;

  const freeBuf = bufA ?? bufB ?? null;
  if (freeBuf !== null) {
    const view = new Float32Array(freeBuf);
    sim.fill_heightmap(view);
    const [bx, by] = sim.ball_position();
    if (freeBuf === bufA) bufA = null;
    else bufB = null;
    const msg: WorkerMessage = {
      type: 'frame',
      buf: freeBuf,
      nx: sim.nx(),
      ny: sim.ny(),
      ballPos: { x: bx, y: by },
      simTime,
    };
    self.postMessage(msg, [freeBuf]);
  }

  if (sim.is_done()) {
    const done: WorkerMessage = { type: 'done' };
    self.postMessage(done);
    running = false;
    return;
  }
  scheduleTick();
}

function scheduleTick(): void {
  if (tickScheduled) return;
  tickScheduled = true;
  setTimeout(tick, 0);
}

ensureInit().then(() => {
  const ready: WorkerMessage = { type: 'ready' };
  self.postMessage(ready);
});

self.onmessage = (event: MessageEvent<MainMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'config': {
      const c = msg.config;
      sim = new WasmSim(
        c.table_width_mm,
        c.table_height_mm,
        c.cell_mm,
        c.h0_mm,
        c.ball_radius_mm,
        c.default_feedrate_mm_per_min,
      );
      const nx = sim.nx();
      const ny = sim.ny();
      bufA = new ArrayBuffer(nx * ny * 4);
      bufB = new ArrayBuffer(nx * ny * 4);
      running = true;
      simTime = 0;
      lastTime = null;
      scheduleTick();
      break;
    }
    case 'load': {
      if (!sim) return;
      const result = sim.load(msg.gcode, msg.mode) as { warnings: Warning[] };
      const warningsMsg: WorkerMessage = { type: 'warnings', warnings: result.warnings };
      self.postMessage(warningsMsg);
      if (msg.mode === 'reset') {
        simTime = 0;
        lastTime = null;
      }
      if (!running) {
        running = true;
        lastTime = null;
        scheduleTick();
      }
      break;
    }
    case 'release': {
      if (bufA === null) bufA = msg.buf;
      else bufB = msg.buf;
      break;
    }
    case 'stop': {
      running = false;
      break;
    }
  }
};
