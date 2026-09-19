import Database from 'better-sqlite3';

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
`;

export function openDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
