#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || '') : fallback;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

const apply = process.argv.includes('--apply');
const dbPath = arg('--db', path.resolve(__dirname, '..', '.local', 'cpx-local.sqlite'));
const boardUserId = arg('--board-user', 'gangryeol-cpx-a4-editor-reset-20260515');
const userId = arg('--user-id');
const docId = arg('--doc-id');
const reason = arg('--reason', 'CPX integrity repair: foreign master document mapped into personal overlay');

if (!userId || !docId) {
  throw new Error('usage: repair_cpx_personal_overlay.js --user-id <id> --doc-id <id> [--apply]');
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000');
const row = db.prepare('SELECT state_json FROM board_state WHERE user_id = ?').get(boardUserId);
const overlayRow = db.prepare('SELECT overlay_json, created_at, updated_at, updated_by FROM a4_personal_overlays WHERE board_user_id = ? AND user_id = ?').get(boardUserId, userId);
if (!row || !overlayRow) throw new Error('master state or personal overlay was not found');

const master = JSON.parse(row.state_json);
const before = JSON.parse(overlayRow.overlay_json);
const text = String(before.docs?.[docId] || '');
if (!text) throw new Error(`overlay doc ${docId} is already absent`);
const matchingMasterIds = Object.entries(master.docs || {})
  .filter(([id, value]) => String(id) !== String(docId) && String(value || '') === text)
  .map(([id]) => String(id));
if (!matchingMasterIds.length) throw new Error(`overlay doc ${docId} is not an exact foreign master-document copy; refusing surgical deletion`);

const after = structuredClone(before);
delete after.docs[docId];
const at = new Date().toISOString();
after.updatedAt = at;
after.updatedBy = 'CPX integrity repair';
after.saveEvent = { id: `integrity-repair-${Date.now()}`, docId, updatedAt: at, scope: 'remove-foreign-personal-overlay-document' };

const report = {
  apply,
  dbPath,
  boardUserId,
  userId,
  docId,
  matchingMasterIds,
  beforeDocHash: hash(text),
  beforeDocChars: text.length,
  beforeOverlayDocIds: Object.keys(before.docs || {}).sort(),
  afterOverlayDocIds: Object.keys(after.docs || {}).sort(),
  beforeUpdatedAt: overlayRow.updated_at,
  afterUpdatedAt: at,
};

if (apply) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS a4_personal_overlay_recovery_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_user_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      before_overlay_json TEXT NOT NULL,
      after_overlay_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO a4_personal_overlay_recovery_log
        (board_user_id, user_id, doc_id, before_overlay_json, after_overlay_json, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(boardUserId, userId, docId, JSON.stringify(before), JSON.stringify(after), reason, at);
    db.prepare(`
      UPDATE a4_personal_overlays
      SET overlay_json = ?, updated_at = ?, updated_by = ?, client_session_id = NULL
      WHERE board_user_id = ? AND user_id = ?
    `).run(JSON.stringify(after), at, 'CPX integrity repair', boardUserId, userId);
    db.exec('COMMIT');
    report.recoveryLogId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

db.close();
console.log(JSON.stringify(report, null, 2));
