// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderWarnings } from './warnings.js';
import type { Warning } from '../types.js';

describe('renderWarnings', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'warnings';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('hides container when warnings is empty', () => {
    container.style.display = 'block';
    renderWarnings(container, []);
    expect(container.style.display).toBe('none');
  });

  it('shows container when warnings are present', () => {
    container.style.display = 'none';
    const warnings: Warning[] = [{ line: 1, message: 'Unknown command', source: 'parser' }];
    renderWarnings(container, warnings);
    expect(container.style.display).not.toBe('none');
  });

  it('renders one list item per warning', () => {
    const warnings: Warning[] = [
      { line: 3, message: 'Out of bounds', source: 'bounds-check' },
      { line: 7, message: 'Missing feedrate', source: 'parser' },
    ];
    renderWarnings(container, warnings);
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
  });

  it('includes line, message, and source in each item', () => {
    const warnings: Warning[] = [{ line: 5, message: 'Negative coordinate', source: 'validator' }];
    renderWarnings(container, warnings);
    const item = container.querySelector('li')!;
    expect(item.textContent).toContain('5');
    expect(item.textContent).toContain('Negative coordinate');
    expect(item.textContent).toContain('validator');
  });

  it('rebuilds inner HTML on successive calls', () => {
    const first: Warning[] = [{ line: 1, message: 'A', source: 'x' }];
    const second: Warning[] = [
      { line: 2, message: 'B', source: 'y' },
      { line: 3, message: 'C', source: 'z' },
    ];
    renderWarnings(container, first);
    expect(container.querySelectorAll('li')).toHaveLength(1);
    renderWarnings(container, second);
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
});
