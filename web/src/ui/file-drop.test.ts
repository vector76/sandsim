// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupFileDrop } from './file-drop.js';

function makeFakeFile(content: string, name = 'test.gcode'): File {
  return new File([content], name, { type: 'text/plain' });
}

function mockFileReader(content: string) {
  const reader = {
    onload: null as ((e: ProgressEvent) => void) | null,
    readAsText(_file: File) {
      reader.result = content;
      setTimeout(() => reader.onload?.({} as ProgressEvent), 0);
    },
    result: '' as string,
  };
  return reader;
}

describe('setupFileDrop', () => {
  let onFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const newBody = document.createElement('body');
    newBody.innerHTML =
      '<input type="file" id="file-input" />' +
      '<select id="file-mode">' +
      '<option value="reset" selected>Reset sand</option>' +
      '<option value="append">Append onto existing pattern</option>' +
      '</select>';
    document.documentElement.replaceChild(newBody, document.body);
    onFile = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets accept attribute on file input', () => {
    setupFileDrop(onFile);
    const input = document.getElementById('file-input') as HTMLInputElement;
    expect(input.accept).toBe('.gcode,.nc,.txt,.cnc');
  });

  it('calls onFile when file input changes', async () => {
    const fakeContent = 'G0 X10 Y10';
    const readerInstance = mockFileReader(fakeContent);
    vi.stubGlobal('FileReader', vi.fn(() => readerInstance));

    setupFileDrop(onFile);

    const input = document.getElementById('file-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [makeFakeFile(fakeContent)],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));

    await new Promise((r) => setTimeout(r, 10));
    expect(onFile).toHaveBeenCalledWith(fakeContent, 'reset');
  });

  it('calls preventDefault on dragover', () => {
    setupFileDrop(onFile);
    const event = new Event('dragover', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    document.body.dispatchEvent(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('calls onFile on drop with first file', async () => {
    const fakeContent = 'G1 X50 Y50 F800';
    const readerInstance = mockFileReader(fakeContent);
    vi.stubGlobal('FileReader', vi.fn(() => readerInstance));

    setupFileDrop(onFile);

    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [makeFakeFile(fakeContent)] },
    });
    document.body.dispatchEvent(event);

    await new Promise((r) => setTimeout(r, 10));
    expect(onFile).toHaveBeenCalledWith(fakeContent, 'reset');
  });

  it('passes append mode when selector is set to append', async () => {
    const fakeContent = 'G1 X1 Y1';
    const readerInstance = mockFileReader(fakeContent);
    vi.stubGlobal('FileReader', vi.fn(() => readerInstance));

    setupFileDrop(onFile);

    const select = document.getElementById('file-mode') as HTMLSelectElement;
    select.value = 'append';

    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [makeFakeFile(fakeContent)] },
    });
    document.body.dispatchEvent(event);

    await new Promise((r) => setTimeout(r, 10));
    expect(onFile).toHaveBeenCalledWith(fakeContent, 'append');
  });

  it('does nothing on drop with no files', async () => {
    setupFileDrop(onFile);
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [] },
    });
    document.body.dispatchEvent(event);

    await new Promise((r) => setTimeout(r, 10));
    expect(onFile).not.toHaveBeenCalled();
  });

  it('does not call onFile when FileReader errors on drop', async () => {
    const fakeError = new DOMException('read error');
    const reader = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      result: '' as string,
      error: fakeError,
      readAsText(_file: File) {
        setTimeout(() => this.onerror?.(), 0);
      },
    };
    vi.stubGlobal('FileReader', vi.fn(() => reader));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    setupFileDrop(onFile);

    const file = makeFakeFile('bad data');
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
    document.body.dispatchEvent(event);

    await new Promise((r) => setTimeout(r, 10));
    expect(onFile).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not call onFile when FileReader errors on input change', async () => {
    const fakeError = new DOMException('read error');
    const reader = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      result: '' as string,
      error: fakeError,
      readAsText(_file: File) {
        setTimeout(() => this.onerror?.(), 0);
      },
    };
    vi.stubGlobal('FileReader', vi.fn(() => reader));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    setupFileDrop(onFile);

    const input = document.getElementById('file-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [makeFakeFile('bad data')],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));

    await new Promise((r) => setTimeout(r, 10));
    expect(onFile).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
