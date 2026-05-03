import type { Warning } from '../types.js';

export function renderWarnings(container: HTMLElement, warnings: Warning[]): void {
  if (warnings.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  container.innerHTML = '';
  const ul = document.createElement('ul');
  for (const w of warnings) {
    const li = document.createElement('li');
    const em = document.createElement('em');
    em.textContent = `(${w.source})`;
    li.textContent = `Line ${w.line}: ${w.message} `;
    li.appendChild(em);
    ul.appendChild(li);
  }
  container.appendChild(ul);
}
