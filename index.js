// The app's entry point. Vercel runs the default export as a serverless function (it finds
// Express apps by the `express` import); locally, server/index.js listens on it.
import express from 'express';
import { createApp } from './server/app.js';
import { readConfig } from './server/config.js';
import { connect } from './server/db.js';

const config = readConfig();
export const db = connect(config.db);

const app = express();
app.disable('x-powered-by');
app.use(createApp({ db, allowSignup: config.allowSignup }));

export default app;
