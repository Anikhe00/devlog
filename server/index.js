import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = process.env.DEVLOG_DB ?? path.join(root, 'data', 'devlog.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const port = Number(process.env.PORT ?? 3000);
// Personal data: listen on localhost only unless told otherwise.
const host = process.env.HOST ?? '127.0.0.1';
const allowSignup = process.env.ALLOW_SIGNUP !== 'false';

const db = openDb(dbFile);
const app = createApp({ db, allowSignup });
const server = app.listen(port, host, () => {
  console.log(`DevLog running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
});

// Hosts stop the process with SIGTERM on every deploy: finish in-flight requests,
// then close SQLite so its write-ahead log is folded back into the database file.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // don't hang forever on a stuck connection
  });
}
