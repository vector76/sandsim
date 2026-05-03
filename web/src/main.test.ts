// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_SIM_CONFIG } from './types.js';

const {
  mockAddObject,
  mockInitScene,
  mockCreateSandMesh,
  mockUpdateSandMesh,
  mockCheckFloatTextureSupport,
  mockCreateBallMesh,
  mockUpdateBallMesh,
  mockSetupFileDrop,
  mockRenderWarnings,
} = vi.hoisted(() => {
  const mockAddObject = vi.fn();
  const mockRenderer = {
    capabilities: { isWebGL2: true },
    getContext: () => ({ getExtension: () => ({}) }),
  };
  const mockInitScene = vi.fn(() => ({
    addLine: vi.fn(),
    removeLine: vi.fn(),
    addObject: mockAddObject,
    removeObject: vi.fn(),
    renderer: mockRenderer,
    dispose: vi.fn(),
  }));
  const mockCreateSandMesh = vi.fn(() => ({ __kind: 'sand', mesh: { __kind: 'sandMesh' } }));
  const mockUpdateSandMesh = vi.fn();
  const mockCheckFloatTextureSupport = vi.fn(() => true);
  const mockCreateBallMesh = vi.fn(() => ({ __kind: 'ball' }));
  const mockUpdateBallMesh = vi.fn();
  const mockSetupFileDrop = vi.fn();
  const mockRenderWarnings = vi.fn();
  return {
    mockAddObject,
    mockInitScene,
    mockCreateSandMesh,
    mockUpdateSandMesh,
    mockCheckFloatTextureSupport,
    mockCreateBallMesh,
    mockUpdateBallMesh,
    mockSetupFileDrop,
    mockRenderWarnings,
  };
});

vi.mock('./render/scene.js', () => ({ initScene: mockInitScene }));
vi.mock('./render/sand-mesh.js', () => ({
  createSandMesh: mockCreateSandMesh,
  updateSandMesh: mockUpdateSandMesh,
  checkFloatTextureSupport: mockCheckFloatTextureSupport,
}));
vi.mock('./render/ball.js', () => ({
  createBallMesh: mockCreateBallMesh,
  updateBallMesh: mockUpdateBallMesh,
}));
vi.mock('./ui/file-drop.js', () => ({ setupFileDrop: mockSetupFileDrop }));
vi.mock('./ui/warnings.js', () => ({ renderWarnings: mockRenderWarnings }));

class FakeWorker {
  onmessage: ((evt: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  static lastInstance: FakeWorker | null = null;
  constructor(public url: string | URL, public options?: WorkerOptions) {
    FakeWorker.lastInstance = this;
  }
  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function setupDom(): void {
  document.body.innerHTML = `
    <canvas id="canvas"></canvas>
    <div id="warnings"></div>
    <input type="file" id="file-input" />
  `;
}

describe('main bootstrap', () => {
  beforeEach(() => {
    setupDom();
    vi.clearAllMocks();
    vi.resetModules();
    FakeWorker.lastInstance = null;
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls initScene with canvas and DEFAULT_SIM_CONFIG dimensions', async () => {
    await import('./main.js');
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    expect(mockInitScene).toHaveBeenCalledWith(
      canvas,
      DEFAULT_SIM_CONFIG.table_width_mm,
      DEFAULT_SIM_CONFIG.table_height_mm,
    );
  });

  it('creates sand and ball meshes and adds them to the scene', async () => {
    await import('./main.js');
    const expectedNx = Math.ceil(
      DEFAULT_SIM_CONFIG.table_width_mm / DEFAULT_SIM_CONFIG.cell_mm,
    );
    const expectedNy = Math.ceil(
      DEFAULT_SIM_CONFIG.table_height_mm / DEFAULT_SIM_CONFIG.cell_mm,
    );
    expect(mockCreateSandMesh).toHaveBeenCalledWith(
      expectedNx,
      expectedNy,
      DEFAULT_SIM_CONFIG.table_width_mm,
      DEFAULT_SIM_CONFIG.table_height_mm,
    );
    expect(mockCreateBallMesh).toHaveBeenCalledWith(DEFAULT_SIM_CONFIG.ball_radius_mm);
    expect(mockAddObject).toHaveBeenCalledTimes(2);
    expect(mockAddObject).toHaveBeenCalledWith({ __kind: 'sandMesh' });
    expect(mockAddObject).toHaveBeenCalledWith({ __kind: 'ball' });
  });

  it('runs the float-texture capability check against the scene renderer', async () => {
    await import('./main.js');
    expect(mockCheckFloatTextureSupport).toHaveBeenCalledTimes(1);
    const sceneInstance = mockInitScene.mock.results[0].value as { renderer: unknown };
    expect(mockCheckFloatTextureSupport).toHaveBeenCalledWith(sceneInstance.renderer);
  });

  it('renders empty warnings on startup', async () => {
    await import('./main.js');
    expect(mockRenderWarnings).toHaveBeenCalledWith(
      document.getElementById('warnings'),
      [],
    );
  });

  it('sends config to worker after ready message', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    expect(worker).not.toBeNull();
    worker.emit({ type: 'ready' });
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'config',
      config: DEFAULT_SIM_CONFIG,
    });
  });

  it('queues file drop before ready and sends load after ready', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    const fileCallback = mockSetupFileDrop.mock.calls[0][0] as (
      text: string,
      mode: 'reset' | 'append',
    ) => void;

    fileCallback('G0 X10', 'reset');
    expect(worker.postMessage).not.toHaveBeenCalled();

    worker.emit({ type: 'ready' });

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'config',
      config: DEFAULT_SIM_CONFIG,
    });
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'load',
      gcode: 'G0 X10',
      mode: 'reset',
    });
  });

  it('posts load immediately when file drop occurs after ready', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });
    worker.postMessage.mockClear();

    const fileCallback = mockSetupFileDrop.mock.calls[0][0] as (
      text: string,
      mode: 'reset' | 'append',
    ) => void;
    fileCallback('G1 X20', 'reset');

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'load',
      gcode: 'G1 X20',
      mode: 'reset',
    });
  });

  it('forwards append mode from file drop callback to worker', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });
    worker.postMessage.mockClear();

    const fileCallback = mockSetupFileDrop.mock.calls[0][0] as (
      text: string,
      mode: 'reset' | 'append',
    ) => void;
    fileCallback('G1 X30', 'append');

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'load',
      gcode: 'G1 X30',
      mode: 'append',
    });
  });

  it('updates sand and ball meshes and releases buffer on frame message', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });
    worker.postMessage.mockClear();

    const expectedNx = Math.ceil(
      DEFAULT_SIM_CONFIG.table_width_mm / DEFAULT_SIM_CONFIG.cell_mm,
    );
    const expectedNy = Math.ceil(
      DEFAULT_SIM_CONFIG.table_height_mm / DEFAULT_SIM_CONFIG.cell_mm,
    );
    const buf = new ArrayBuffer(expectedNx * expectedNy * 4);
    worker.emit({
      type: 'frame',
      buf,
      nx: expectedNx,
      ny: expectedNy,
      ballPos: { x: 12, y: 34 },
      simTime: 0.5,
    });

    expect(mockUpdateSandMesh).toHaveBeenCalledTimes(1);
    const updateCall = mockUpdateSandMesh.mock.calls[0];
    expect(updateCall[0]).toEqual({ __kind: 'sand', mesh: { __kind: 'sandMesh' } });
    expect(updateCall[1]).toBeInstanceOf(Float32Array);
    expect((updateCall[1] as Float32Array).buffer).toBe(buf);
    expect(updateCall.length).toBe(2);

    expect(mockUpdateBallMesh).toHaveBeenCalledWith(
      { __kind: 'ball' },
      12,
      34,
      DEFAULT_SIM_CONFIG.ball_radius_mm,
    );

    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'release', buf },
      [buf],
    );
  });

  it('renders warnings when worker posts warnings message', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    mockRenderWarnings.mockClear();

    const warnings = [{ line: 3, message: 'oops', source: 'parser' }];
    worker.emit({ type: 'warnings', warnings });

    expect(mockRenderWarnings).toHaveBeenCalledWith(
      document.getElementById('warnings'),
      warnings,
    );
  });

  it('replaces accumulated warnings when last load was reset', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });

    const fileCallback = mockSetupFileDrop.mock.calls[0][0] as (
      text: string,
      mode: 'reset' | 'append',
    ) => void;

    const first = [{ line: 1, message: 'a', source: 'parser' }];
    worker.emit({ type: 'warnings', warnings: first });

    fileCallback('G0', 'reset');
    const second = [{ line: 2, message: 'b', source: 'parser' }];
    mockRenderWarnings.mockClear();
    worker.emit({ type: 'warnings', warnings: second });

    expect(mockRenderWarnings).toHaveBeenLastCalledWith(
      document.getElementById('warnings'),
      second,
    );
  });

  it('concatenates warnings when last load was append', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });

    const fileCallback = mockSetupFileDrop.mock.calls[0][0] as (
      text: string,
      mode: 'reset' | 'append',
    ) => void;

    fileCallback('G0', 'reset');
    const first = [{ line: 1, message: 'a', source: 'parser' }];
    worker.emit({ type: 'warnings', warnings: first });

    fileCallback('G1', 'append');
    const second = [{ line: 2, message: 'b', source: 'parser' }];
    mockRenderWarnings.mockClear();
    worker.emit({ type: 'warnings', warnings: second });

    expect(mockRenderWarnings).toHaveBeenLastCalledWith(
      document.getElementById('warnings'),
      [...first, ...second],
    );
  });

  it('clears accumulated warnings when switching back to reset after append', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });

    const fileCallback = mockSetupFileDrop.mock.calls[0][0] as (
      text: string,
      mode: 'reset' | 'append',
    ) => void;

    fileCallback('G0', 'reset');
    worker.emit({ type: 'warnings', warnings: [{ line: 1, message: 'a', source: 'parser' }] });
    fileCallback('G1', 'append');
    worker.emit({ type: 'warnings', warnings: [{ line: 2, message: 'b', source: 'parser' }] });

    fileCallback('G2', 'reset');
    const fresh = [{ line: 9, message: 'fresh', source: 'parser' }];
    mockRenderWarnings.mockClear();
    worker.emit({ type: 'warnings', warnings: fresh });

    expect(mockRenderWarnings).toHaveBeenLastCalledWith(
      document.getElementById('warnings'),
      fresh,
    );
  });
});
