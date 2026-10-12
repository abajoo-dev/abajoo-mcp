import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialize, readJson } from '../src/config.js';
import { createApp } from '../src/web.js';
import { createUser, authenticateUser, listUsers, resetUserPassword, listApiKeys } from '../src/db.js';
import { listConnections, saveConnection } from '../src/store.js';
import { toolsList, callTool } from '../src/tools.js';

test('Multi-Tenant: Registration, Authentication, Isolation, and User Management', async (t) => {
  const previousDataDir = process.env.ABJ_DATA_DIR;
  const tempDir = await mkdtemp(join(tmpdir(), 'abj-multitenant-test-'));
  process.env.ABJ_DATA_DIR = tempDir;

  t.after(async () => {
    if (previousDataDir === undefined) delete process.env.ABJ_DATA_DIR;
    else process.env.ABJ_DATA_DIR = previousDataDir;
    await rm(tempDir, { recursive: true, force: true });
  });

  await initialize('admin123456');
  const config = await readJson('server.json');
  const app = createApp(config);

  // 1. Direct DB User Management
  const userA = createUser({ username: 'dev_alfa', email: 'alfa@abajoo.co.id', password: 'password123' });
  assert.equal(userA.username, 'dev_alfa');
  assert.equal(userA.role, 'user');

  const userB = createUser({ username: 'dev_beta', email: 'beta@abajoo.co.id', password: 'password456' });
  assert.equal(userB.username, 'dev_beta');

  // Authenticate
  const authA = authenticateUser('dev_alfa', 'password123');
  assert.ok(authA);
  assert.equal(authA.id, userA.id);

  const authFail = authenticateUser('dev_alfa', 'wrongpass');
  assert.equal(authFail, null);

  // Reset Password
  resetUserPassword(userA.id, 'newpassword999');
  const authAfterReset = authenticateUser('dev_alfa', 'newpassword999');
  assert.ok(authAfterReset);

  // 2. Connection Isolation per User
  await saveConnection({
    slug: 'erp_alfa',
    url: 'https://alfa.odoo.com',
    database: 'db_alfa',
    login: 'alfa@test.com',
    apiKey: 'key_alfa',
    version: '18',
    userId: userA.id,
  }, config);

  await saveConnection({
    slug: 'erp_beta',
    url: 'https://beta.odoo.com',
    database: 'db_beta',
    login: 'beta@test.com',
    apiKey: 'key_beta',
    version: '18',
    userId: userB.id,
  }, config);

  // User A should only see erp_alfa
  const connsForA = await listConnections(userA.id);
  assert.equal(connsForA.length, 1);
  assert.equal(connsForA[0].slug, 'erp_alfa');

  // User B should only see erp_beta
  const connsForB = await listConnections(userB.id);
  assert.equal(connsForB.length, 1);
  assert.equal(connsForB[0].slug, 'erp_beta');

  // Admin sees both
  const connsForAdmin = await listConnections('admin');
  assert.equal(connsForAdmin.length, 2);

  // 3. MCP Tools Scoping per User
  const toolsForA = await toolsList({ userId: userA.id });
  assert.ok(toolsForA.some((tool) => tool.name.includes('erp_alfa')));
  assert.ok(!toolsForA.some((tool) => tool.name.includes('erp_beta')));

  const toolsForB = await toolsList({ userId: userB.id });
  assert.ok(toolsForB.some((tool) => tool.name.includes('erp_beta')));
  assert.ok(!toolsForB.some((tool) => tool.name.includes('erp_alfa')));

  // Admin gets all tools
  const toolsForAdmin = await toolsList({ userId: null });
  assert.ok(toolsForAdmin.some((tool) => tool.name.includes('erp_alfa')));
  assert.ok(toolsForAdmin.some((tool) => tool.name.includes('erp_beta')));
});

test('Multi-Tenant: Web HTTP Flow for Register, Login, RBAC, and Admin Management', async (t) => {
  const previousDataDir = process.env.ABJ_DATA_DIR;
  const tempDir = await mkdtemp(join(tmpdir(), 'abj-multitenant-web-test-'));
  process.env.ABJ_DATA_DIR = tempDir;

  t.after(async () => {
    if (previousDataDir === undefined) delete process.env.ABJ_DATA_DIR;
    else process.env.ABJ_DATA_DIR = previousDataDir;
    await rm(tempDir, { recursive: true, force: true });
  });

  await initialize('admin123456');
  const config = await readJson('server.json');
  const app = createApp(config);

  const server = app.listen(0);
  t.after(() => server.close());
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // 1. GET /register
  const regPageRes = await fetch(`${baseUrl}/register`);
  assert.equal(regPageRes.status, 200);
  const regPageHtml = await regPageRes.text();
  assert.ok(regPageHtml.includes('Create Account'));

  // 2. POST /register (Register new user 'joko_dev')
  const regPostRes = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: baseUrl },
    body: new URLSearchParams({
      csrf: config.csrfToken,
      username: 'joko_dev',
      email: 'joko@abajoo.co.id',
      password: 'jokopassword',
      confirmPassword: 'jokopassword',
    }),
    redirect: 'manual',
  });
  assert.equal(regPostRes.status, 303);
  assert.equal(regPostRes.headers.get('location'), '/login?notice=registered');

  // Verify user and auto-created API Key exist
  const users = listUsers();
  const jokoUser = users.find((u) => u.username === 'joko_dev');
  assert.ok(jokoUser);
  assert.equal(jokoUser.role, 'user');

  const jokoKeys = listApiKeys(jokoUser.id);
  assert.equal(jokoKeys.length, 1);
  assert.ok(jokoKeys[0].name.includes('joko_dev'));

  // 3. User Login (POST /login)
  const loginRes = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: baseUrl },
    body: new URLSearchParams({
      csrf: config.csrfToken,
      username: 'joko_dev',
      password: 'jokopassword',
    }),
    redirect: 'manual',
  });
  assert.equal(loginRes.status, 303);
  const cookie = loginRes.headers.get('set-cookie');
  assert.ok(cookie);

  // 4. User tries to access /admin/users (Should be 403 Forbidden for non-admin)
  const userAccessUsersRes = await fetch(`${baseUrl}/admin/users`, {
    headers: { Cookie: cookie },
  });
  assert.equal(userAccessUsersRes.status, 403);

  // 5. Admin Login
  const adminLoginRes = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: baseUrl },
    body: new URLSearchParams({
      csrf: config.csrfToken,
      username: 'admin',
      password: 'admin123456',
    }),
    redirect: 'manual',
  });
  assert.equal(adminLoginRes.status, 303);
  const adminCookie = adminLoginRes.headers.get('set-cookie');
  assert.ok(adminCookie);

  // 6. Admin accesses /admin/users (Should be 200 OK and show joko_dev)
  const adminAccessUsersRes = await fetch(`${baseUrl}/admin/users`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminAccessUsersRes.status, 200);
  const adminUsersHtml = await adminAccessUsersRes.text();
  assert.ok(adminUsersHtml.includes('joko_dev'));
  assert.ok(adminUsersHtml.includes('joko@abajoo.co.id'));
});
