import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { initialize, readJson } from '../src/config.js';
import { createApp } from '../src/web.js';
import { createApiKey, listApiKeys, revokeApiKey, authenticateKey } from '../src/db.js';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('Landing page, Auth, Granular API Keys, and MCP Dual-Auth Lifecycle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'abj-saas-test-'));
  process.env.ABJ_DATA_DIR = directory;

  const adminPass = 'super-secret-admin-pass-2026';
  const masterToken = await initialize(adminPass);
  const config = await readJson('server.json');
  const app = createApp(config);
  const appUrl = await listen(app);

  try {
    // 1. Landing page GET / returns 200 with HTML branding
    const landing = await fetch(`${appUrl}/`);
    assert.equal(landing.status, 200);
    const landingHtml = await landing.text();
    assert.match(landingHtml, /ABJ Odoo MCP/);
    assert.match(landingHtml, /Internal Integration Architecture/);
    assert.match(landingHtml, /Tanpa Install Modul/);

    // 2. Login GET and POST flow
    const loginGet = await fetch(`${appUrl}/login`);
    assert.equal(loginGet.status, 200);
    const loginHtml = await loginGet.text();
    assert.match(loginHtml, /Sign in to your/);

    const loginPost = await fetch(`${appUrl}/login`, {
      method: 'POST',
      redirect: 'manual',
      body: new URLSearchParams({
        csrf: config.csrfToken,
        username: 'admin',
        password: adminPass,
      }),
    });
    assert.equal(loginPost.status, 303);
    const cookie = loginPost.headers.get('set-cookie').split(';')[0];
    const headers = { Cookie: cookie };

    // 3. Admin Overview Page
    const overview = await fetch(`${appUrl}/admin`, { headers });
    assert.equal(overview.status, 200);
    const overviewHtml = await overview.text();
    assert.match(overviewHtml, /Overview/);
    assert.match(overviewHtml, /Good to see you/);
    assert.match(overviewHtml, /Connections/);
    assert.match(overviewHtml, /Active API Keys/);

    // 4. API Keys Page - GET initial state
    const keysGet = await fetch(`${appUrl}/admin/keys`, { headers });
    assert.equal(keysGet.status, 200);
    const keysHtml = await keysGet.text();
    const csrfMatch = keysHtml.match(/name="csrf" value="([^"]+)"/);
    assert.ok(csrfMatch, 'CSRF token must be present');
    const adminCsrf = csrfMatch[1];

    // 5. Create new Granular API Key via admin form
    const createRes = await fetch(`${appUrl}/admin/keys/create`, {
      method: 'POST',
      headers,
      redirect: 'manual',
      body: new URLSearchParams({
        csrf: adminCsrf,
        name: 'Autonomous Agent Claude',
        scope: 'crud_read',
        rateLimit: '100',
        ipAllowlist: '',
      }),
    });
    assert.equal(createRes.status, 303);
    const redirectUrl = new URL(createRes.headers.get('location'), appUrl);
    const generatedToken = redirectUrl.searchParams.get('token');
    assert.ok(generatedToken && generatedToken.startsWith('abj_mcp_'), 'Generated token prefix should match abj_mcp_');

    // 6. Connect MCP using the newly generated Granular Token
    const client = new Client({ name: 'claude-worker', version: '2.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${appUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${generatedToken}` } },
    }));

    // List tools using the new key
    const toolList = await client.listTools();
    assert.ok(Array.isArray(toolList.tools));
    await client.close();

    // 7. Verify session and logs logged into SQLite
    const sessionsPageRes = await fetch(`${appUrl}/admin/sessions`, { headers });
    assert.equal(sessionsPageRes.status, 200);
    assert.match(await sessionsPageRes.text(), /claude-worker/);

    // 8. Revoke the API key
    const dbKeys = listApiKeys();
    const createdKeyRecord = dbKeys.find((k) => k.name === 'Autonomous Agent Claude');
    assert.ok(createdKeyRecord);

    const revokeRes = await fetch(`${appUrl}/admin/keys/revoke`, {
      method: 'POST',
      headers,
      redirect: 'manual',
      body: new URLSearchParams({
        csrf: adminCsrf,
        id: createdKeyRecord.id,
      }),
    });
    assert.equal(revokeRes.status, 303);

    // 9. Verify revoked key is immediately rejected by /mcp with 401
    const rejectedReq = await fetch(`${appUrl}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${generatedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    assert.equal(rejectedReq.status, 401);
    assert.match(await rejectedReq.text(), /Key has been revoked/);

    // 10. Filtered logs check
    const logsFiltered = await fetch(`${appUrl}/admin/logs?status=all&q=test`, { headers });
    assert.equal(logsFiltered.status, 200);
  } finally {
    await new Promise((resolve) => app.close(resolve));
  }
});
