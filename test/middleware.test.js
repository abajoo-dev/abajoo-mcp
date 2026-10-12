import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { atomicJson, initialize, readJson } from '../src/config.js';
import { listActivity } from '../src/activity.js';
import { createApp } from '../src/web.js';
import { listConnections } from '../src/store.js';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function stop(server) {
  await new Promise((resolve) => server.close(resolve));
}

test('web setup, read-only generated tool, and authenticated MCP round trip', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'abj-mcp-'));
  process.env.ABJ_DATA_DIR = directory;
  const calls = [];
  const odoo = createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    const body = JSON.parse(Buffer.concat(parts).toString());
    calls.push({ url: req.url, body, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.endsWith('/context_get') ? { lang: 'en_US' } :
      req.url.endsWith('/fields_get') ? { name: { string: 'Name', type: 'char' }, active: { string: 'Active', type: 'boolean' } } :
      [{ id: 7, name: 'Test Partner' }]));
  });
  const odooUrl = await listen(odoo);
  const token = await initialize('correct horse battery staple');
  const config = await readJson('server.json');
  const app = createApp(config);
  const appUrl = await listen(app);
  try {
    const unauthorized = await fetch(`${appUrl}/mcp`, { method: 'POST' });
    assert.equal(unauthorized.status, 401);
    const oversized = await fetch(`${appUrl}/mcp`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: 'x'.repeat(1_048_577),
    });
    assert.equal(oversized.status, 413);
    const loginPage = await fetch(`${appUrl}/login`);
    assert.equal(loginPage.status, 200);
    assert.match(await loginPage.text(), /Sign in to your/);
    assert.equal((await fetch(`${appUrl}/admin`, { redirect: 'manual' })).status, 303);
    const signedIn = await fetch(`${appUrl}/login`, {
      method: 'POST', redirect: 'manual', body: new URLSearchParams({ csrf: config.csrfToken, username: 'admin', password: 'correct horse battery staple' }),
    });
    assert.equal(signedIn.status, 303);
    const cookie = signedIn.headers.get('set-cookie').split(';')[0];
    assert.match(signedIn.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const headers = { Cookie: cookie };
    const admin = await fetch(`${appUrl}/admin`, { headers });
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /Good to see you/);
    const connectionPage = await fetch(`${appUrl}/admin/connections`, { headers });
    const csrf = /name="csrf" value="([^"]+)"/.exec(await connectionPage.text())[1];
    assert.equal((await fetch(`${appUrl}/admin/connections`, { method: 'POST', headers, body: new URLSearchParams({ slug: 'test_odoo' }) })).status, 403);
    const form = new URLSearchParams({
      csrf, slug: 'test_odoo', url: odooUrl, database: 'test_db',
      login: 'user@example.com', apiKey: 'native-key', version: 'auto', models: 'res.partner',
    });
    const saved = await fetch(`${appUrl}/admin/connections`, {
      method: 'POST', headers, body: form, redirect: 'manual',
    });
    assert.equal(saved.status, 303, await saved.text());
    assert.equal((await listConnections()).length, 1);
    assert.equal((await listConnections())[0].version, '19');
    const duplicate = await fetch(`${appUrl}/admin/connections`, {
      method: 'POST', headers, body: form,
    });
    assert.equal(duplicate.status, 400);
    assert.equal((await listConnections()).length, 1);
    const unconfirmedDelete = await fetch(`${appUrl}/admin/delete`, {
      method: 'POST', headers, body: new URLSearchParams({ csrf, slug: 'test_odoo', confirm: 'wrong' }),
    });
    assert.equal(unconfirmedDelete.status, 400);
    const client = new Client({ name: 'test-client', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${appUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }));
    try {
      const { tools } = await client.listTools();
      assert.equal(tools.length, 2);
      assert.equal(tools[0].name, 'odoo_test_odoo_res_dpartner_search');
      assert.equal(tools[1].name, 'odoo_test_odoo_res_dpartner_describe');
      const described = await client.callTool({ name: tools[1].name, arguments: { prefix: 'na' } });
      assert.deepEqual(JSON.parse(described.content[0].text), { name: { string: 'Name', type: 'char' } });
      const result = await client.callTool({ name: tools[0].name, arguments: { fields: ['name'], limit: 2 } });
      assert.deepEqual(JSON.parse(result.content[0].text), [{ id: 7, name: 'Test Partner' }]);
      const activity = await fetch(`${appUrl}/admin/sessions`, { headers });
      assert.equal(activity.status, 200);
      assert.match(await activity.text(), /test-client/);
      const logPage = await fetch(`${appUrl}/admin/logs`, { headers });
      assert.match(await logPage.text(), /odoo_test_odoo_res_dpartner_search/);
      const persisted = await listActivity();
      assert.equal(persisted.sessions[0].client, 'test-client');
      assert.ok(persisted.logs.some((log) => log.status === 'success'));
      assert.ok(!JSON.stringify(persisted).includes('native-key'));
      assert.ok(!JSON.stringify(persisted).includes('Test Partner'));
      const searchCall = calls.find((call) => call.body.limit === 2);
      assert.equal(searchCall.body.limit, 2);
      assert.equal(searchCall.authorization, 'bearer native-key');
      assert.equal((await client.callTool({ name: tools[0].name, arguments: { fields: ['name'], limit: 1000 } })).isError, true);
    } finally { await client.close(); }
    await atomicJson('client.json', { url: `${appUrl}/mcp`, token });
    const proxyClient = new Client({ name: 'test-stdio-client', version: '1.0' });
    await proxyClient.connect(new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../bin/abj-odoo-mcp.js', import.meta.url)), 'proxy'],
      env: { ...process.env, ABJ_DATA_DIR: directory },
    }));
    try {
      const { tools } = await proxyClient.listTools();
      assert.equal(tools[0].name, 'odoo_test_odoo_res_dpartner_search');
      const result = await proxyClient.callTool({ name: tools[0].name, arguments: { fields: ['name'] } });
      assert.deepEqual(JSON.parse(result.content[0].text), [{ id: 7, name: 'Test Partner' }]);
    } finally { await proxyClient.close(); }
    const remove = await fetch(`${appUrl}/admin/delete`, {
      method: 'POST', headers, body: new URLSearchParams({ csrf, slug: 'test_odoo', confirm: 'test_odoo' }), redirect: 'manual',
    });
    assert.equal(remove.status, 303);
    assert.equal((await listConnections()).length, 0);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await fetch(`${appUrl}/login`, { method: 'POST', body: new URLSearchParams({ csrf: config.csrfToken, username: 'admin', password: 'invalid' }) })).status, 401);
    }
    assert.equal((await fetch(`${appUrl}/login`, { method: 'POST', body: new URLSearchParams({ csrf: config.csrfToken, username: 'admin', password: 'correct horse battery staple' }) })).status, 429);
  } finally {
    await stop(app);
    await stop(odoo);
    await rm(directory, { recursive: true, force: true });
  }
});

test('admin sessions enforce CSRF and revocation closes the MCP session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'abj-session-'));
  process.env.ABJ_DATA_DIR = directory;
  const token = await initialize('correct horse battery staple');
  const config = await readJson('server.json');
  const app = createApp(config);
  const appUrl = await listen(app);
  let client;
  try {
    const login = await fetch(`${appUrl}/login`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ csrf: config.csrfToken, username: 'admin', password: 'correct horse battery staple' }) });
    const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
    client = new Client({ name: 'revocation-test', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${appUrl}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    await client.listTools();
    const session = (await listActivity()).sessions[0];
    assert.equal(session.state, 'active');
    const page = await fetch(`${appUrl}/admin/sessions`, { headers });
    const formToken = /name="csrf" value="([^"]+)"/.exec(await page.text())[1];
    assert.equal((await fetch(`${appUrl}/admin/sessions/revoke`, { method: 'POST', headers, body: new URLSearchParams({ id: session.id }) })).status, 403);
    const revoked = await fetch(`${appUrl}/admin/sessions/revoke`, { method: 'POST', headers, body: new URLSearchParams({ csrf: formToken, id: session.id }), redirect: 'manual' });
    assert.equal(revoked.status, 303);
    assert.equal((await listActivity()).sessions[0].state, 'revoked');
    const after = await fetch(`${appUrl}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'mcp-session-id': session.id, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
    assert.equal(after.status, 404);
    const logout = await fetch(`${appUrl}/logout`, { method: 'POST', headers, redirect: 'manual' });
    assert.equal(logout.status, 303);
    assert.equal((await fetch(`${appUrl}/admin/sessions`, { headers, redirect: 'manual' })).status, 303);
  } finally {
    await client?.close().catch(() => {});
    await stop(app);
    await rm(directory, { recursive: true, force: true });
  }
});

test('idle MCP sessions expire and the dashboard reports the final state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'abj-expiry-'));
  process.env.ABJ_DATA_DIR = directory;
  const token = await initialize('correct horse battery staple');
  const config = await readJson('server.json');
  const app = createApp(config, { idleTimeoutMs: 40 });
  const appUrl = await listen(app);
  let client;
  try {
    const login = await fetch(`${appUrl}/login`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ csrf: config.csrfToken, username: 'admin', password: 'correct horse battery staple' }) });
    const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
    client = new Client({ name: 'expiry-test', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${appUrl}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const id = (await listActivity()).sessions[0].id;
    await new Promise((resolve) => setTimeout(resolve, 80));
    const page = await fetch(`${appUrl}/admin/sessions`, { headers });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /expired/);
    const persisted = (await listActivity()).sessions.find((session) => session.id === id);
    assert.equal(persisted.state, 'expired');
    assert.ok(persisted.endTime);
    const after = await fetch(`${appUrl}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'mcp-session-id': id, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
    assert.equal(after.status, 404);
  } finally {
    await client?.close().catch(() => {});
    await stop(app);
    await rm(directory, { recursive: true, force: true });
  }
});
