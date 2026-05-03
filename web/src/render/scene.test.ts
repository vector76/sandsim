// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSetSize, mockRender } = vi.hoisted(() => ({
  mockSetSize: vi.fn(),
  mockRender: vi.fn(),
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: vi.fn(() => ({
      setSize: mockSetSize,
      render: mockRender,
    })),
  };
});

vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn().mockImplementation(() => ({
    target: { set: vi.fn() },
    update: vi.fn(),
  })),
}));

import * as THREE from 'three';
import { initScene } from './scene.js';

describe('initScene', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true });
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    mockSetSize.mockClear();
    mockRender.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a handle with addLine and removeLine methods', () => {
    const handle = initScene(canvas, 300, 200);
    expect(typeof handle.addLine).toBe('function');
    expect(typeof handle.removeLine).toBe('function');
  });

  it('addLine does not throw', () => {
    const handle = initScene(canvas, 300, 200);
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    expect(() => handle.addLine(line)).not.toThrow();
  });

  it('removeLine after addLine does not throw', () => {
    const handle = initScene(canvas, 300, 200);
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    handle.addLine(line);
    expect(() => handle.removeLine(line)).not.toThrow();
  });

  it('added line is present in scene children', () => {
    const handle = initScene(canvas, 300, 200);
    const sceneSpy = vi.spyOn(THREE.Scene.prototype, 'add');
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    handle.addLine(line);
    expect(sceneSpy).toHaveBeenCalledWith(line);
    sceneSpy.mockRestore();
  });

  it('removeLine calls scene.remove with the line', () => {
    const handle = initScene(canvas, 300, 200);
    const removeSpy = vi.spyOn(THREE.Scene.prototype, 'remove');
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    handle.addLine(line);
    handle.removeLine(line);
    expect(removeSpy).toHaveBeenCalledWith(line);
    removeSpy.mockRestore();
  });

  it('resize event calls setSize with new canvas dimensions and updateStyle=false', () => {
    initScene(canvas, 300, 200);
    mockSetSize.mockClear();

    Object.defineProperty(canvas, 'clientWidth', { value: 1024, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(mockSetSize).toHaveBeenCalledWith(1024, 768, false);
  });
});
