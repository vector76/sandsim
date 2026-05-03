export function setupFileDrop(onFile: (text: string) => void): void {
  const input = document.getElementById('file-input') as HTMLInputElement | null;
  if (input) {
    input.accept = '.gcode,.nc,.txt,.cnc';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        input.value = ''; // allow re-selecting the same file
        onFile(reader.result as string);
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
    reader.onload = () => onFile(reader.result as string);
    reader.onerror = () => console.error('Failed to read file:', reader.error);
    reader.readAsText(file);
  });
}
