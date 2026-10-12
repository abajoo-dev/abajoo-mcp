import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const executable = fileURLToPath(new URL('../bin/abj-odoo-mcp.js', import.meta.url));

test('CLI init and serve expose health and protected admin on loopback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'abj-cli-smoke-'));
  const password = 'local-smoke-test-password-2026';
  const env = { ...process.env, ABJ_DATA_DIR: directory, ABJ_ADMIN_PASSWORD: password, ABJ_PORT: '0' };
  const init = spawnSync(process.execPath, [executable, 'init'], { env, encoding: 'utf8', timeout: 5000 });
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /MCP access token/);
  const server = spawn(process.execPath, [executable, 'serve'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('CLI server did not start')), 5000);
      server.stdout.on('data', (chunk) => {
        output += chunk.toString();
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/admin/);
        if (match) { clearTimeout(timeout); resolve(match[0]); }
      });
      server.on('error', (error) => { clearTimeout(timeout); reject(error); });
      server.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`CLI server exited ${code}`)); });
    });
    const origin = new URL(url).origin;
    assert.equal(await (await fetch(`${origin}/health`)).text(), 'ok');
    assert.equal((await fetch(url, { redirect: 'manual' })).status, 303);
    assert.equal((await fetch(`${origin}/login`)).status, 200);
    const config = JSON.parse(await (await import('node:fs/promises')).readFile(join(directory, 'server.json'), 'utf8'));
    const signedIn = await fetch(`${origin}/login`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ csrf: config.csrfToken, username: 'admin', password }) });
    assert.equal(signedIn.status, 303);
    assert.equal((await fetch(url, { headers: { Cookie: signedIn.headers.get('set-cookie').split(';')[0] } })).status, 200);
  } finally {
    server.kill();
    await new Promise((resolve) => server.once('close', resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
