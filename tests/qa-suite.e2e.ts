import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('ABJ Odoo MCP - End to End Quality Assurance Suite', { serial: true }, () => {
  test('1. Landing page renders branding, hero, and navigation', async ({ app, screen, browser }) => {
    await app.open('/');
    await expect(browser).toHaveURL('/');

    await expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(screen.getByText('STANDALONE ODOO MCP MIDDLEWARE')).toBeVisible();
    await expect(screen.getByText('Tanpa Install Modul')).toBeVisible();

    const loginLink = screen.getByRole('link', 'Sign in');
    await expect(loginLink).toBeVisible();
    await loginLink.tap();
    await expect(browser).toHaveURL('/login');
  });

  test('2. Login page functions, password toggle, and authentication to dashboard', async ({ app, screen, browser }) => {
    await app.open('/login');
    await expect(browser).toHaveURL('/login');

    await expect(screen.getByText('ABJ Odoo MCP')).toBeVisible();
    await expect(screen.getByText('Sign in to your internal integration control room')).toBeVisible();

    const pwdInput = screen.getByPlaceholder('Masukkan master password');
    await expect(pwdInput).toBeVisible();
    await pwdInput.fill('123456');

    const submitBtn = screen.getByRole('button', 'Sign in ➔');
    await expect(submitBtn).toBeVisible();
    await submitBtn.tap();

    await expect(browser).toHaveURL('/admin');
    await expect(screen.getByRole('heading', { level: 1 })).toContainText('Overview');
  });

  test('3. Overview dashboard displays metrics and navigation shell', async ({ app, screen, browser }) => {
    await app.open('/admin');
    await expect(browser).toHaveURL('/admin');

    await expect(screen.getByText('Instance Odoo terhubung')).toBeVisible();
    await expect(screen.getByText('Active Sessions')).toBeVisible();
    await expect(screen.getByText('Active API Keys')).toBeVisible();
    await expect(screen.getByText('Tool Executions')).toBeVisible();

    await expect(screen.getByRole('link', /Overview/)).toBeVisible();
    await expect(screen.getByRole('link', /Connections/)).toBeVisible();
    await expect(screen.getByRole('link', /API Keys/)).toBeVisible();
    await expect(screen.getByRole('link', /Sessions/)).toBeVisible();
    await expect(screen.getByRole('link', /Tool logs/)).toBeVisible();
  });

  test('4. Connections page: absence of Allowlisted Models & presence of 6 policy controls', async ({ app, screen, browser }) => {
    await app.open('/admin/connections');
    await expect(browser).toHaveURL('/admin/connections');

    await expect(screen.getByText('Allowlisted Models (Comma-separated)')).toBeHidden();

    await expect(screen.getByRole('checkbox', /Create/)).toBeVisible();
    await expect(screen.getByRole('checkbox', /Read/)).toBeVisible();
    await expect(screen.getByRole('checkbox', /Update/)).toBeVisible();
    await expect(screen.getByRole('checkbox', /Delete/)).toBeVisible();
    await expect(screen.getByRole('checkbox', /Accounting/)).toBeVisible();
    await expect(screen.getByRole('checkbox', /Payroll/)).toBeVisible();

    await expect(screen.getByRole('checkbox', /Read/)).toBeChecked();
    await expect(screen.getByRole('checkbox', /Accounting/)).toBeChecked();
    await expect(screen.getByRole('checkbox', /Payroll/)).toBeChecked();

    await expect(screen.getByRole('checkbox', /Abaikan validasi/)).toBeVisible();
    await expect(screen.getByRole('button', 'Test & Save Connection ➔')).toBeVisible();
  });

  test('5. API Keys page: create, display token, and revoke key lifecycle', async ({ app, screen, browser }) => {
    await app.open('/admin/keys');
    await expect(browser).toHaveURL('/admin/keys');

    const testKeyName = `QA-${Date.now().toString(36)}`;
    const nameInput = screen.getByPlaceholder('Claude Desktop Staging');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(testKeyName);

    const generateBtn = screen.getByRole('button', 'Generate API Key ➔');
    await expect(generateBtn).toBeVisible();
    await generateBtn.tap();

    await expect(browser).toHaveURL(/\/admin\/keys/);
    await expect(screen.getByText('Simpan API Key ini sekarang', { exact: false })).toBeVisible();

    const createdRow = screen.getByRole('row', new RegExp(testKeyName));
    await expect(createdRow).toBeVisible();

    const revokeBtn = createdRow.getByRole('button', 'Revoke');
    await expect(revokeBtn).toBeVisible();
    await revokeBtn.tap();

    await expect(screen.getByText('API Key revoked.', { exact: false })).toBeVisible();
    const revokedRow = screen.getByRole('row', new RegExp(testKeyName));
    await expect(revokedRow.getByText('Revoked')).toBeVisible();
  });

  test('6. Audit monitoring pages: Sessions and Tool Logs', async ({ app, screen, browser }) => {
    await app.open('/admin/sessions');
    await expect(browser).toHaveURL('/admin/sessions');
    await expect(screen.getByRole('heading', { level: 1 })).toHaveText('Sessions');
    await expect(screen.getByText('Live & Historical MCP Sessions')).toBeVisible();

    await app.open('/admin/logs');
    await expect(browser).toHaveURL('/admin/logs');
    await expect(screen.getByRole('heading', { level: 1 })).toHaveText('Tool logs');
    await expect(screen.getByText('Audit Trail & Tool Logs')).toBeVisible();
    await expect(screen.getByRole('button', 'Filter')).toBeVisible();
  });
});
