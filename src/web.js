import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { equalHash, readJson, verifyToken, encrypt } from './config.js';
import { listConnections, removeConnection, saveConnection, validateConnection } from './store.js';
import { detectVersion, probeOdoo } from './odoo.js';
import { createMcpRouter } from './mcp.js';
import { closeInterruptedSessions, listActivity } from './activity.js';
import {
  connectionsPage,
  keysPage,
  landingPage,
  loginPage,
  logsPage,
  overviewPage,
  registerPage,
  sessionsPage,
  usersPage,
} from './admin-ui.js';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey, revealApiKey,
  authenticateKey,
  authenticateUser,
  createUser,
  listUsers,
  updateUser,
  resetUserPassword,
  deleteUser,
  ensureAdminUser,
} from './db.js';

const css = await readFile(new URL('./admin.css', import.meta.url), 'utf8');
const sessionLifetimeMs = 8 * 60 * 60 * 1000;

function respond(res, status, text, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    ...headers,
  });
  res.end(text);
}

function redirect(res, location, headers = {}) {
  respond(res, 303, '', 'text/plain; charset=utf-8', { Location: location, ...headers });
}

async function body(req, maxSize = 16_384) {
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > maxSize) throw new Error('Request payload too large');
    parts.push(part);
  }
  return Buffer.concat(parts).toString('utf8');
}

async function mcpBody(req) {
  if (Number(req.headers['content-length']) > 1_048_576) throw new Error('MCP request exceeds 1 MiB limit');
  return JSON.parse(await body(req, 1_048_576));
}

function sameOrigin(req) {
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'same-origin' || secFetchSite === 'none') return true;

  const origin = req.headers.origin;
  if (!origin || origin === 'null') {
    const referer = req.headers.referer;
    if (!referer) return true;
    try {
      const refHost = new URL(referer).host;
      const expectedHost = req.headers['x-forwarded-host'] || req.headers.host || '';
      if (refHost === expectedHost) return true;
      const loopbacks = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
      const refHostname = new URL(referer).hostname;
      const [expHostname] = expectedHost.split(':');
      if (loopbacks.has(refHostname) && loopbacks.has(expHostname)) return true;
    } catch {
      return false;
    }
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;
    const expectedHost = req.headers['x-forwarded-host'] || req.headers.host || '';
    if (originHost === expectedHost) return true;

    const loopbacks = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
    const [expHostname, expPort = (req.socket?.encrypted ? '443' : '80')] = expectedHost.split(':');
    const originPort = originUrl.port || (originUrl.protocol === 'https:' ? '443' : '80');

    if (loopbacks.has(originUrl.hostname) && loopbacks.has(expHostname) && originPort === expPort) {
      return true;
    }

    const allowed = String(process.env.ABJ_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.includes(origin) || allowed.includes(originUrl.origin)) return true;

    return false;
  } catch {
    return false;
  }
}

function sessionCookie(req, token) {
  const secure = req.socket.encrypted || process.env.ABJ_COOKIE_SECURE === '1';
  return `abj_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeMs / 1000}${secure ? '; Secure' : ''}`;
}

export function createApp(config, options = {}) {
  const failedLogins = new Map();
  const adminSessions = new Map();
  const mcp = createMcpRouter(config, options);

  const currentAdmin = (req) => {
    const token = /(?:^|;\s*)abj_admin=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    const session = token && adminSessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      adminSessions.delete(token);
      return null;
    }
    return session;
  };

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;

      if (pathname === '/health' && ['GET', 'HEAD'].includes(req.method)) {
        return respond(res, 200, 'ok');
      }

      if (pathname === '/assets/admin.css' && ['GET', 'HEAD'].includes(req.method)) {
        return respond(res, 200, css, 'text/css; charset=utf-8');
      }

      if (pathname === '/mcp') {
        const match = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
        if (!match) {
          return respond(res, 401, 'Unauthorized', 'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Bearer' });
        }
        const token = match[1];
        let authContext = {};
        if (verifyToken(token, config)) {
          authContext = { isMaster: true, apiKey: { id: null, scope: 'admin', name: 'Master Token' } };
        } else {
          const authResult = authenticateKey(token, req.socket.remoteAddress);
          if (!authResult || !authResult.valid) {
            const msg = authResult?.reason || 'Invalid API key';
            const statusCode = msg.includes('Rate limit') ? 429 : 401;
            return respond(res, statusCode, `Unauthorized: ${msg}`, 'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Bearer' });
          }
          authContext = { isMaster: false, apiKey: authResult.key };
        }

        if (req.headers.origin && !sameOrigin(req) && !String(process.env.ABJ_ALLOWED_ORIGINS || '').split(',').includes(req.headers.origin)) {
          return respond(res, 403, 'Origin not allowed');
        }
        if (!['POST', 'GET', 'DELETE'].includes(req.method)) {
          return respond(res, 405, 'Method not allowed');
        }
        return await mcp.handle(req, res, req.method === 'POST' ? await mcpBody(req) : undefined, authContext);
      }

      if (pathname === '/' && ['GET', 'HEAD'].includes(req.method)) {
        return respond(res, 200, landingPage({ isLoggedIn: Boolean(currentAdmin(req)) }), 'text/html; charset=utf-8');
      }

      if (pathname === '/login' && ['GET', 'HEAD'].includes(req.method)) {
        if (currentAdmin(req)) return redirect(res, '/admin');
        const noticeKey = url.searchParams.get('notice');
        const loginNotice = noticeKey === 'registered' ? 'Akun berhasil dibuat! Silakan sign in.' : '';
        return respond(res, 200, loginPage({ csrf: config.csrfToken, notice: loginNotice }), 'text/html; charset=utf-8');
      }

      if (pathname === '/login' && req.method === 'POST') {
        if (!sameOrigin(req)) {
          return respond(res, 403, loginPage({ csrf: config.csrfToken, error: 'Origin mismatch. Akses login melalui URL loopback yang sama (http://127.0.0.1:8090/login).' }), 'text/html; charset=utf-8');
        }
        const form = new URLSearchParams(await body(req));
        if (form.get('csrf') !== config.csrfToken) {
          return respond(res, 403, loginPage({ csrf: config.csrfToken, error: 'Invalid CSRF token. Silakan refresh halaman login.' }), 'text/html; charset=utf-8');
        }
        const address = req.socket.remoteAddress;
        const recent = (failedLogins.get(address) || []).filter((timestamp) => timestamp > Date.now() - 60_000);
        if (recent.length >= 5) {
          return respond(res, 429, loginPage({ csrf: config.csrfToken, error: 'Terlalu banyak percobaan login gagal. Coba lagi 1 menit.' }), 'text/html; charset=utf-8');
        }
        const expected = config || await readJson('server.json');
        const inputUsername = form.get('username') || '';
        const inputPassword = form.get('password') || '';
        let sessionUser = null;
        if (inputUsername === 'admin' && equalHash(inputPassword, expected.salt, expected.adminHash)) {
          sessionUser = { id: 'admin', username: 'admin', email: 'admin@local', role: 'admin' };
        } else {
          const dbUser = authenticateUser(inputUsername, inputPassword);
          if (dbUser) sessionUser = dbUser;
        }
        if (!sessionUser) {
          recent.push(Date.now());
          failedLogins.set(address, recent);
          return respond(res, 401, loginPage({ csrf: config.csrfToken, error: 'Username atau password salah.' }), 'text/html; charset=utf-8');
        }
        failedLogins.delete(address);
        const token = randomBytes(32).toString('base64url');
        adminSessions.set(token, { expiresAt: Date.now() + sessionLifetimeMs, csrf: randomBytes(32).toString('base64url'), user: sessionUser });
        for (const [key, value] of adminSessions) {
          if (value.expiresAt <= Date.now()) adminSessions.delete(key);
        }
        if (adminSessions.size > 100) adminSessions.delete(adminSessions.keys().next().value);
        return redirect(res, '/admin', { 'Set-Cookie': sessionCookie(req, token) });
      }

      if (pathname === '/register' && ['GET', 'HEAD'].includes(req.method)) {
        if (currentAdmin(req)) return redirect(res, '/admin');
        return respond(res, 200, registerPage({ csrf: config.csrfToken }), 'text/html; charset=utf-8');
      }

      if (pathname === '/register' && req.method === 'POST') {
        if (!sameOrigin(req)) {
          return respond(res, 403, registerPage({ csrf: config.csrfToken, error: 'Origin mismatch.' }), 'text/html; charset=utf-8');
        }
        const form = new URLSearchParams(await body(req));
        if (form.get('csrf') !== config.csrfToken) {
          return respond(res, 403, registerPage({ csrf: config.csrfToken, error: 'Invalid CSRF token.' }), 'text/html; charset=utf-8');
        }
        const regUsername = (form.get('username') || '').trim();
        const regEmail = (form.get('email') || '').trim();
        const regPassword = form.get('password') || '';
        const regConfirm = form.get('confirmPassword') || '';
        if (regPassword !== regConfirm) {
          return respond(res, 400, registerPage({ csrf: config.csrfToken, error: 'Password dan konfirmasi tidak sama.' }), 'text/html; charset=utf-8');
        }
        try {
          const newUser = createUser({ username: regUsername, email: regEmail, password: regPassword, role: 'user' });
          createApiKey({ name: `${newUser.username} Default Key`, scope: 'crud_read', userId: newUser.id });
          return redirect(res, '/login?notice=registered');
        } catch (err) {
          return respond(res, 400, registerPage({ csrf: config.csrfToken, error: err.message }), 'text/html; charset=utf-8');
        }
      }

      if (pathname === '/logout' && req.method === 'POST') {
        if (!sameOrigin(req)) return respond(res, 403, 'Origin mismatch');
        const token = /(?:^|;\s*)abj_admin=([^;]+)/.exec(req.headers.cookie || '')?.[1];
        if (token) adminSessions.delete(token);
        return redirect(res, '/login', { 'Set-Cookie': 'abj_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
      }

      if (pathname !== '/admin' && !pathname.startsWith('/admin/')) {
        return respond(res, 404, 'Not found');
      }

      const admin = currentAdmin(req);
      if (!admin) {
        return req.method === 'GET' ? redirect(res, '/login') : respond(res, 401, 'Sign in first');
      }

      const noticeMap = {
        saved: 'Odoo connection tested and saved.',
        removed: 'Connection removed.',
        revoked: 'MCP session revoked.',
        key_created: 'New API Key generated successfully.',
        key_revoked: 'API Key revoked.',
        user_pw_reset: 'Password user berhasil direset.',
        user_updated: 'User berhasil diupdate.',
        user_deleted: 'User berhasil dihapus.',
      };
      const notice = noticeMap[url.searchParams.get('notice')] || '';

      const currentUser = admin.user || { id: 'admin', username: 'admin', email: 'admin@local', role: 'admin' };
      const isAdminUser = currentUser.role === 'admin';

      if (req.method === 'GET') {
        await mcp.prune();
        const userId = isAdminUser ? null : currentUser.id;
        const connections = await listConnections(userId);
        const { sessions, logs } = await listActivity();

        if (pathname === '/admin') {
          const keys = listApiKeys(userId);
          return respond(res, 200, overviewPage({ connections, sessions, logs, keys, notice, user: currentUser }), 'text/html; charset=utf-8');
        }
        if (pathname === '/admin/connections') {
          const users = isAdminUser ? listUsers() : [];
          return respond(res, 200, connectionsPage({ connections, csrf: admin.csrf, notice, user: currentUser, users }), 'text/html; charset=utf-8');
        }
        if (pathname === '/admin/keys') {
          const keys = listApiKeys(userId);
          const tokenNotice = url.searchParams.get('token') || '';
          return respond(res, 200, keysPage({ keys, csrf: admin.csrf, notice, tokenNotice, user: currentUser }), 'text/html; charset=utf-8');
        }
        if (pathname === '/admin/sessions') {
          return respond(res, 200, sessionsPage({ sessions, csrf: admin.csrf, notice, user: currentUser }), 'text/html; charset=utf-8');
        }
        if (pathname === '/admin/logs') {
          const currentStatus = url.searchParams.get('status') || 'all';
          const searchQuery = url.searchParams.get('q') || '';
          const filtered = await listActivity({
            status: currentStatus === 'all' ? null : currentStatus,
            search: searchQuery,
          });
          return respond(res, 200, logsPage({
            logs: filtered.logs,
            sessions: filtered.sessions,
            currentStatus,
            searchQuery,
            notice,
            user: currentUser,
          }), 'text/html; charset=utf-8');
        }
        if (pathname === '/admin/users') {
          if (!isAdminUser) return respond(res, 403, 'Akses ditolak: hanya admin yang dapat mengakses halaman ini.');
          const users = listUsers();
          return respond(res, 200, usersPage({ users, csrf: admin.csrf, notice, user: currentUser }), 'text/html; charset=utf-8');
        }
        return respond(res, 404, 'Not found');
      }

      if (req.method !== 'POST') return respond(res, 405, 'Method not allowed');
      if (!sameOrigin(req)) return respond(res, 403, 'Origin mismatch');

      const form = new URLSearchParams(await body(req));
      if (form.get('csrf') !== admin.csrf) return respond(res, 403, 'Invalid CSRF token');

      // User management routes (admin-only)
      if (pathname === '/admin/users/reset-password') {
        if (!isAdminUser) return respond(res, 403, 'Akses ditolak');
        const targetUserId = form.get('userId');
        const newPassword = form.get('password') || '';
        try {
          resetUserPassword(targetUserId, newPassword);
          return redirect(res, '/admin/users?notice=user_pw_reset');
        } catch (err) {
          const users = listUsers();
          return respond(res, 400, usersPage({ users, csrf: admin.csrf, error: err.message, user: currentUser }), 'text/html; charset=utf-8');
        }
      }

      if (pathname === '/admin/users/update') {
        if (!isAdminUser) return respond(res, 403, 'Akses ditolak');
        const targetUserId = form.get('userId');
        const newEmail = form.get('email');
        const newRole = form.get('role');
        const newStatus = form.get('status');
        try {
          updateUser(targetUserId, { email: newEmail, role: newRole, status: newStatus });
          return redirect(res, '/admin/users?notice=user_updated');
        } catch (err) {
          const users = listUsers();
          return respond(res, 400, usersPage({ users, csrf: admin.csrf, error: err.message, user: currentUser }), 'text/html; charset=utf-8');
        }
      }

      if (pathname === '/admin/users/delete') {
        if (!isAdminUser) return respond(res, 403, 'Akses ditolak');
        const targetUserId = form.get('userId');
        try {
          deleteUser(targetUserId);
          return redirect(res, '/admin/users?notice=user_deleted');
        } catch (err) {
          const users = listUsers();
          return respond(res, 400, usersPage({ users, csrf: admin.csrf, error: err.message, user: currentUser }), 'text/html; charset=utf-8');
        }
      }

      if (pathname === '/admin/keys/reveal') {
        const keyId = form.get('keyId');
        const password = form.get('password');
        try {
          const token = revealApiKey(keyId, currentUser.id, password);
          return respond(res, 200, JSON.stringify({ token }), 'application/json');
        } catch (err) {
          return respond(res, 403, JSON.stringify({ error: err.message }), 'application/json');
        }
      }

      if (pathname === '/admin/sessions/revoke') {
        if (!(await mcp.revoke(form.get('id')))) return respond(res, 404, 'Active session not found');
        return redirect(res, '/admin/sessions?notice=revoked');
      }

      if (pathname === '/admin/keys/create') {
        const name = form.get('name') || 'Agent Key';
        const scope = form.get('scope') || 'crud_read';
        const rateLimit = Number(form.get('rateLimit')) || 60;
        const ipAllowlist = form.get('ipAllowlist') || '';
        const expiresAt = form.get('expiresAt') || null;
        const keyUserId = isAdminUser ? (form.get('userId') || 'admin') : currentUser.id;
        const created = createApiKey({ name, scope, rateLimit, ipAllowlist, expiresAt, userId: keyUserId === 'admin' ? null : keyUserId });
        return redirect(res, `/admin/keys?token=${encodeURIComponent(created.token)}&notice=key_created`);
      }

      if (pathname === '/admin/keys/revoke') {
        const id = form.get('id');
        if (id) revokeApiKey(id);
        return redirect(res, '/admin/keys?notice=key_revoked');
      }

      if (pathname === '/admin/delete') {
        if (form.get('confirm') !== form.get('slug')) return respond(res, 400, 'Type the exact slug to remove');
        await removeConnection(form.get('slug'), isAdminUser ? null : currentUser.id);
        return redirect(res, '/admin/connections?notice=removed');
      }

      if (pathname === '/admin/connections') {
        const raw = Object.fromEntries(form.entries());
        try {
          const hasCrudControls = form.has('_has_crud');
          const canCreate = hasCrudControls ? form.has('canCreate') : Boolean(raw.canCreate);
          const canRead = hasCrudControls ? form.has('canRead') : (raw.canRead !== undefined ? Boolean(raw.canRead) : true);
          const canUpdate = hasCrudControls ? form.has('canUpdate') : Boolean(raw.canUpdate);
          const canDelete = hasCrudControls ? form.has('canDelete') : Boolean(raw.canDelete);
          const excludeAccounting = hasCrudControls ? form.has('excludeAccounting') : Boolean(raw.excludeAccounting);
          const excludePayroll = hasCrudControls ? form.has('excludePayroll') : Boolean(raw.excludePayroll);
          const allowSelfSigned = form.has('allowSelfSigned') ? form.get('allowSelfSigned') === '1' : Boolean(raw.allowSelfSigned);

          const validated = validateConnection({
            slug: raw.slug,
            url: raw.url,
            database: raw.database,
            login: raw.login,
            apiKey: raw.apiKey,
            version: raw.version || 'auto',
            models: raw.models ? raw.models.split(/[\s,]+/).filter(Boolean) : undefined,
            canCreate,
            canRead,
            canUpdate,
            canDelete,
            excludeAccounting,
            excludePayroll,
            allowSelfSigned,
          });
          const serverConfig = config || await readJson('server.json');
          const encrypted = { ...validated, apiKey: encrypt(validated.apiKey, serverConfig) };
          const version = validated.version === 'auto' ? await detectVersion(encrypted, serverConfig) : validated.version;
          await probeOdoo({ ...encrypted, version }, serverConfig);
          const replace = form.get('replace') === '1' || form.get('replace') === 'true';
          const connUserId = isAdminUser ? (form.get('userId') || 'admin') : currentUser.id;
          await saveConnection({
            ...validated,
            version,
            userId: connUserId,
          }, serverConfig, { replace });
          return redirect(res, '/admin/connections?notice=saved');
        } catch (err) {
          const connListUser = isAdminUser ? null : currentUser.id;
          const connections = await listConnections(connListUser);
          const users = isAdminUser ? listUsers() : [];
          return respond(res, 400, connectionsPage({ connections, csrf: admin.csrf, error: err.message, formValues: raw, user: currentUser, users }), 'text/html; charset=utf-8');
        }
      }

      return respond(res, 404, 'Not found');
    } catch (err) {
      if (err.message === 'Request payload too large') return respond(res, 413, err.message);
      if (err.message === 'MCP request exceeds 1 MiB limit') return respond(res, 413, err.message);
      return respond(res, 500, err.message);
    }
  });
}

export async function startServer(options = {}) {
  const config = await readJson('server.json');
  if (!config) throw new Error('Server not initialized. Run abj-odoo-mcp init first.');
  ensureAdminUser({ salt: config.salt, adminHash: config.adminHash });
  const port = options.port ?? (process.env.ABJ_PORT ? Number(process.env.ABJ_PORT) : 8090);
  const host = options.host ?? (process.env.ABJ_HOST || '127.0.0.1');
  const app = createApp(config);
  await new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(port, host, () => resolve());
  });
  const actualPort = app.address().port;
  console.log(`ABJ Odoo MCP Gateway listening on http://${host}:${actualPort}/admin`);
  return { app, port: actualPort, host };
}
