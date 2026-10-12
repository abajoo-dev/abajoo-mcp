function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const date = (value) => value ? escape(new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })) : '—';
const empty = (title, detail) => `<div class="empty" style="text-align:center;padding:48px 16px;color:var(--text-dim)"><strong style="display:block;font-size:1.1rem;color:var(--text-muted);margin-bottom:6px">${escape(title)}</strong><p style="font-size:0.9rem">${escape(detail)}</p></div>`;

function layout(title, content, { active = 'overview', notice = '', error = '', tokenNotice = '' } = {}) {
  const nav = [
    ['overview', '/admin', 'Overview', '01'],
    ['connections', '/admin/connections', 'Connections', '02'],
    ['keys', '/admin/keys', 'API Keys', '03'],
    ['sessions', '/admin/sessions', 'Sessions', '04'],
    ['logs', '/admin/logs', 'Tool logs', '05'],
  ].map(([key, href, label, number]) =>
    `<a class="nav-item ${active === key ? 'active' : ''}" href="${href}"><span>${label}</span><small>${number}</small></a>`
  ).join('');

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} · ABJ Odoo MCP</title>
  <link rel="stylesheet" href="/assets/admin.css">
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="sidebar-brand" href="/">
        <span class="mark">A</span>
        <div class="sidebar-brand-title">
          <strong>ABJ Odoo MCP</strong>
          <small>INTERNAL GATEWAY</small>
        </div>
      </a>
      <nav class="sidebar-menu" aria-label="Navigasi Utama">
        ${nav}
      </nav>
      <div class="sidebar-footer">
        <span class="status-indicator"><span class="badge badge-success" style="padding:2px 6px">ONLINE</span> v0.2</span>
        <form action="/logout" method="post" style="display:inline">
          <button class="btn btn-secondary btn-sm" type="submit">Sign out</button>
        </form>
      </div>
    </aside>

    <main class="main-content">
      <div class="top-bar">
        <div>
          <span style="font-size:0.75rem;font-weight:700;color:var(--tosca);letter-spacing:0.08em;text-transform:uppercase">WORKSPACE / ${escape(title)}</span>
          <h1 style="margin-top:4px">${escape(title)}</h1>
        </div>
        <div>
          <a href="/" target="_blank" class="btn btn-secondary btn-sm" style="margin-right:8px">View Homepage ↗</a>
          <span class="badge badge-info">127.0.0.1:8090</span>
        </div>
      </div>

      ${notice ? `<div class="alert alert-success" role="status">✓ ${escape(notice)}</div>` : ''}
      ${error ? `<div class="alert alert-danger" role="alert">⚠ ${escape(error)}</div>` : ''}
      ${tokenNotice ? `<div class="alert-token"><strong>Simpan API Key ini sekarang. Token hanya ditampilkan satu kali!</strong><code>${escape(tokenNotice)}</code></div>` : ''}

      ${content}
    </main>
  </div>
</body>
</html>`;
}

/* =========================================================================
   PUBLIC HOMEPAGE (LANDING PAGE)
   ========================================================================= */

export function landingPage({ isLoggedIn = false } = {}) {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ABJ Odoo MCP · Enterprise Model Context Protocol Gateway</title>
  <link rel="stylesheet" href="/assets/admin.css">
</head>
<body class="landing-body">
  <nav class="landing-nav">
    <a class="landing-brand" href="/">
      <span class="mark">A</span>
      <span>ABJ Odoo MCP</span>
    </a>
    <div class="nav-actions">
      ${isLoggedIn
        ? `<a class="btn btn-primary" href="/admin">Open Dashboard ➔</a>`
        : `<a class="btn btn-secondary" href="/login">Sign in</a><a class="btn btn-primary" href="/admin">Dashboard ➔</a>`}
    </div>
  </nav>

  <header class="landing-hero">
    <div class="badge-tag">
      <span class="dot"></span> STANDALONE ODOO MCP MIDDLEWARE
    </div>
    <h1>Connect AI Agents to <span class="gradient">Any Odoo Instance</span> Without Module Installation</h1>
    <p>Eksekusi Model Context Protocol mandiri berbasis native external API Odoo v17, v18, dan v19. Zero downtime, zero addon, aman dengan allowlist model & session audit.</p>
    <div class="hero-cta">
      <a class="btn btn-primary" style="padding:12px 28px;font-size:1rem" href="/admin">Masuk Control Room</a>
      <a class="btn btn-secondary" style="padding:12px 24px;font-size:1rem" href="#architecture">Lihat Arsitektur</a>
    </div>
  </header>

  <section class="arch-card" id="architecture">
    <div class="arch-card-head">
      <div>
        <h3 style="font-size:1.1rem;font-weight:700">Internal Integration Architecture</h3>
        <p style="font-size:0.85rem;color:var(--text-muted)">Bagaimana AI client mengakses Odoo melalui ABJ Odoo MCP Gateway</p>
      </div>
      <span class="badge badge-info">Zero Addon Required</span>
    </div>

    <div class="arch-flow">
      <div class="arch-node">
        <h4>AI Clients</h4>
        <p>Codex, Claude Desktop, Antigravity, Cursor, Terminal CLI</p>
      </div>
      <div class="arch-arrow">➔</div>
      <div class="arch-node highlight">
        <h4 style="color:var(--orange)">ABJ Odoo MCP Gateway</h4>
        <p>Authentication, Rate Limiter, Model Guardrails, Session Audit, Multi-Instance Router</p>
      </div>
      <div class="arch-arrow">➔</div>
      <div class="arch-node">
        <h4>Target Odoo</h4>
        <p>Odoo v17 / v18 (JSON-RPC) &amp; v19 (JSON-2 API), SaaS / On-Premise</p>
      </div>
    </div>
  </section>

  <section class="features-grid">
    <div class="feature-box">
      <div class="feature-icon">⚡</div>
      <h3>Tanpa Install Modul</h3>
      <p>Tidak perlu pasang addon abj_odoo_mcp, tanpa perlu restart server Odoo atau upgrade database tiap rilis versi baru.</p>
    </div>
    <div class="feature-box">
      <div class="feature-icon">🛡️</div>
      <h3>Model Allowlisting</h3>
      <p>Hanya model yang didaftarkan eksplisit (misal <code>res.partner</code>, <code>product.template</code>) yang bisa diakses AI.</p>
    </div>
    <div class="feature-box">
      <div class="feature-icon">🔑</div>
      <h3>Granular API Keys</h3>
      <p>Buat token terpisah per agen AI dengan pembatasan scope, rate-limit per menit, dan IP allowlist.</p>
    </div>
    <div class="feature-box">
      <div class="feature-icon">📊</div>
      <h3>Audit Trail &amp; Sessions</h3>
      <p>Pantau live MCP sessions, catat durasi tool execution, dan inspeksi riwayat pemanggilan dengan payload rahasia disamarkan.</p>
    </div>
    <div class="feature-box">
      <div class="feature-icon">🌐</div>
      <h3>Multi-Instance Support</h3>
      <p>Hubungkan banyak database Odoo sekaligus (staging, production, internal) dalam satu gateway terpadu.</p>
    </div>
    <div class="feature-box">
      <div class="feature-icon">💻</div>
      <h3>CLI Onboarding Cepat</h3>
      <p>Daftarkan MCP secara instan ke local environment Codex / Claude Code cukup dengan perintah CLI.</p>
    </div>
  </section>

  <footer style="text-align:center;padding:40px 24px;border-top:1px solid var(--border-subtle);color:var(--text-dim);font-size:0.85rem">
    PT Abajoo Transformasi Teknologi · Internal Tooling Platform · Model Context Protocol Gateway
  </footer>
</body>
</html>`;
}

/* =========================================================================
   LOGIN PAGE
   ========================================================================= */

export function loginPage({ csrf, error = '' }) {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in · ABJ Odoo MCP</title>
  <link rel="stylesheet" href="/assets/admin.css">
</head>
<body class="login-body">
  <div class="login-card">
    <div class="login-header">
      <span class="mark">A</span>
      <h2>ABJ Odoo MCP</h2>
      <p>Sign in to your internal integration control room</p>
    </div>

    ${error ? `
      <div class="alert alert-danger" role="alert" style="margin-bottom:24px;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:1.1rem">⚠</span>
        <span style="font-size:0.88rem;line-height:1.4">${escape(error)}</span>
      </div>` : ''}

    <form action="/login" method="post" autocomplete="on">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
      
      <div class="form-group">
        <label for="username" style="display:flex;justify-content:space-between">
          <span>Username</span>
          <small style="color:var(--tosca)">Default: admin</small>
        </label>
        <input id="username" name="username" type="text" value="admin" autocomplete="username" required placeholder="admin">
      </div>

      <div class="form-group">
        <label for="password" style="display:flex;justify-content:space-between">
          <span>Password</span>
          <small style="color:var(--text-dim)">Master Password</small>
        </label>
        <div class="password-wrap">
          <input id="password" name="password" type="password" autocomplete="current-password" required autofocus placeholder="Masukkan master password">
          <button type="button" class="password-toggle" id="pwdToggle" aria-label="Toggle password visibility" title="Lihat password">👁</button>
        </div>
      </div>

      <button class="btn btn-primary" type="submit" style="width:100%;padding:13px;margin-top:16px;font-size:0.95rem;letter-spacing:0.02em">
        Sign in ➔
      </button>
    </form>

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;color:var(--text-dim)">
      <a href="/" style="color:var(--tosca);text-decoration:none">← Beranda</a>
      <span>Session 8 jam · AES-256</span>
    </div>
  </div>

  <script>
    (function() {
      const toggle = document.getElementById("pwdToggle");
      const input = document.getElementById("password");
      if (toggle && input) {
        toggle.addEventListener("click", function() {
          const isPassword = input.type === "password";
          input.type = isPassword ? "text" : "password";
          toggle.textContent = isPassword ? "🙈" : "👁";
        });
      }
    })();
  </script>
</body>
</html>`;
}

/* =========================================================================
   OVERVIEW PAGE
   ========================================================================= */

export function overviewPage({ connections, sessions, logs, keys = [], notice, error }) {
  const activeSessions = sessions.filter((s) => s.state === 'active').length;
  const activeKeys = keys.filter((k) => !k.revoked_at).length;
  const totalCalls = logs.length;
  const errorCalls = logs.filter((l) => l.status !== 'success').length;

  const rows = connections.slice(0, 5).map((c) => `
    <tr>
      <td><strong>${escape(c.slug)}</strong></td>
      <td>${escape(c.url)}</td>
      <td>${escape(c.database)}</td>
      <td><span class="badge badge-info">v${escape(c.version)}</span></td>
      <td><span class="badge badge-success">Configured</span></td>
    </tr>
  `).join('');

  const recentLogs = logs.slice(0, 5).map((l) => `
    <tr>
      <td>${date(l.calledAt)}</td>
      <td><code>${escape(l.toolName)}</code></td>
      <td><span class="badge ${l.status === 'success' ? 'badge-success' : 'badge-danger'}">${escape(l.status)}</span></td>
      <td style="font-family:var(--font-mono)">${l.durationMs} ms</td>
    </tr>
  `).join('');

  return layout('Overview', `
    <div class="metrics-row">
      <div class="metric-card">
        <div class="title">Connections</div>
        <div class="val">${connections.length}</div>
        <div class="desc">Instance Odoo terhubung</div>
      </div>
      <div class="metric-card">
        <div class="title">Active Sessions</div>
        <div class="val" style="color:var(--tosca)">${activeSessions}</div>
        <div class="desc">Sesi client MCP live</div>
      </div>
      <div class="metric-card">
        <div class="title">Active API Keys</div>
        <div class="val" style="color:var(--orange)">${activeKeys}</div>
        <div class="desc">Kunci akses agen aktif</div>
      </div>
      <div class="metric-card">
        <div class="title">Tool Executions</div>
        <div class="val">${totalCalls}</div>
        <div class="desc">${errorCalls} error tercatat</div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <h2 class="card-title">Odoo Connections</h2>
          <p class="card-desc">Good to see you. Instance yang terdaftar sebagai sumber data MCP</p>
        </div>
        <a href="/admin/connections" class="btn btn-primary btn-sm">+ Add Connection</a>
      </div>
      ${rows ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>NAME</th><th>URL</th><th>DATABASE</th><th>VERSION</th><th>STATUS</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : empty('Belum ada koneksi', 'Tambahkan koneksi Odoo pertama melalui menu Connections.')}
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <h2 class="card-title">Recent Tool Activity</h2>
          <p class="card-desc">Audit pemanggilan tool terbaru oleh client AI</p>
        </div>
        <a href="/admin/logs" class="btn btn-secondary btn-sm">View All Logs ➔</a>
      </div>
      ${recentLogs ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>CALLED AT</th><th>TOOL</th><th>STATUS</th><th>DURATION</th></tr>
            </thead>
            <tbody>${recentLogs}</tbody>
          </table>
        </div>` : empty('Belum ada aktivitas', 'Log pemanggilan tool akan muncul di sini setelah AI client mulai memanggil tools.')}
    </div>
  `, { active: 'overview', notice, error });
}

/* =========================================================================
   CONNECTIONS PAGE
   ========================================================================= */

export function connectionsPage({ connections, csrf, notice, error, formValues = {} }) {
  const rows = connections.map((c) => `
    <tr>
      <td><strong>${escape(c.slug)}</strong></td>
      <td>${escape(c.url)}</td>
      <td>${escape(c.database)}</td>
      <td><span class="badge badge-info">v${escape(c.version)}</span></td>
      <td>
        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
          <span class="badge ${c.canCreate ? 'badge-success' : 'badge-muted'}" style="font-size:0.75rem;padding:2px 7px" title="Create">Create</span>
          <span class="badge ${c.canRead !== false ? 'badge-success' : 'badge-muted'}" style="font-size:0.75rem;padding:2px 7px" title="Read">Read</span>
          <span class="badge ${c.canUpdate ? 'badge-success' : 'badge-muted'}" style="font-size:0.75rem;padding:2px 7px" title="Update">Update</span>
          <span class="badge ${c.canDelete ? 'badge-danger' : 'badge-muted'}" style="font-size:0.75rem;padding:2px 7px" title="Delete">Delete</span>
          ${c.excludeAccounting ? '<span class="badge badge-warning" style="font-size:0.75rem;padding:2px 7px">No Accounting</span>' : ''}
          ${c.excludePayroll ? '<span class="badge badge-warning" style="font-size:0.75rem;padding:2px 7px">No Payroll</span>' : ''}
        </div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px">${c.models.length} core models terdaftar</div>
      </td>
      <td>
        <details>
          <summary class="btn btn-danger btn-sm" style="display:inline-block;cursor:pointer">Remove</summary>
          <form action="/admin/delete" method="post" style="margin-top:10px;background:var(--bg-input);padding:10px;border-radius:6px">
            <input type="hidden" name="csrf" value="${escape(csrf)}">
            <input type="hidden" name="slug" value="${escape(c.slug)}">
            <label style="font-size:0.75rem;display:block;margin-bottom:4px">Ketik slug "<strong>${escape(c.slug)}</strong>" untuk konfirmasi:</label>
            <input name="confirm" required style="padding:6px;font-size:0.8rem;margin-bottom:8px">
            <button class="btn btn-danger btn-sm" type="submit">Hapus Permanen</button>
          </form>
        </details>
      </td>
    </tr>
  `).join('');

  return layout('Connections', `
    <div class="card">
      <h2 class="card-title">Connected Odoo Instances</h2>
      <p class="card-desc">Daftar koneksi Odoo aktif. Kredensial API key disimpan terenkripsi secara lokal.</p>
      ${rows ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>SLUG</th><th>URL</th><th>DATABASE</th><th>VERSION</th><th>OPERASI &amp; PROTEKSI</th><th>ACTION</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : empty('No connections configured', 'Gunakan form di bawah untuk mendaftarkan instance Odoo pertama.')}
    </div>

    <div class="card">
      <h2 class="card-title">Connect New Odoo Instance</h2>
      <p class="card-desc">Koneksi akan dites (probe/authentication) terlebih dahulu sebelum disimpan.</p>

      <form action="/admin/connections" method="post">
        <input type="hidden" name="csrf" value="${escape(csrf)}">
        <div class="form-grid">
          <div class="form-group">
            <label>Connection Slug</label>
            <input name="slug" pattern="[a-z][a-z0-9_]{1,30}" required placeholder="tambak_staging">
            <small>Karakter lowercase, angka, dan underscore.</small>
          </div>
          <div class="form-group">
            <label>Odoo URL</label>
            <input name="url" type="url" required placeholder="https://myodoo.example.com">
            <small>Gunakan HTTPS untuk koneksi publik.</small>
          </div>
          <div class="form-group">
            <label>Database Name</label>
            <input name="database" required placeholder="odoo_production">
          </div>
          <div class="form-group">
            <label>User Login / Email</label>
            <input name="login" required placeholder="user@example.com">
          </div>
          <div class="form-group">
            <label>Odoo API Key</label>
            <input name="apiKey" type="password" autocomplete="off" required placeholder="Bawaan Odoo Preferences → Security">
            <small>Dibuat di Odoo: My Profile &gt; Account Security &gt; New API Key.</small>
          </div>
          <div class="form-group">
            <label>Odoo Version</label>
            <select name="version">
              <option value="auto">Auto Detect</option>
              <option value="19">Odoo 19 (JSON-2 API)</option>
              <option value="18">Odoo 18 (JSON-RPC)</option>
              <option value="17">Odoo 17 (JSON-RPC)</option>
              <option value="16">Odoo 16 (JSON-RPC)</option>
              <option value="15">Odoo 15 (JSON-RPC)</option>
              <option value="14">Odoo 14 (JSON-RPC)</option>
            </select>
          </div>
        </div>



        <div style="background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:12px;padding:20px;margin:20px 0">
          <input type="hidden" name="_has_crud" value="1">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <span style="font-size:0.9rem;font-weight:700;color:var(--text-main);display:flex;align-items:center;gap:8px">
              <span style="color:var(--orange)">🛡</span> Operasi CRUD &amp; Proteksi Modul (6 Kebijakan)
            </span>
            <small style="color:var(--text-dim);font-size:0.75rem">Terapkan prinsip Least Privilege</small>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:14px">
            <!-- 1. CREATE -->
            <label style="display:flex;gap:12px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px;padding:12px 14px;cursor:pointer">
              <input id="canCreate" name="canCreate" type="checkbox" value="1" style="width:18px;height:18px;accent-color:var(--orange);margin-top:2px">
              <div>
                <strong style="display:block;font-size:0.88rem;color:var(--text-main)">Create</strong>
                <small style="display:block;color:var(--text-muted);font-size:0.75rem;margin-top:2px">Izin membuat record baru (<code>create</code>).</small>
              </div>
            </label>

            <!-- 2. READ -->
            <label style="display:flex;gap:12px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px;padding:12px 14px;cursor:pointer">
              <input id="canRead" name="canRead" type="checkbox" value="1" checked style="width:18px;height:18px;accent-color:var(--tosca);margin-top:2px">
              <div>
                <strong style="display:block;font-size:0.88rem;color:var(--text-main)">Read</strong>
                <small style="display:block;color:var(--text-muted);font-size:0.75rem;margin-top:2px">Izin membaca &amp; mencari data (<code>search</code>, <code>describe</code>).</small>
              </div>
            </label>

            <!-- 3. UPDATE -->
            <label style="display:flex;gap:12px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px;padding:12px 14px;cursor:pointer">
              <input id="canUpdate" name="canUpdate" type="checkbox" value="1" style="width:18px;height:18px;accent-color:var(--orange);margin-top:2px">
              <div>
                <strong style="display:block;font-size:0.88rem;color:var(--text-main)">Update</strong>
                <small style="display:block;color:var(--text-muted);font-size:0.75rem;margin-top:2px">Izin mengubah record data (<code>write</code>).</small>
              </div>
            </label>

            <!-- 4. DELETE -->
            <label style="display:flex;gap:12px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px;padding:12px 14px;cursor:pointer">
              <input id="canDelete" name="canDelete" type="checkbox" value="1" style="width:18px;height:18px;accent-color:var(--danger);margin-top:2px">
              <div>
                <strong style="display:block;font-size:0.88rem;color:var(--text-main)">Delete</strong>
                <small style="display:block;color:var(--text-muted);font-size:0.75rem;margin-top:2px">Izin menghapus record data (<code>unlink</code>).</small>
              </div>
            </label>

            <!-- 5. ACCOUNTING (EXCLUDE) -->
            <label style="display:flex;gap:12px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px;padding:12px 14px;cursor:pointer">
              <input id="excludeAccounting" name="excludeAccounting" type="checkbox" value="1" checked style="width:18px;height:18px;accent-color:var(--danger);margin-top:2px">
              <div>
                <strong style="display:block;font-size:0.88rem;color:var(--text-main)">Accounting (Exclude)</strong>
                <small style="display:block;color:var(--text-muted);font-size:0.75rem;margin-top:2px">Blokir modul Accounting (<code>account.*</code>). Akses ditolak.</small>
              </div>
            </label>

            <!-- 6. PAYROLL (EXCLUDE) -->
            <label style="display:flex;gap:12px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px;padding:12px 14px;cursor:pointer">
              <input id="excludePayroll" name="excludePayroll" type="checkbox" value="1" checked style="width:18px;height:18px;accent-color:var(--danger);margin-top:2px">
              <div>
                <strong style="display:block;font-size:0.88rem;color:var(--text-main)">Payroll (Exclude)</strong>
                <small style="display:block;color:var(--text-muted);font-size:0.75rem;margin-top:2px">Blokir modul Payroll &amp; Gaji (<code>hr.payslip*</code>, <code>hr.contract*</code>). Akses ditolak.</small>
              </div>
            </label>
          </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:20px;margin:16px 0">
          <div class="checkbox-group" style="margin:0">
            <input id="replace" name="replace" type="checkbox" value="1">
            <label for="replace" style="font-size:0.85rem">Timpa jika slug koneksi sudah ada sebelumnya</label>
          </div>
          <div class="checkbox-group" style="margin:0">
            <input id="allowSelfSigned" name="allowSelfSigned" type="checkbox" value="1">
            <label for="allowSelfSigned" style="font-size:0.85rem">Abaikan validasi sertifikat SSL (untuk HTTPS self-signed / staging)</label>
          </div>
        </div>

        <button class="btn btn-primary" type="submit">Test &amp; Save Connection ➔</button>
      </form>
    </div>
  `, { active: 'connections', notice, error });
}

/* =========================================================================
   API KEYS PAGE (NEW FEATURE)
   ========================================================================= */

export function keysPage({ keys, csrf, notice, error, tokenNotice }) {
  const rows = keys.map((k) => `
    <tr>
      <td><strong>${escape(k.name)}</strong></td>
      <td><code>${escape(k.prefix)}…</code></td>
      <td><span class="badge ${k.scope === 'admin' ? 'badge-warning' : 'badge-info'}">${escape(k.scope)}</span></td>
      <td>${k.rate_limit ? `${k.rate_limit}/min` : '∞'}</td>
      <td>${k.ip_allowlist ? escape(k.ip_allowlist) : '<span style="color:var(--text-dim)">Any</span>'}</td>
      <td>${date(k.last_used_at)}</td>
      <td>
        ${k.revoked_at
          ? `<span class="badge badge-danger">Revoked</span>`
          : (k.expires_at && new Date(k.expires_at).getTime() < Date.now())
            ? `<span class="badge badge-muted">Expired</span>`
            : `<span class="badge badge-success">Active</span>`}
      </td>
      <td>
        ${!k.revoked_at ? `
          <form action="/admin/keys/revoke" method="post" style="display:inline">
            <input type="hidden" name="csrf" value="${escape(csrf)}">
            <input type="hidden" name="id" value="${escape(k.id)}">
            <button class="btn btn-danger btn-sm" type="submit">Revoke</button>
          </form>` : '—'}
      </td>
    </tr>
  `).join('');

  return layout('API Keys', `
    <div class="card">
      <h2 class="card-title">Granular MCP API Keys</h2>
      <p class="card-desc">Kunci akses khusus untuk agen atau aplikasi klien. Token hanya disimpan dalam bentuk SHA-256 hash.</p>
      ${rows ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>NAME</th><th>PREFIX</th><th>SCOPE</th><th>RATE LIMIT</th><th>IP ALLOWLIST</th><th>LAST USED</th><th>STATUS</th><th>ACTION</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : empty('Belum ada API Key', 'Buat API key baru untuk agen AI Anda menggunakan form di bawah.')}
    </div>

    <div class="card">
      <h2 class="card-title">Generate New API Key</h2>
      <p class="card-desc">Token unik berformat <code>abj_mcp_...</code> akan dibuat secara kriptografis.</p>

      <form action="/admin/keys/create" method="post">
        <input type="hidden" name="csrf" value="${escape(csrf)}">
        <div class="form-grid">
          <div class="form-group">
            <label>Key Name / Client Label</label>
            <input name="name" required placeholder="Claude Desktop Staging">
          </div>
          <div class="form-group">
            <label>Permission Scope</label>
            <select name="scope">
              <option value="crud_read">crud_read (Search &amp; Describe Models)</option>
              <option value="config_read">config_read (+ System Info &amp; Module List)</option>
              <option value="anomaly_read">anomaly_read (+ Data Anomaly Scanner)</option>
              <option value="admin">admin (Full Access)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Rate Limit (Requests / Minute)</label>
            <input name="rateLimit" type="number" min="5" max="600" value="60">
          </div>
          <div class="form-group">
            <label>IP Allowlist (Optional)</label>
            <input name="ipAllowlist" placeholder="192.168.1.50, 10.0.0.12">
            <small>Pisahkan dengan koma. Kosongkan untuk mengizinkan semua IP.</small>
          </div>
          <div class="form-group">
            <label>Expiration Date (Optional)</label>
            <input name="expiresAt" type="date">
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Generate API Key ➔</button>
      </form>
    </div>
  `, { active: 'keys', notice, error, tokenNotice });
}

/* =========================================================================
   SESSIONS PAGE
   ========================================================================= */

export function sessionsPage({ sessions, csrf, notice, error }) {
  const rows = sessions.map((s) => `
    <tr>
      <td>
        <strong>${escape(s.client || s.client_name || 'unknown')}</strong>
        <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-dim)">${escape(s.id.slice(0, 13))}…</div>
      </td>
      <td>${escape(s.apiKeyName || s.api_key_name || 'Master Token')}</td>
      <td><code>${escape(s.remoteIp || s.remote_ip || 'unknown')}</code></td>
      <td>
        <span class="badge ${s.state === 'active' ? 'badge-success' : s.state === 'revoked' ? 'badge-danger' : 'badge-muted'}">
          ${escape(s.state)}
        </span>
      </td>
      <td>${date(s.startTime || s.started_at)}</td>
      <td>${date(s.endTime || s.lastActivity || s.last_activity_at)}</td>
      <td style="font-family:var(--font-mono);font-weight:700">${s.toolCallCount ?? s.tool_call_count ?? 0}</td>
      <td>
        ${s.state === 'active' ? `
          <form action="/admin/sessions/revoke" method="post" style="display:inline">
            <input type="hidden" name="csrf" value="${escape(csrf)}">
            <input type="hidden" name="id" value="${escape(s.id)}">
            <button class="btn btn-danger btn-sm" type="submit">Revoke</button>
          </form>` : '—'}
      </td>
    </tr>
  `).join('');

  return layout('Sessions', `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <h2 class="card-title">Live &amp; Historical MCP Sessions</h2>
          <p class="card-desc">Sesi koneksi transport HTTP streamable aktif dari AI clients.</p>
        </div>
        <span class="badge badge-info">${sessions.filter((s) => s.state === 'active').length} ACTIVE SESSIONS</span>
      </div>

      ${rows ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>CLIENT / SESSION ID</th><th>KEY</th><th>REMOTE IP</th><th>STATE</th><th>STARTED</th><th>LAST ACTIVITY</th><th>CALLS</th><th>ACTION</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : empty('Belum ada sesi tercatat', 'Sesi akan tercatat ketika AI client melakukan handshaking MCP ke /mcp.')}
    </div>
  `, { active: 'sessions', notice, error });
}

/* =========================================================================
   TOOL LOGS PAGE
   ========================================================================= */

export function logsPage({ logs, sessions, currentStatus = 'all', searchQuery = '', notice, error }) {
  const rows = logs.map((l) => `
    <tr>
      <td style="white-space:nowrap">${date(l.calledAt || l.called_at)}</td>
      <td>
        <code style="color:var(--tosca);font-weight:600">${escape(l.toolName || l.tool_name)}</code>
        ${l.params_json ? `
          <details class="log-detail">
            <summary>Inspect Input</summary>
            <pre>${escape(l.params_json)}</pre>
          </details>` : ''}
      </td>
      <td>${escape(l.clientName || l.apiKeyName || 'Standard Client')}</td>
      <td>
        <span class="badge ${l.status === 'success' ? 'badge-success' : 'badge-danger'}">
          ${escape(l.status)}
        </span>
        ${l.error_message ? `<div style="font-size:0.75rem;color:#F87171;margin-top:4px">${escape(l.error_message)}</div>` : ''}
      </td>
      <td style="font-family:var(--font-mono);font-weight:600">${l.durationMs ?? l.duration_ms ?? 0} ms</td>
    </tr>
  `).join('');

  return layout('Tool logs', `
    <div class="card">
      <div class="filter-bar">
        <div>
          <h2 class="card-title">Audit Trail &amp; Tool Logs</h2>
          <p class="card-desc">Catatan eksekusi tool MCP oleh client. Kredensial dan data sensitif disamarkan otomatis.</p>
        </div>

        <form method="get" action="/admin/logs" class="filter-group">
          <select name="status" onchange="this.form.submit()" style="width:auto;padding:6px 12px">
            <option value="all" ${currentStatus === 'all' ? 'selected' : ''}>All Status</option>
            <option value="success" ${currentStatus === 'success' ? 'selected' : ''}>Success Only</option>
            <option value="error" ${currentStatus === 'error' ? 'selected' : ''}>Errors Only</option>
          </select>
          <input name="q" value="${escape(searchQuery)}" placeholder="Search tool name..." style="width:180px;padding:6px 12px">
          <button class="btn btn-secondary btn-sm" type="submit">Filter</button>
        </form>
      </div>

      ${rows ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>CALLED AT</th><th>TOOL &amp; PARAMS</th><th>CLIENT / KEY</th><th>STATUS</th><th>DURATION</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : empty('Belum ada log sesuai filter', 'Log pemanggilan tool akan muncul di sini.')}
    </div>
  `, { active: 'logs', notice, error });
}
