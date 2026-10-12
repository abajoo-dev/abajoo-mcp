import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { encrypt } from '../src/config.js';
import { callOdoo, detectVersion } from '../src/odoo.js';
import { validateConnection } from '../src/store.js';

test('Odoo 17 and 18 use built-in RPC with login, database, and API key', async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(payload);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: payload.params.service === 'common' ? 42 : [{ name: 'A' }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const config = { encryptionKey: 'ab'.repeat(32) };
  try {
    for (const version of ['17', '18']) {
      const item = validateConnection({
        slug: `odoo_${version}`, url: `http://127.0.0.1:${server.address().port}`,
        database: 'test', login: 'service@example.com', apiKey: 'secret-key', version, models: 'res.partner',
      });
      const connection = { ...item, apiKey: encrypt(item.apiKey, config) };
      assert.deepEqual(await callOdoo(connection, config, 'res.partner', 'search_read', [[]], { fields: ['name'] }), [{ name: 'A' }]);
    }
    assert.deepEqual(requests[0].params.args.slice(0, 3), ['test', 'service@example.com', 'secret-key']);
    assert.deepEqual(requests[1].params.args.slice(0, 6), ['test', 42, 'secret-key', 'res.partner', 'search_read', [[]]]);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('non-HTTPS public URL is rejected by default', () => {
  assert.throws(() => validateConnection({ slug: 'demo', url: 'http://example.org', database: 'db', login: 'user', apiKey: 'secret', version: '19', models: 'res.partner' }), /HTTPS/);
});

test('auto-detect falls back only for a missing JSON-2 endpoint', async () => {
  const calls = [];
  const server = createServer(async (req, res) => {
    calls.push(req.url);
    if (req.url.startsWith('/json/2/')) { res.writeHead(404).end(); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    const result = payload.params.method === 'version' ? { server_version_info: [18, 0, 0] } :
      payload.params.service === 'common' ? 42 : { lang: 'en_US' };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = { encryptionKey: 'ab'.repeat(32) };
    const input = validateConnection({ slug: 'demo', url: `http://127.0.0.1:${server.address().port}`, database: 'db', login: 'user', apiKey: 'secret', version: 'auto', models: 'res.partner' });
    assert.equal(await detectVersion({ ...input, apiKey: encrypt(input.apiKey, config) }, config), '18');
    assert.deepEqual(calls, ['/json/2/res.users/context_get', '/jsonrpc', '/jsonrpc', '/jsonrpc']);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('auto-detect does not downgrade to RPC when JSON-2 rejects the API key', async () => {
  const calls = [];
  const server = createServer((req, res) => { calls.push(req.url); res.writeHead(401).end(); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = { encryptionKey: 'ab'.repeat(32) };
    const input = validateConnection({ slug: 'demo', url: `http://127.0.0.1:${server.address().port}`, database: 'db', login: 'user', apiKey: 'secret', version: 'auto', models: 'res.partner' });
    await assert.rejects(detectVersion({ ...input, apiKey: encrypt(input.apiKey, config) }, config), /HTTP 401/);
    assert.deepEqual(calls, ['/json/2/res.users/context_get']);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('limits large Odoo responses before returning data to a tool', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ rows: 'x'.repeat(2_100_000) }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = { encryptionKey: 'ab'.repeat(32) };
    const input = validateConnection({ slug: 'demo', url: `http://127.0.0.1:${server.address().port}`, database: 'db', login: 'user', apiKey: 'secret', version: '19', models: 'res.partner' });
    await assert.rejects(callOdoo({ ...input, apiKey: encrypt(input.apiKey, config) }, config, 'res.partner', 'search_read', [[]], { fields: ['name'] }), /2 MiB/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
