/**
 * db.ts — Local SQLite corpus storage
 * Uses better-sqlite3 (sync API, fast)
 * 
 * Schema:
 *   texts     — source texts (Chinese)
 *   segments  — sentence-level alignment (Chinese | Thai | metadata)
 */

import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = process.env.CORPUS_DB_PATH ?? './data/corpus.db';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  // Migrate existing DB — add columns if they don't exist yet
  const textCols = (db.pragma('table_info(texts)') as { name: string }[]).map(c => c.name);
  if (!textCols.includes('juan'))        db.exec(`ALTER TABLE texts ADD COLUMN juan        INTEGER DEFAULT 1`);
  if (!textCols.includes('total_juans')) db.exec(`ALTER TABLE texts ADD COLUMN total_juans INTEGER`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS texts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      source      TEXT NOT NULL,       -- 'upload' | 'cbeta' | 'manual'
      cbeta_id    TEXT,                -- e.g. T1609
      juan        INTEGER DEFAULT 1,   -- fascicle number
      total_juans INTEGER,             -- total fascicles in this work
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS segments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      text_id     INTEGER NOT NULL REFERENCES texts(id),
      seq         INTEGER NOT NULL,    -- order within text
      zh          TEXT NOT NULL,       -- Classical Chinese source
      th          TEXT,                -- Thai translation
      notes       TEXT,                -- scholar notes (JSON string)
      status      TEXT DEFAULT 'draft', -- draft | reviewed | final
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_segments_text ON segments(text_id, seq);
  `);
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export interface TextRecord {
  id: number;
  title: string;
  source: string;
  cbeta_id: string | null;
  juan: number;
  total_juans: number | null;
  created_at: string;
}

export interface SegmentRecord {
  id: number;
  text_id: number;
  seq: number;
  zh: string;
  th: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function createText(
  title: string,
  source: string,
  cbeta_id?: string,
  juan = 1,
  total_juans?: number,
): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO texts (title, source, cbeta_id, juan, total_juans) VALUES (?, ?, ?, ?, ?)'
  ).run(title, source, cbeta_id ?? null, juan, total_juans ?? null);
  return result.lastInsertRowid as number;
}

export function getTextsByWork(cbeta_id: string): TextRecord[] {
  return getDb()
    .prepare('SELECT * FROM texts WHERE cbeta_id = ? ORDER BY juan')
    .all(cbeta_id) as TextRecord[];
}

export function getAllTexts(): TextRecord[] {
  return getDb().prepare('SELECT * FROM texts ORDER BY created_at DESC').all() as TextRecord[];
}

export function getTextById(id: number): TextRecord | null {
  return getDb().prepare('SELECT * FROM texts WHERE id = ?').get(id) as TextRecord | null;
}

export function getSegmentsByText(text_id: number): SegmentRecord[] {
  return getDb()
    .prepare('SELECT * FROM segments WHERE text_id = ? ORDER BY seq')
    .all(text_id) as SegmentRecord[];
}

export function upsertSegment(
  text_id: number,
  seq: number,
  zh: string,
  th?: string,
  notes?: string
): number {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM segments WHERE text_id = ? AND seq = ?')
    .get(text_id, seq) as { id: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE segments SET zh=?, th=?, notes=?, updated_at=datetime('now')
      WHERE id=?
    `).run(zh, th ?? null, notes ?? null, existing.id);
    return existing.id;
  } else {
    const result = db
      .prepare('INSERT INTO segments (text_id, seq, zh, th, notes) VALUES (?,?,?,?,?)')
      .run(text_id, seq, zh, th ?? null, notes ?? null);
    return result.lastInsertRowid as number;
  }
}

export function updateTranslation(segment_id: number, th: string, status?: string, notes?: string) {
  const resolvedStatus = !th.trim() ? 'draft' : status;
  const db = getDb();

  if (resolvedStatus !== undefined && notes !== undefined) {
    db.prepare(`UPDATE segments SET th=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?`)
      .run(th, resolvedStatus, notes || null, segment_id);
  } else if (resolvedStatus !== undefined) {
    db.prepare(`UPDATE segments SET th=?, status=?, updated_at=datetime('now') WHERE id=?`)
      .run(th, resolvedStatus, segment_id);
  } else if (notes !== undefined) {
    db.prepare(`UPDATE segments SET th=?, notes=?, updated_at=datetime('now') WHERE id=?`)
      .run(th, notes || null, segment_id);
  } else {
    db.prepare(`UPDATE segments SET th=?, updated_at=datetime('now') WHERE id=?`)
      .run(th, segment_id);
  }
}

export function updateNotes(segment_id: number, notes: string) {
  getDb().prepare(`UPDATE segments SET notes=?, updated_at=datetime('now') WHERE id=?`)
    .run(notes || null, segment_id);
}

export function updateStatus(segment_id: number, status: string) {
  getDb().prepare(`
    UPDATE segments SET status=?, updated_at=datetime('now') WHERE id=?
  `).run(status, segment_id);
}
