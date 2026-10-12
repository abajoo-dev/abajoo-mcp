import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { callTool, toolsList } from './tools.js';
import { closeSession, openSession, recordToolCall, touchSession } from './activity.js';

export function buildServer(config, { onToolCall, apiKey = null, userId = null } = {}) {
  const server = new Server({ name: 'abj-odoo-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const includeSystem = apiKey ? apiKey.scope === 'admin' || apiKey.scope === 'config_read' : false;
    return { tools: await toolsList({ includeSystem, userId }) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const started = performance.now();
    let status = 'error';
    let errorMessage = null;
    let resultSummary = null;
    try {
      const result = await callTool(request.params.name, request.params.arguments || {}, config, userId);
      status = result.isError ? 'error' : 'success';
      if (result.isError) {
        errorMessage = result.content?.[0]?.text;
      } else {
        resultSummary = `Length: ${result.content?.[0]?.text?.length || 0}`;
      }
      return result;
    } catch (err) {
      status = 'error';
      errorMessage = err.message;
      return { isError: true, content: [{ type: 'text', text: `Error: ${err.message}` }] };
    } finally {
      if (onToolCall) {
        await onToolCall(
          request.params.name,
          status,
          Math.round(performance.now() - started),
          request.params.arguments,
          errorMessage,
          resultSummary
        );
      }
    }
  });
  return server;
}

export function createMcpRouter(config, { idleTimeoutMs = 60 * 60 * 1000 } = {}) {
  const sessions = new Map();
  async function prune() {
    for (const [id, entry] of sessions) {
      if (entry.lastSeen < Date.now() - idleTimeoutMs) {
        await closeSession(id, 'expired');
        sessions.delete(id);
        await entry.transport.close();
        await entry.server.close();
      }
    }
  }
  return {
    prune,
    async handle(req, res, body, authContext = {}) {
      await prune();
      const requestedId = req.headers['mcp-session-id'];
      if (requestedId && typeof requestedId !== 'string') {
        res.writeHead(400).end('Invalid session header');
        return;
      }
      if (requestedId && !sessions.has(requestedId)) {
        res.writeHead(404).end('Session not found');
        return;
      }
      if (requestedId) {
        const entry = sessions.get(requestedId);
        entry.lastSeen = Date.now();
        await touchSession(requestedId);
        await entry.transport.handleRequest(req, res, body);
        return;
      }

      let activeSessionId = null;
      let activeTransport = null;
      let activeServer = null;

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: async (sessionId) => {
          activeSessionId = sessionId;
          sessions.set(sessionId, { server, transport, lastSeen: Date.now() });
          await openSession({
            id: sessionId,
            apiKeyId: authContext.apiKey?.id || null,
            client: body?.params?.clientInfo?.name,
            version: body?.params?.clientInfo?.version,
            remoteIp: req.socket.remoteAddress,
          });
        },
      });
      activeTransport = transport;

      const resolvedUserId = (authContext.isMaster || authContext.apiKey?.scope === 'admin') ? null : (authContext.apiKey?.user_id || null);
      const server = buildServer(config, {
        apiKey: authContext.apiKey || null,
        userId: resolvedUserId,
        onToolCall: (toolName, status, durationMs, params, errorMsg, summary) => {
          if (!activeSessionId) return;
          return recordToolCall({
            sessionId: activeSessionId,
            apiKeyId: authContext.apiKey?.id || null,
            toolName,
            status,
            durationMs,
            params,
            errorMessage: errorMsg,
            resultSummary: summary,
          });
        },
      });
      activeServer = server;

      transport.onclose = () => {
        if (activeSessionId) {
          const sid = activeSessionId;
          sessions.delete(sid);
          void closeSession(sid).catch((error) => console.error('Session close failed:', error.message));
        }
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    },
    async revoke(id) {
      const entry = sessions.get(id);
      if (!entry) return false;
      sessions.delete(id);
      await closeSession(id, 'revoked');
      await entry.transport.close();
      await entry.server.close();
      return true;
    },
  };
}
