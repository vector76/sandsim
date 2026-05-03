import type { Warning, SimConfig } from './types.js';

export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'warnings'; warnings: Warning[] }
  | { type: 'frame'; buf: ArrayBuffer; nx: number; ny: number; ballPos: { x: number; y: number }; simTime: number }
  | { type: 'done' };

export type MainMessage =
  | { type: 'config'; config: SimConfig }
  | { type: 'load'; gcode: string; mode: 'reset' | 'append' }
  | { type: 'release'; buf: ArrayBuffer }
  | { type: 'stop' };
