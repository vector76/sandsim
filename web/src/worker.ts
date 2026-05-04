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

let tickCount = 0;
function tick(): void {
  tickScheduled = false;
  if (!running || !sim) return;
  const now = performance.now();
  const dt = lastTime !== null ? (now - lastTime) / 1000 : 0;
  lastTime = now;
  const beforePos = sim.ball_position();
  sim.step(dt);
  const afterPos = sim.ball_position();
  tickCount++;
  if (tickCount <= 5 || tickCount % 120 === 0) {
    const moved = Math.hypot(afterPos[0] - beforePos[0], afterPos[1] - beforePos[1]);
    self.postMessage({
      type: 'debug',
      msg: `tick=${tickCount} dt=${dt.toFixed(4)} before=(${beforePos[0].toFixed(2)},${beforePos[1].toFixed(2)}) after=(${afterPos[0].toFixed(2)},${afterPos[1].toFixed(2)}) moved=${moved.toFixed(4)} done=${sim.is_done()}`,
    } as unknown as WorkerMessage);
  }
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
      const c = msg.config as any;
      sim = new WasmSim(
        c.table_width_mm,
        c.table_height_mm,
        c.cell_mm,
        c.h0_mm,
        c.ball_radius_mm,
        c.default_feedrate_mm_per_min,
        c.interp_fraction,
        c.theta_repose_deg,
        c.n_segments,
        c.repose_max_iters,
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
      const beforeLoad = sim.ball_position();
      const beforeDone = sim.is_done();
      const result = sim.load(msg.gcode, msg.mode) as { warnings: Warning[] };
      const afterLoad = sim.ball_position();
      const afterDone = sim.is_done();
      sim.step(0.05);
      const afterStep = sim.ball_position();
      self.postMessage({
        type: 'debug',
        msg: `LOAD: gcodelen=${msg.gcode.length} mode=${msg.mode} warns=${result.warnings.length} beforePos=(${beforeLoad[0].toFixed(2)},${beforeLoad[1].toFixed(2)}) beforeDone=${beforeDone} afterPos=(${afterLoad[0].toFixed(2)},${afterLoad[1].toFixed(2)}) afterDone=${afterDone} stepPos=(${afterStep[0].toFixed(2)},${afterStep[1].toFixed(2)})`,
      } as unknown as WorkerMessage);
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
