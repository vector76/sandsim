// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks must be declared before imports
const { mockAddLine, mockRemoveLine, mockInitScene, mockBuildToolpathLine, mockSetupFileDrop, mockRenderWarnings, mockParseGcode } =
  vi.hoisted(() => {
    const mockAddLine = vi.fn();
    const mockRemoveLine = vi.fn();
    const mockInitScene = vi.fn(() => ({ addLine: mockAddLine, removeLine: mockRemoveLine, dispose: vi.fn() }));
    const mockBuildToolpathLine = vi.fn(() => ({
      geometry: { dispose: vi.fn() },
      material: { dispose: vi.fn() },
    }));
    const mockSetupFileDrop = vi.fn();
    const mockRenderWarnings = vi.fn();
    const mockParseGcode = vi.fn(async () => ({ moves: [] as unknown[], warnings: [] as unknown[] }));
    return {
      mockAddLine,
      mockRemoveLine,
      mockInitScene,
      mockBuildToolpathLine,
      mockSetupFileDrop,
      mockRenderWarnings,
      mockParseGcode,
    };
  });

vi.mock('./render/scene.js', () => ({ initScene: mockInitScene }));
vi.mock('./render/toolpath.js', () => ({ buildToolpathLine: mockBuildToolpathLine }));
vi.mock('./ui/file-drop.js', () => ({ setupFileDrop: mockSetupFileDrop }));
vi.mock('./ui/warnings.js', () => ({ renderWarnings: mockRenderWarnings }));
vi.mock('./wasm.js', () => ({ parseGcode: mockParseGcode }));

function setupDom() {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls initScene with canvas and DEFAULT_CONFIG dimensions', async () => {
    await import('./main.js');
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    expect(mockInitScene).toHaveBeenCalledWith(canvas, 300, 200);
  });

  it('calls renderWarnings with empty array on startup', async () => {
    await import('./main.js');
    expect(mockRenderWarnings).toHaveBeenCalledWith(
      document.getElementById('warnings'),
      [],
    );
  });

  it('calls setupFileDrop with a callback', async () => {
    await import('./main.js');
    expect(mockSetupFileDrop).toHaveBeenCalledTimes(1);
    expect(typeof mockSetupFileDrop.mock.calls[0][0]).toBe('function');
  });

  it('file callback: parses gcode and adds line to scene', async () => {
    await import('./main.js');
    const callback = mockSetupFileDrop.mock.calls[0][0] as (text: string) => Promise<void>;
    const fakeOutput = { moves: [{ line: 1, x_mm: 10, y_mm: 20, feedrate_mm_per_min: 1000 }], warnings: [] };
    mockParseGcode.mockResolvedValueOnce(fakeOutput);
    const fakeLine = { geometry: { dispose: vi.fn() }, material: { dispose: vi.fn() } };
    mockBuildToolpathLine.mockReturnValueOnce(fakeLine);

    await callback('G0 X10 Y20');

    expect(mockParseGcode).toHaveBeenCalledWith('G0 X10 Y20', expect.objectContaining({ table_width_mm: 300 }));
    expect(mockBuildToolpathLine).toHaveBeenCalledWith(fakeOutput.moves, 5);
    expect(mockAddLine).toHaveBeenCalledWith(fakeLine);
    expect(mockRenderWarnings).toHaveBeenCalledWith(document.getElementById('warnings'), []);
  });

  it('file callback: removes previous line before adding new one', async () => {
    await import('./main.js');
    const callback = mockSetupFileDrop.mock.calls[0][0] as (text: string) => Promise<void>;

    const firstLine = { geometry: { dispose: vi.fn() }, material: { dispose: vi.fn() } };
    const secondLine = { geometry: { dispose: vi.fn() }, material: { dispose: vi.fn() } };
    mockBuildToolpathLine.mockReturnValueOnce(firstLine).mockReturnValueOnce(secondLine);

    await callback('G0 X10');
    expect(mockRemoveLine).not.toHaveBeenCalled();
    expect(mockAddLine).toHaveBeenCalledWith(firstLine);

    await callback('G0 X20');
    expect(mockRemoveLine).toHaveBeenCalledWith(firstLine);
    expect(firstLine.geometry.dispose).toHaveBeenCalled();
    expect(firstLine.material.dispose).toHaveBeenCalled();
    expect(mockAddLine).toHaveBeenCalledWith(secondLine);
  });
});
