# Odoo addon → standalone middleware

The Odoo 17/18/19 `abj_odoo_mcp` addons are the reference for this migration. Target Odoo instances require only native external APIs (17/18 RPC, 19 JSON-2) and standard user API keys; no MCP addon is installed in Odoo.

| Addon feature | Middleware status | Boundary |
| --- | --- | --- |
| Admin menus: Sessions, Tool Logs, API Keys, Configuration | Implemented via Web Control Room (`/`, `/login`, `/admin/*`) | Multi-section UI: Overview, Connections, API Keys, Sessions, Tool Logs |
| MCP sessions: client, transport, IP, state, timestamps, revoke/close, call count | Implemented in SQLite (`sessions` table) | Stateful Streamable HTTP sessions, idle timeout, real-time revocation |
| Tool logs: status, time, duration, input inspection | Implemented in SQLite (`tool_logs` table) | Input parameters inspected with sensitive key redaction (`token`, `password`, `key`); status & search filters |
| Granular API Keys: scope, rate-limit, IP allowlist, expiry | Implemented (`api_keys` table) | Dual-auth on `/mcp`: Master token OR per-agent `abj_mcp_*` keys with scoped permissions (`crud_read`, `config_read`, etc.) |
| Tools: `search_read`, `fields_get` | Implemented as generated `search`/`describe` | Read-only, model allowlist, native API-user access rules |
| System tools: `sys_info`, `installed_modules` | Implemented for system-scoped keys | Native RPC without server addons |

## Granular CRUD & Module Exclusion Controls
- **Create**: Izin tool `create` untuk membuat record baru.
- **Read**: Izin tool `search` & `describe` untuk membaca data.
- **Update**: Izin tool `update` untuk mengubah record via `write`.
- **Delete**: Izin tool `delete` untuk menghapus record via `unlink`.
- **Accounting (Exclude)**: Blokir model `account.*` (jurnal, invoice, payment, CoA).
- **Payroll (Exclude)**: Blokir model `hr.payslip*`, `hr.payroll*`, `hr.salary*`, `hr.contract*` (gaji, slip, kontrak).
