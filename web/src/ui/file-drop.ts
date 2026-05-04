export type LoadMode = 'reset' | 'append';

import squareGcode from '../../../tests/fixtures/square.gcode?raw';
import spiralGcode from '../../../tests/fixtures/spiral.gcode?raw';
import roseGcode from '../../../tests/fixtures/rose.gcode?raw';
import sandifyGcode from '../../../tests/fixtures/v1_sandify.gcode?raw';

const BUILTIN_FIXTURES: Record<string, string> = {
  square: squareGcode,
  spiral: spiralGcode,
  rose: roseGcode,
  v1_sandify: sandifyGcode,
};

function readMode(): LoadMode {
  const sel = document.getElementById('file-mode') as HTMLSelectElement | null;
  return sel?.value === 'append' ? 'append' : 'reset';
}

export function setupBuiltinFixtures(onFile: (text: string, mode: LoadMode) => void): void {
  const sel = document.getElementById('builtin-fixture') as HTMLSelectElement | null;
  const btn = document.getElementById('builtin-load') as HTMLButtonElement | null;
  if (!sel || !btn) return;
  btn.addEventListener('click', () => {
    const key = sel.value;
    const text = BUILTIN_FIXTURES[key];
    if (!text) return;
    onFile(text, readMode());
  });
}

export function setupFileDrop(onFile: (text: string, mode: LoadMode) => void): void {
  const input = document.getElementById('file-input') as HTMLInputElement | null;
  if (input) {
    input.accept = '.gcode,.nc,.txt,.cnc';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        input.value = ''; // allow re-selecting the same file
        onFile(reader.result as string, readMode());
      };
      reader.onerror = () => console.error('Failed to read file:', reader.error);
      reader.readAsText(file);
    });
  }

  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onFile(reader.result as string, readMode());
    reader.onerror = () => console.error('Failed to read file:', reader.error);
    reader.readAsText(file);
  });
}
