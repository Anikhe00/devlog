import { toObjects } from './db.js';
import { addDays, isIsoDate, todayUtc, weekStart } from './dates.js';

export const TEXT_FIELDS = ['worked_on', 'learned', 'shipped', 'blockers', 'next_steps'];
export const MAX_FIELD_LENGTH = 20_000;
const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 30;

export function normalizeTag(raw) {
  return String(raw)
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_\-./+]/g, '')
    .slice(0, MAX_TAG_LENGTH);
}

export function normalizeTags(input) {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,]+/) : [];
  return [...new Set(list.map(normalizeTag).filter(Boolean))].slice(0, MAX_TAGS);
}

/** Validates a request body. Returns { value } or { error }. */
export function parseEntry(body) {
  if (!body || typeof body !== 'object') return { error: 'Expected a JSON body.' };

  if (body.cadence !== 'daily' && body.cadence !== 'weekly') {
    return { error: 'Cadence must be "daily" or "weekly".' };
  }
  if (!isIsoDate(body.period_date)) return { error: 'A valid date (YYYY-MM-DD) is required.' };
  // The client's "today" can be a day ahead of the server's UTC date, no more.
  if (body.period_date > addDays(todayUtc(), 1)) return { error: 'Entries cannot be dated in the future.' };

  const value = {
    cadence: body.cadence,
    period_date: body.cadence === 'weekly' ? weekStart(body.period_date) : body.period_date,
    mood: null,
    tags: normalizeTags(body.tags),
  };

  for (const field of TEXT_FIELDS) {
    const text = body[field] ?? '';
    if (typeof text !== 'string') return { error: `"${field}" must be text.` };
    if (text.length > MAX_FIELD_LENGTH) return { error: `"${field}" is too long (max ${MAX_FIELD_LENGTH} characters).` };
    value[field] = text.trimEnd();
  }
  if (!TEXT_FIELDS.some((f) => value[f].trim())) {
    return { error: 'Fill in at least one of the prompts before saving.' };
  }

  if (body.mood != null) {
    if (!Number.isInteger(body.mood) || body.mood < 1 || body.mood > 5) {
      return { error: 'Mood must be a whole number from 1 to 5.' };
    }
    value.mood = body.mood;
  }
  return { value };
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const INSERT_ENTRY = `
  INSERT INTO entries (user_id, cadence, period_date, worked_on, learned, shipped, blockers, next_steps, mood)
  VALUES (@user_id, @cadence, @period_date, @worked_on, @learned, @shipped, @blockers, @next_steps, @mood)`;
const UPDATE_ENTRY = `
  UPDATE entries SET cadence = @cadence, period_date = @period_date, worked_on = @worked_on,
    learned = @learned, shipped = @shipped, blockers = @blockers, next_steps = @next_steps,
    mood = @mood, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = @id AND user_id = @user_id`;

/** Queries and helpers for the entries tables. Every method is async. */
export function createEntryStore(db) {
  const all = async (sql, args = []) => toObjects(await db.execute({ sql, args }));

  async function withTags(rows) {
    if (rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const tagRows = await all(
      `SELECT entry_id, tag FROM entry_tags WHERE entry_id IN (${ids.map(() => '?').join(',')}) ORDER BY rowid`,
      ids,
    );
    const byId = new Map(ids.map((id) => [id, []]));
    for (const { entry_id, tag } of tagRows) byId.get(entry_id).push(tag);
    return rows.map((r) => ({ ...r, tags: byId.get(r.id) }));
  }

  /** Inserts (id == null) or updates an entry and replaces its tags, atomically. Returns the id, or null if not found. */
  async function save(userId, id, value) {
    const { tags, ...fields } = value;
    const tx = await db.transaction('write');
    try {
      let entryId = id;
      if (id == null) {
        const res = await tx.execute({ sql: INSERT_ENTRY, args: { ...fields, user_id: userId } });
        entryId = Number(res.lastInsertRowid);
      } else {
        const res = await tx.execute({ sql: UPDATE_ENTRY, args: { ...fields, id, user_id: userId } });
        if (res.rowsAffected === 0) {
          await tx.rollback();
          return null;
        }
      }
      await tx.execute({ sql: 'DELETE FROM entry_tags WHERE entry_id = ?', args: [entryId] });
      if (tags.length) {
        await tx.batch(tags.map((tag) => ({ sql: 'INSERT INTO entry_tags (entry_id, tag) VALUES (?, ?)', args: [entryId, tag] })));
      }
      await tx.commit();
      return entryId;
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    } finally {
      tx.close();
    }
  }

  return {
    async get(userId, id) {
      const rows = await all('SELECT * FROM entries WHERE id = ? AND user_id = ?', [id, userId]);
      return (await withTags(rows))[0] ?? null;
    },
    create: (userId, value) => save(userId, null, value),
    update: (userId, id, value) => save(userId, id, value),

    async remove(userId, id) {
      // Tags first, and only if the entry is really this user's; then the entry itself.
      const [, entry] = await db.batch(
        [
          {
            sql: 'DELETE FROM entry_tags WHERE entry_id = ? AND entry_id IN (SELECT id FROM entries WHERE id = ? AND user_id = ?)',
            args: [id, id, userId],
          },
          { sql: 'DELETE FROM entries WHERE id = ? AND user_id = ?', args: [id, userId] },
        ],
        'write',
      );
      return entry.rowsAffected > 0;
    },

    /** Filtered, newest-first page of entries plus the total match count. */
    async search(userId, { q, tags = [], from, to, cadence, limit, offset }) {
      const where = ['e.user_id = ?'];
      const params = [userId];

      if (cadence) {
        where.push('e.cadence = ?');
        params.push(cadence);
      }
      // A weekly log covers Mon–Sun, so match on overlap with the requested range.
      if (from) {
        where.push("date(e.period_date, CASE e.cadence WHEN 'weekly' THEN '+6 days' ELSE '+0 days' END) >= ?");
        params.push(from);
      }
      if (to) {
        where.push('e.period_date <= ?');
        params.push(to);
      }
      for (const tag of tags) {
        where.push('EXISTS (SELECT 1 FROM entry_tags t WHERE t.entry_id = e.id AND t.tag = ?)');
        params.push(tag);
      }
      if (q) {
        const like = `%${escapeLike(q)}%`;
        const cols = TEXT_FIELDS.map((f) => `e.${f} LIKE ? ESCAPE '\\'`).join(' OR ');
        where.push(`(${cols} OR EXISTS (SELECT 1 FROM entry_tags t WHERE t.entry_id = e.id AND t.tag LIKE ? ESCAPE '\\'))`);
        params.push(...TEXT_FIELDS.map(() => like), like);
      }

      const clause = where.join(' AND ');
      const [total, rows] = await Promise.all([
        all(`SELECT COUNT(*) AS n FROM entries e WHERE ${clause}`, params),
        all(`SELECT e.* FROM entries e WHERE ${clause} ORDER BY e.period_date DESC, e.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
      ]);
      return { entries: await withTags(rows), total: total[0].n };
    },

    allTags: (userId) =>
      all(
        `SELECT t.tag, COUNT(*) AS count FROM entry_tags t
         JOIN entries e ON e.id = t.entry_id WHERE e.user_id = ?
         GROUP BY t.tag ORDER BY count DESC, t.tag`,
        [userId],
      ),

    topTagsSince: (userId, since, limit = 10) =>
      all(
        `SELECT t.tag, COUNT(*) AS count FROM entry_tags t
         JOIN entries e ON e.id = t.entry_id WHERE e.user_id = ? AND e.period_date >= ?
         GROUP BY t.tag ORDER BY count DESC, t.tag LIMIT ?`,
        [userId, since, limit],
      ),

    statRows: (userId) => all('SELECT cadence, period_date, mood FROM entries WHERE user_id = ?', [userId]),
  };
}
