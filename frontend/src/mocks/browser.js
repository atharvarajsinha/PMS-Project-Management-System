import { setupWorker } from 'msw/browser';
import { handlers } from './handlers.js';
import { resetDb } from './db.js';

export const worker = setupWorker(...handlers);

// Dev convenience: run `__pmsMock.resetDb()` in the browser console to re-seed.
if (typeof window !== 'undefined') {
  window.__pmsMock = { resetDb };
}
