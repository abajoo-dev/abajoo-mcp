import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { dataDir, readJson } from './config.js';

let dbInstance = null;

export function getDb() {
  if (dbInstance) return dbInstance;
  const dir = dataDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dbPath = join(dir, 'abj-odoo-mcp.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL DEFAULT 'crud_read',
      rate_limit INTEGER NOT NULL DEFAULT 60,
      ip_allowlist TEXT DEFAULT '',
      expires_at TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      api_key_id TEXT,
      client_name TEXT NOT NULL DEFAULT 'unknown',
      client_version TEXT DEFAULT '',
      remote_ip TEXT NOT NULL DEFAULT 'unknown',
      state TEXT NOT NULL DEFAULT 'active',
      tool_call_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tool_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      api_key_id TEXT,
      tool_name TEXT NOT NULL,
      params_json TEXT,
      result_summary TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      called_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_called ON tool_logs(called_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_status ON tool_logs(status);
    CREATE INDEX IF NOT EXISTS idx_keys_hash ON api_keys(token_hash);
  `);

  migrateLegacyActivity(db);
  dbInstance = db;
  return dbInstance;
}

function migrateLegacyActivity(db) {
  try {
    const check = db.prepare('SELECT COUNT(*) AS count FROM sessions').get();
    if (check.count > 0) return;
    const dir = dataDir();
    import('./config.js').then(async ({ readJson }) => {
      const legacy = await readJson('activity.json');
      if (!legacy) return;
      const insertSession = db.prepare(`
        INSERT OR IGNORE INTO sessions (id, client_name, remote_ip, state, tool_call_count, started_at, last_activity_at, ended_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of (legacy.sessions || [])) {
        insertSession.run(s.id, s.client || 'unknown', s.remoteIp || 'unknown', s.state || 'closed', s.toolCallCount || 0, s.startTime || new Date().toISOString(), s.lastActivity || s.startTime || new Date().toISOString(), s.endTime || null);
      }
      const insertLog = db.prepare(`
        INSERT OR IGNORE INTO tool_logs (id, session_id, tool_name, status, duration_ms, called_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const l of (legacy.logs || [])) {
        insertLog.run(l.id || randomUUID(), l.sessionId || null, l.toolName || 'unknown', l.status || 'success', l.durationMs || 0, l.calledAt || new Date().toISOString());
      }
    }).catch(() => {});
  } catch {
    // best-effort
  }
}

/* =========================================================================
   API Keys Operations
   ========================================================================= */

export function hashToken(token) {
  return createHash('sha256').update(String(token).trim()).digest('hex');
}

export function createApiKey({ name, scope = 'crud_read', rateLimit = 60, ipAllowlist = '', expiresAt = null }) {
  const db = getDb();
  const id = randomUUID();
  const rawSecret = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const token = `abj_mcp_${rawSecret}`;
  const prefix = token.slice(0, 14);
  const token_hash = hashToken(token);
  const created_at = new Date().toISOString();

  db.prepare(`
    INSERT INTO api_keys (id, name, prefix, token_hash, scope, rate_limit, ip_allowlist, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, String(name || 'Default Key').trim(), prefix, token_hash, scope, Number(rateLimit) || 60, String(ipAllowlist || '').trim(), expiresAt || null, created_at);

  return { id, name, prefix, token, scope, rateLimit, expiresAt, created_at };
}

export function listApiKeys() {
  const db = getDb();
  return db.prepare(`
    SELECT id, name, prefix, scope, rate_limit, ip_allowlist, expires_at, created_at, last_used_at, revoked_at
    FROM api_keys
    ORDER BY created_at DESC
  `).all();
}

export function revokeApiKey(id) {
  const db = getDb();
  const now = new Date().toISOString();
  const res = db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, id);
  return res.changes > 0;
}

export function authenticateKey(token, remoteIp = '') {
  if (!token) return null;
  const db = getDb();
  const hashed = hashToken(token);
  const row = db.prepare(`
    SELECT id, name, prefix, scope, rate_limit, ip_allowlist, expires_at, revoked_at
    FROM api_keys
    WHERE token_hash = ?
  `).get(hashed);

  if (!row) return null;
  if (row.revoked_at) return { valid: false, reason: 'Key has been revoked' };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'Key has expired' };
  }
  if (row.ip_allowlist) {
    const allowed = row.ip_allowlist.split(/[\s,]+/).filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(remoteIp) && remoteIp !== '127.0.0.1' && remoteIp !== '::1') {
      return { valid: false, reason: 'IP not in allowlist' };
    }
  }

  // Rate limit check (calls within last 60s)
  const windowSec = 60;
  const recentCalls = db.prepare(`
    SELECT COUNT(*) AS count
    FROM tool_logs
    WHERE api_key_id = ? AND datetime(called_at) > datetime('now', '-1 minute')
  `).get(row.id).count;

  if (row.rate_limit && recentCalls >= row.rate_limit) {
    return { valid: false, reason: `Rate limit exceeded (${row.rate_limit}/min)` };
  }

  // Touch last_used_at
  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);

  return { valid: true, key: row };
}

/* =========================================================================
   Sessions Operations
   ========================================================================= */

export function openSessionRecord({ id, apiKeyId = null, client = 'unknown', version = '', remoteIp = 'unknown' }) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO sessions (id, api_key_id, client_name, client_version, remote_ip, state, tool_call_count, started_at, last_activity_at)
    VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)
  `).run(id, apiKeyId, String(client || 'unknown').slice(0, 80), String(version || '').slice(0, 40), String(remoteIp || 'unknown').slice(0, 60), now, now);
}

export function touchSessionRecord(id) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE sessions SET last_activity_at = ? WHERE id = ? AND state = 'active'").run(now, id);
}

export function closeSessionRecord(id, state = 'closed') {
  const db = getDb();
  const now = new Date().toISOString();
  const res = db.prepare(`
    UPDATE sessions
    SET state = ?, ended_at = ?
    WHERE id = ? AND state = 'active'
  `).run(state, now, id);
  return res.changes > 0;
}

export function closeInterruptedSessionsRecord() {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE sessions
    SET state = 'interrupted', ended_at = ?
    WHERE state = 'active'
  `).run(now);
}

export function listSessionsRecord({ limit = 100 } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT s.id, s.api_key_id, k.name AS api_key_name, s.client_name, s.client_version,
           s.remote_ip, s.state, s.tool_call_count, s.started_at, s.last_activity_at, s.ended_at
    FROM sessions s
    LEFT JOIN api_keys k ON s.api_key_id = k.id
    ORDER BY s.started_at DESC
    LIMIT ?
  `).all(limit);
}

/* =========================================================================
   Tool Logs Operations
   ========================================================================= */

export function recordToolCallRecord({
  sessionId = null,
  apiKeyId = null,
  toolName,
  params = null,
  resultSummary = null,
  status = 'success',
  errorMessage = null,
  durationMs = 0
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();

  let paramsJson = null;
  if (params && typeof params === 'object') {
    try {
      const sanitized = sanitizePayload(params);
      paramsJson = JSON.stringify(sanitized);
    } catch {
      paramsJson = '{"_error":"serialization_failed"}';
    }
  }

  db.prepare(`
    INSERT INTO tool_logs (id, session_id, api_key_id, tool_name, params_json, result_summary, status, error_message, duration_ms, called_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, sessionId, apiKeyId,
    String(toolName || 'unknown').slice(0, 120),
    paramsJson,
    resultSummary ? String(resultSummary).slice(0, 500) : null,
    status,
    errorMessage ? String(errorMessage).slice(0, 500) : null,
    Math.round(Number(durationMs) || 0),
    now
  );

  if (sessionId) {
    db.prepare(`
      UPDATE sessions
      SET tool_call_count = tool_call_count + 1, last_activity_at = ?
      WHERE id = ?
    `).run(now, sessionId);
  }

  // Prune older logs (keep last 5000)
  db.prepare(`
    DELETE FROM tool_logs
    WHERE id NOT IN (SELECT id FROM tool_logs ORDER BY called_at DESC LIMIT 5000)
  `).run();

  return id;
}

export function listToolLogsRecord({ limit = 100, status = null, toolName = null, search = '' } = {}) {
  const db = getDb();
  let query = `
    SELECT l.id, l.session_id, l.api_key_id, k.name AS api_key_name, l.tool_name,
           l.params_json, l.result_summary, l.status, l.error_message, l.duration_ms, l.called_at,
           s.client_name, s.remote_ip
    FROM tool_logs l
    LEFT JOIN api_keys k ON l.api_key_id = k.id
    LEFT JOIN sessions s ON l.session_id = s.id
    WHERE 1=1
  `;
  const params = [];
  if (status && status !== 'all') {
    query += ' AND l.status = ?';
    params.push(status);
  }
  if (toolName) {
    query += ' AND l.tool_name LIKE ?';
    params.push(`%${toolName}%`);
  }
  if (search) {
    query += ' AND (l.tool_name LIKE ? OR l.params_json LIKE ? OR l.error_message LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY l.called_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params);
}

function sanitizePayload(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.slice(0, 20).map(sanitizePayload);
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/(password|secret|key|token|auth|credential)/i.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizePayload(v);
    } else if (typeof v === 'string') {
      clean[k] = v.length > 200 ? v.slice(0, 200) + '...' : v;
    } else {
      clean[k] = v;
    }
  }
  return clean;
}
