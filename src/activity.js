import {
  closeInterruptedSessionsRecord,
  closeSessionRecord,
  listSessionsRecord,
  listToolLogsRecord,
  openSessionRecord,
  recordToolCallRecord,
  touchSessionRecord
} from './db.js';

export async function openSession({ id, apiKeyId = null, client = 'unknown', version = '', remoteIp = 'unknown' }) {
  openSessionRecord({ id, apiKeyId, client, version, remoteIp });
}

export async function touchSession(id) {
  touchSessionRecord(id);
}

export async function closeSession(id, state = 'closed') {
  return closeSessionRecord(id, state);
}

export async function closeInterruptedSessions() {
  closeInterruptedSessionsRecord();
}

export async function recordToolCall({
  sessionId = null,
  apiKeyId = null,
  toolName,
  params = null,
  resultSummary = null,
  status = 'success',
  errorMessage = null,
  durationMs = 0
}) {
  return recordToolCallRecord({
    sessionId,
    apiKeyId,
    toolName,
    params,
    resultSummary,
    status,
    errorMessage,
    durationMs
  });
}

const mapSession = (row) => ({
  ...row,
  client: row.client_name,
  remoteIp: row.remote_ip,
  startTime: row.started_at,
  lastActivity: row.last_activity_at,
  endTime: row.ended_at,
  toolCallCount: row.tool_call_count,
  apiKeyName: row.api_key_name,
  transport: "streamable-http",
});

const mapLog = (row) => ({
  ...row,
  sessionId: row.session_id,
  toolName: row.tool_name,
  durationMs: row.duration_ms,
  calledAt: row.called_at,
  errorMessage: row.error_message,
  resultSummary: row.result_summary,
  apiKeyName: row.api_key_name,
  clientName: row.client_name,
  remoteIp: row.remote_ip,
});

export async function listActivity({ limit = 100, status = null, toolName = null, search = "" } = {}) {
  return {
    sessions: listSessionsRecord({ limit }).map(mapSession),
    logs: listToolLogsRecord({ limit, status, toolName, search }).map(mapLog),
  };
}
