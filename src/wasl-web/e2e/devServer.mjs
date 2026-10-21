import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Starts Vite on a fixed port and returns `{ url, close }`.
 *
 * The API proxy in `vite.config.ts` is never reached: the Playwright context
 * answers every `/api/**` request itself (see `mockApi.mjs`). `strictPort`, so a
 * second run fails loudly instead of quietly talking to the first one's server —
 * the stale-process hazard `CLAUDE.md` describes for measurements.
 */
export async function startDevServer(port = 5199) {
  const server = await createServer({
    root,
    logLevel: 'error',
    server: { port, strictPort: true, host: '127.0.0.1' },
  });
  await server.listen();
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}
