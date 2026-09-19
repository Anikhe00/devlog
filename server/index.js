// Local / self-hosted runner: `npm start`. (On Vercel, ../index.js is used instead.)
import app, { db } from '../index.js';

const port = Number(process.env.PORT ?? 3000);
// Personal data: listen on localhost only unless told otherwise.
const host = process.env.HOST ?? '127.0.0.1';

const server = app.listen(port, host, () => {
  console.log(`DevLog running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
});

// Finish in-flight requests on SIGTERM/SIGINT, then close the database cleanly.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // don't hang forever on a stuck connection
  });
}
