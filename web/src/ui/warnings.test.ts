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

  it('collapses two warnings on the same line into one entry containing both messages', () => {
    const warnings: Warning[] = [
      { line: 4, message: 'Out of bounds', source: 'bounds-check' },
      { line: 4, message: 'Missing feedrate', source: 'parser' },
    ];
    renderWarnings(container, warnings);
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('Line 4');
    expect(items[0].textContent).toContain('Out of bounds');
    expect(items[0].textContent).toContain('Missing feedrate');
  });

  it('renders two entries when warnings are on different lines', () => {
    const warnings: Warning[] = [
      { line: 3, message: 'Out of bounds', source: 'bounds-check' },
      { line: 7, message: 'Missing feedrate', source: 'parser' },
    ];
    renderWarnings(container, warnings);
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Line 3');
    expect(items[1].textContent).toContain('Line 7');
  });

  it('shows a count badge with total warning count (plural)', () => {
    const warnings: Warning[] = [
      { line: 4, message: 'a', source: 's' },
      { line: 4, message: 'b', source: 's' },
      { line: 9, message: 'c', source: 's' },
    ];
    renderWarnings(container, warnings);
    const badge = container.querySelector('.warnings-count')!;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('3 warnings');
  });

  it('uses singular form in the count badge for a single warning', () => {
    const warnings: Warning[] = [{ line: 1, message: 'a', source: 's' }];
    renderWarnings(container, warnings);
    const badge = container.querySelector('.warnings-count')!;
    expect(badge.textContent).toBe('1 warning');
  });

  it('rebuilds inner HTML on successive calls', () => {
    const first: Warning[] = [{ line: 1, message: 'A', source: 'x' }];
    const second: Warning[] = [
      { line: 2, message: 'B', source: 'y' },
      { line: 3, message: 'C', source: 'z' },
    ];
    renderWarnings(container, first);
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.querySelector('.warnings-count')!.textContent).toBe('1 warning');
    renderWarnings(container, second);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('.warnings-count')!.textContent).toBe('2 warnings');
  });
});
