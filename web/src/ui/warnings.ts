import type { Warning } from '../types.js';

export function renderWarnings(container: HTMLElement, warnings: Warning[]): void {
  if (warnings.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  container.innerHTML = '';

  const count = document.createElement('div');
  count.className = 'warnings-count';
  count.textContent = warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`;
  container.appendChild(count);

  const byLine = new Map<number, Warning[]>();
  for (const w of warnings) {
    const list = byLine.get(w.line);
    if (list) {
      list.push(w);
    } else {
      byLine.set(w.line, [w]);
    }
  }

  const ul = document.createElement('ul');
  for (const [line, group] of byLine) {
    const li = document.createElement('li');
    const parts = group.map((w) => `${w.message} (${w.source})`);
    li.textContent = `Line ${line}: ${parts.join('; ')}`;
    ul.appendChild(li);
  }
  container.appendChild(ul);
}
