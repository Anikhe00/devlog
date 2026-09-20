import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  default_cadence TEXT NOT NULL DEFAULT 'daily' CHECK (default_cadence IN ('daily', 'weekly')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- period_date is the day for daily logs and the Monday of the week for weekly ones.
CREATE TABLE IF NOT EXISTS entries (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cadence     TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly')),
  period_date TEXT NOT NULL,
  worked_on   TEXT NOT NULL DEFAULT '',
  learned     TEXT NOT NULL DEFAULT '',
  shipped     TEXT NOT NULL DEFAULT '',
  blockers    TEXT NOT NULL DEFAULT '',
  next_steps  TEXT NOT NULL DEFAULT '',
  mood        INTEGER CHECK (mood BETWEEN 1 AND 5),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_entries_user_period ON entries(user_id, period_date DESC);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  PRIMARY KEY (entry_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag);

-- One-time password reset links. Only a hash of the token is stored, never the token itself.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- Fixed-window counters for login / sign-up throttling. They live in the database rather
-- than in memory so the limit still holds when the host runs many short-lived instances.
CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
`;

/**
 * A client for a local SQLite file (`file:…`) or a hosted Turso database (`libsql://…`).
 * Nothing is sent until the first query; call initSchema() before serving requests.
 */
export function connect({ url, authToken }) {
  if (url.startsWith('file:') && !url.includes(':memory:')) {
    fs.mkdirSync(path.dirname(url.slice('file:'.length)), { recursive: true });
  }
  return createClient({ url, authToken });
}

export const initSchema = (db) => db.executeMultiple(SCHEMA);

/** libsql rows are array-like; this turns a result into plain { column: value } objects. */
export const toObjects = (result) =>
  result.rows.map((row) => Object.fromEntries(result.columns.map((name, i) => [name, row[i]])));
