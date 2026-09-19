import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * DATABASE_URL           `file:/path/to/devlog.db` (default: ./data/devlog.db) or a Turso `libsql://…` URL
 * DATABASE_AUTH_TOKEN    only needed for a hosted (Turso) database
 * ALLOW_SIGNUP           set to "false" to stop new accounts being created
 */
export function readConfig(env = process.env) {
  return {
    db: {
      url: env.DATABASE_URL || `file:${path.join(ROOT, 'data', 'devlog.db')}`,
      authToken: env.DATABASE_AUTH_TOKEN || undefined,
    },
    allowSignup: env.ALLOW_SIGNUP !== 'false',
  };
}
