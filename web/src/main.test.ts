// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_SIM_CONFIG, tableWidthMm, tableHeightMm } from './types.js';

const {
  mockAddObject,
  mockRemoveObject,
  mockInitScene,
  mockCreateSandMesh,
  mockUpdateSandMesh,
  mockCheckFloatTextureSupport,
  mockCreateBallMesh,
  mockUpdateBallMesh,
  mockSetupFileDrop,
  mockSetupControls,
  mockRenderWarnings,
} = vi.hoisted(() => {
  const mockAddObject = vi.fn();
  const mockRemoveObject = vi.fn();
  const mockRenderer = {
    capabilities: { isWebGL2: true },
    getContext: () => ({ getExtension: () => ({}) }),
  };
  const mockInitScene = vi.fn(() => ({
    addLine: vi.fn(),
    removeLine: vi.fn(),
    addObject: mockAddObject,
    removeObject: mockRemoveObject,
    renderer: mockRenderer,
    lighting: {
      dirLight: {},
      ambientLight: {},
      uniforms: {
        uLightDir: { value: {} },
        uLightColor: { value: {} },
        uAmbient: { value: {} },
      },
      setAzimuth: vi.fn(),
      setAltitude: vi.fn(),
      setBalance: vi.fn(),
    },
    dispose: vi.fn(),
  }));
  let sandCounter = 0;
  const mockCreateSandMesh = vi.fn(() => {
    sandCounter += 1;
    return {
      __kind: 'sand',
      __id: sandCounter,
      mesh: { __kind: 'sandMesh', __id: sandCounter, geometry: { dispose: vi.fn() } },
      material: { uniforms: {}, dispose: vi.fn() },
      texture: { dispose: vi.fn() },
      noiseTexture: { dispose: vi.fn() },
    };
  });
  const mockUpdateSandMesh = vi.fn();
  const mockCheckFloatTextureSupport = vi.fn(() => true);
  let ballCounter = 0;
  const mockCreateBallMesh = vi.fn(() => {
    ballCounter += 1;
    return {
      __kind: 'ball',
      __id: ballCounter,
      geometry: { dispose: vi.fn() },
      material: { dispose: vi.fn() },
    };
  });
  const mockUpdateBallMesh = vi.fn();
  const mockSetupFileDrop = vi.fn();
  const mockSetupControls = vi.fn();
  const mockRenderWarnings = vi.fn();
  return {
    mockAddObject,
    mockRemoveObject,
    mockInitScene,
    mockCreateSandMesh,
    mockUpdateSandMesh,
    mockCheckFloatTextureSupport,
    mockCreateBallMesh,
    mockUpdateBallMesh,
    mockSetupFileDrop,
    mockSetupControls,
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
vi.mock('./ui/controls.js', () => ({ setupControls: mockSetupControls }));
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
      tableWidthMm(DEFAULT_SIM_CONFIG),
      tableHeightMm(DEFAULT_SIM_CONFIG),
    );
  });

  it('creates sand and ball meshes and adds them to the scene', async () => {
    await import('./main.js');
    const expectedNx = Math.ceil(
      tableWidthMm(DEFAULT_SIM_CONFIG) / DEFAULT_SIM_CONFIG.cell_mm,
    );
    const expectedNy = Math.ceil(
      tableHeightMm(DEFAULT_SIM_CONFIG) / DEFAULT_SIM_CONFIG.cell_mm,
    );
    expect(mockCreateSandMesh).toHaveBeenCalledWith(
      expectedNx,
      expectedNy,
      tableWidthMm(DEFAULT_SIM_CONFIG),
      tableHeightMm(DEFAULT_SIM_CONFIG),
    );
    expect(mockCreateBallMesh).toHaveBeenCalledWith(DEFAULT_SIM_CONFIG.ball_radius_mm);
    expect(mockAddObject).toHaveBeenCalledTimes(2);
    expect(mockAddObject).toHaveBeenCalledWith(expect.objectContaining({ __kind: 'sandMesh' }));
    expect(mockAddObject).toHaveBeenCalledWith(expect.objectContaining({ __kind: 'ball' }));
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
      tableWidthMm(DEFAULT_SIM_CONFIG) / DEFAULT_SIM_CONFIG.cell_mm,
    );
    const expectedNy = Math.ceil(
      tableHeightMm(DEFAULT_SIM_CONFIG) / DEFAULT_SIM_CONFIG.cell_mm,
    );
    const buf = new ArrayBuffer(expectedNx * expectedNy * 4);
    mockUpdateSandMesh.mockClear();
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
    expect((updateCall[0] as { __kind: string }).__kind).toBe('sand');
    expect((updateCall[0] as { mesh: { __kind: string } }).mesh.__kind).toBe('sandMesh');
    expect(updateCall[1]).toBeInstanceOf(Float32Array);
    expect((updateCall[1] as Float32Array).buffer).toBe(buf);
    expect(updateCall.length).toBe(2);

    expect(mockUpdateBallMesh).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: 'ball' }),
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

  it('drops a stale frame whose nx/ny do not match current config', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });
    worker.postMessage.mockClear();
    mockUpdateSandMesh.mockClear();
    mockUpdateBallMesh.mockClear();

    const stale = new ArrayBuffer(16);
    worker.emit({
      type: 'frame',
      buf: stale,
      nx: 1,
      ny: 1,
      ballPos: { x: 0, y: 0 },
      simTime: 0,
    });

    expect(mockUpdateSandMesh).not.toHaveBeenCalled();
    expect(mockUpdateBallMesh).not.toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('Apply posts a new config and rebuilds the sand mesh', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });
    worker.postMessage.mockClear();
    mockRemoveObject.mockClear();
    mockAddObject.mockClear();
    mockCreateSandMesh.mockClear();

    const onApply = mockSetupControls.mock.calls[0][0].onApply as (cfg: typeof DEFAULT_SIM_CONFIG) => void;
    const newCfg = { ...DEFAULT_SIM_CONFIG, cell_mm: 1.0 };
    onApply(newCfg);

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'config', config: newCfg });
    expect(mockRemoveObject).toHaveBeenCalledTimes(1);
    expect(mockCreateSandMesh).toHaveBeenCalledTimes(1);
    const newNx = Math.ceil(tableWidthMm(newCfg) / newCfg.cell_mm);
    const newNy = Math.ceil(tableHeightMm(newCfg) / newCfg.cell_mm);
    expect(mockCreateSandMesh).toHaveBeenCalledWith(
      newNx, newNy, tableWidthMm(newCfg), tableHeightMm(newCfg),
    );
    expect(mockAddObject).toHaveBeenCalledTimes(1);
  });

  it('Apply disposes the old sand mesh GPU resources', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });

    const oldSand = mockCreateSandMesh.mock.results[0].value as {
      mesh: { geometry: { dispose: ReturnType<typeof vi.fn> } };
      material: { dispose: ReturnType<typeof vi.fn> };
      texture: { dispose: ReturnType<typeof vi.fn> };
      noiseTexture: { dispose: ReturnType<typeof vi.fn> };
    };

    const onApply = mockSetupControls.mock.calls[0][0].onApply as (cfg: typeof DEFAULT_SIM_CONFIG) => void;
    onApply({ ...DEFAULT_SIM_CONFIG, cell_mm: 1.0 });

    expect(oldSand.mesh.geometry.dispose).toHaveBeenCalledTimes(1);
    expect(oldSand.material.dispose).toHaveBeenCalledTimes(1);
    expect(oldSand.texture.dispose).toHaveBeenCalledTimes(1);
    expect(oldSand.noiseTexture.dispose).toHaveBeenCalledTimes(1);
  });

  it('Apply disposes the old ball mesh when radius changes', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });

    const oldBall = mockCreateBallMesh.mock.results[0].value as {
      geometry: { dispose: ReturnType<typeof vi.fn> };
      material: { dispose: ReturnType<typeof vi.fn> };
    };

    const onApply = mockSetupControls.mock.calls[0][0].onApply as (cfg: typeof DEFAULT_SIM_CONFIG) => void;

    onApply({ ...DEFAULT_SIM_CONFIG, h0_mm: DEFAULT_SIM_CONFIG.h0_mm + 1 });
    expect(oldBall.geometry.dispose).not.toHaveBeenCalled();
    expect(oldBall.material.dispose).not.toHaveBeenCalled();

    onApply({ ...DEFAULT_SIM_CONFIG, ball_radius_mm: DEFAULT_SIM_CONFIG.ball_radius_mm + 1 });
    expect(oldBall.geometry.dispose).toHaveBeenCalledTimes(1);
    expect(oldBall.material.dispose).toHaveBeenCalledTimes(1);
  });

  it('Apply re-creates the ball mesh only when ball_radius_mm changes', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });
    mockCreateBallMesh.mockClear();
    mockRemoveObject.mockClear();

    const onApply = mockSetupControls.mock.calls[0][0].onApply as (cfg: typeof DEFAULT_SIM_CONFIG) => void;

    onApply({ ...DEFAULT_SIM_CONFIG, h0_mm: DEFAULT_SIM_CONFIG.h0_mm + 1 });
    expect(mockCreateBallMesh).not.toHaveBeenCalled();

    onApply({ ...DEFAULT_SIM_CONFIG, ball_radius_mm: DEFAULT_SIM_CONFIG.ball_radius_mm + 1 });
    expect(mockCreateBallMesh).toHaveBeenCalledTimes(1);
    expect(mockCreateBallMesh).toHaveBeenCalledWith(DEFAULT_SIM_CONFIG.ball_radius_mm + 1);
  });

  it('Apply re-issues the cached gcode as a reset load', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });

    const fileCallback = mockSetupFileDrop.mock.calls[0][0] as (
      text: string,
      mode: 'reset' | 'append',
    ) => void;
    fileCallback('G0 X5', 'reset');
    worker.postMessage.mockClear();

    const onApply = mockSetupControls.mock.calls[0][0].onApply as (cfg: typeof DEFAULT_SIM_CONFIG) => void;
    onApply({ ...DEFAULT_SIM_CONFIG, cell_mm: 1.0 });

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'load',
      gcode: 'G0 X5',
      mode: 'reset',
    });
  });

  it('Apply does not issue a load when no gcode has been loaded', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });
    worker.postMessage.mockClear();

    const onApply = mockSetupControls.mock.calls[0][0].onApply as (cfg: typeof DEFAULT_SIM_CONFIG) => void;
    onApply({ ...DEFAULT_SIM_CONFIG, cell_mm: 1.0 });

    const loadCalls = worker.postMessage.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'load',
    );
    expect(loadCalls).toHaveLength(0);
  });

  it('Apply before worker ready does not post to worker but does rebuild local meshes', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    // Do NOT emit ready.
    worker.postMessage.mockClear();
    mockCreateSandMesh.mockClear();
    mockRemoveObject.mockClear();
    mockAddObject.mockClear();

    const onApply = mockSetupControls.mock.calls[0][0].onApply as (cfg: typeof DEFAULT_SIM_CONFIG) => void;
    const newCfg = { ...DEFAULT_SIM_CONFIG, cell_mm: 1.0 };
    onApply(newCfg);

    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(mockCreateSandMesh).toHaveBeenCalledTimes(1);
    expect(mockRemoveObject).toHaveBeenCalledTimes(1);
    expect(mockAddObject).toHaveBeenCalledTimes(1);

    // Once ready fires, the new cfg is what gets posted.
    worker.emit({ type: 'ready' });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'config', config: newCfg });
  });

  it('frame after Apply uses the new (nx, ny) and is processed', async () => {
    await import('./main.js');
    const worker = FakeWorker.lastInstance!;
    worker.emit({ type: 'ready' });

    const onApply = mockSetupControls.mock.calls[0][0].onApply as (cfg: typeof DEFAULT_SIM_CONFIG) => void;
    const newCfg = { ...DEFAULT_SIM_CONFIG, cell_mm: 1.0 };
    onApply(newCfg);

    mockUpdateSandMesh.mockClear();
    worker.postMessage.mockClear();

    const newNx = Math.ceil(tableWidthMm(newCfg) / newCfg.cell_mm);
    const newNy = Math.ceil(tableHeightMm(newCfg) / newCfg.cell_mm);
    const buf = new ArrayBuffer(newNx * newNy * 4);
    worker.emit({
      type: 'frame',
      buf,
      nx: newNx,
      ny: newNy,
      ballPos: { x: 1, y: 2 },
      simTime: 1,
    });

    expect(mockUpdateSandMesh).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'release', buf }, [buf]);
  });
});
