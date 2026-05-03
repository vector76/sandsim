import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url =
    input instanceof URL ? input
    : input instanceof Request ? new URL(input.url)
    : new URL(input);
  if (url.protocol === 'file:') {
    const buffer = readFileSync(fileURLToPath(url));
    return new Response(buffer, { headers: { 'Content-Type': 'application/wasm' } });
  }
  return originalFetch(input, init);
};
