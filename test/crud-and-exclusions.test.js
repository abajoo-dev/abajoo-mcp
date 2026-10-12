import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { validateConnection, saveConnection, listConnections } from '../src/store.js';
import { toolsList, callTool } from '../src/tools.js';
import { initialize, readJson, encrypt } from '../src/config.js';
import { createApp } from '../src/web.js';

test('CRUD checkboxes and Accounting/Payroll exclusion policies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'abj-crud-test-'));
  process.env.ABJ_DATA_DIR = directory;
  const config = { encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' };

  // 1. Validation denies accounting model when excludeAccounting is true
  assert.throws(() => {
    validateConnection({
      slug: 'test_conn',
      url: 'https://odoo.example.com',
      database: 'db',
      login: 'admin',
      apiKey: 'key',
      version: '19',
      models: 'res.partner, account.move',
      excludeAccounting: true,
    });
  }, /Akses ditolak.*Accounting/);

  // 2. Validation denies payroll model when excludePayroll is true
  assert.throws(() => {
    validateConnection({
      slug: 'test_conn',
      url: 'https://odoo.example.com',
      database: 'db',
      login: 'admin',
      apiKey: 'key',
      version: '19',
      models: 'res.partner, hr.payslip',
      excludePayroll: true,
    });
  }, /Akses ditolak.*Payroll/);

  // 3. Save connection with full CRUD enabled and exclusions on
  await saveConnection({
    slug: 'erp_main',
    url: 'https://odoo.example.com',
    database: 'db',
    login: 'admin',
    apiKey: 'key',
    version: '19',
    models: 'res.partner',
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
    excludeAccounting: true,
    excludePayroll: true,
  }, config);

  const tools = await toolsList();
  const toolNames = tools.map((t) => t.name);

  // Verify all 4 CRUD tool types are exposed
  assert.ok(toolNames.includes('odoo_erp_main_res_dpartner_search'));
  assert.ok(toolNames.includes('odoo_erp_main_res_dpartner_describe'));
  assert.ok(toolNames.includes('odoo_erp_main_res_dpartner_create'));
  assert.ok(toolNames.includes('odoo_erp_main_res_dpartner_update'));
  assert.ok(toolNames.includes('odoo_erp_main_res_dpartner_delete'));

  // 4. Save connection with ONLY Read (Create, Update, Delete disabled)
  await saveConnection({
    slug: 'erp_readonly',
    url: 'https://odoo.example.com',
    database: 'db',
    login: 'admin',
    apiKey: 'key',
    version: '19',
    models: 'product.template',
    canCreate: false,
    canRead: true,
    canUpdate: false,
    canDelete: false,
  }, config);

  const roTools = (await toolsList()).filter((t) => t.name.includes('erp_readonly'));
  assert.equal(roTools.length, 2); // only search and describe
  assert.ok(!roTools.some((t) => t.name.includes('create')));
  assert.ok(!roTools.some((t) => t.name.includes('delete')));

  // 5. Test runtime tool call enforcement
  const deniedCreate = await callTool('odoo_erp_readonly_product_dtemplate_create', { values: { name: 'Test' } }, config);
  assert.equal(deniedCreate.isError, true);
  assert.match(deniedCreate.content[0].text, /Akses ditolak: Operasi Create tidak diizinkan/);

  const deniedDelete = await callTool('odoo_erp_readonly_product_dtemplate_delete', { ids: [1] }, config);
  assert.equal(deniedDelete.isError, true);
  assert.match(deniedDelete.content[0].text, /Akses ditolak: Operasi Delete tidak diizinkan/);
});

test('Web admin form parses all 6 checkboxes and persists permissions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'abj-web-crud-'));
  process.env.ABJ_DATA_DIR = directory;
  await initialize('test-long-master-password-2026');
  const serverConfig = await readJson('server.json');
  const app = createApp(serverConfig);
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const appUrl = `http://127.0.0.1:${app.address().port}`;

  try {
    // Login
    const loginRes = await fetch(`${appUrl}/login`, {
      method: 'POST',
      redirect: 'manual',
      body: new URLSearchParams({
        csrf: serverConfig.csrfToken,
        username: 'admin',
        password: 'test-long-master-password-2026',
      }),
    });
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];
    const headers = { Cookie: cookie };

    // Get CSRF
    const connPage = await fetch(`${appUrl}/admin/connections`, { headers });
    const csrf = /name="csrf" value="([^"]+)"/.exec(await connPage.text())[1];

    // Attempt to submit connection with forbidden accounting model while excludeAccounting is checked
    const forbiddenSubmit = await fetch(`${appUrl}/admin/connections`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        csrf,
        slug: 'forbidden_acc',
        url: 'https://odoo.example.com',
        database: 'db',
        login: 'admin',
        apiKey: 'key',
        version: '19',
        models: 'account.move',
        _has_crud: '1',
        excludeAccounting: '1',
      }),
    });
    assert.equal(forbiddenSubmit.status, 400);
    const errHtml = await forbiddenSubmit.text();
    assert.match(errHtml, /Akses ditolak.*Accounting/);
  } finally {
    await new Promise((resolve) => app.close(resolve));
  }
});

test('Connection creation without explicit models uses core models and formats network errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'abj-auto-models-'));
  process.env.ABJ_DATA_DIR = directory;
  const config = { encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' };

  // Omit models
  const conn = validateConnection({
    slug: 'auto_odoo',
    url: 'https://odoo.example.com',
    database: 'db',
    login: 'admin',
    apiKey: 'key',
    version: '19',
    excludeAccounting: true,
  });

  assert.ok(conn.models.length > 5);
  assert.ok(conn.models.includes('res.partner'));
  assert.ok(!conn.models.includes('account.move')); // auto-excluded
});
