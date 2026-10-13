function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const date = (value) => value ? escape(new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })) : '—';
const empty = (title, detail) => `<div class="empty" style="text-align:center;padding:48px 16px;color:var(--text-dim)"><strong style="display:block;font-size:1.1rem;color:var(--text-muted);margin-bottom:6px">${escape(title)}</strong><p style="font-size:0.9rem">${escape(detail)}</p></div>`;

function layout(title, content, { active = 'overview', notice = '', error = '', tokenNotice = '', user = null } = {}) {
  const isAdmin = !user || user.role === 'admin';
  const navItems = [
    ['overview', '/admin', 'Overview', '01'],
    ['connections', '/admin/connections', 'Connections', '02'],
    ['keys', '/admin/keys', 'API Keys', '03'],
    ['sessions', '/admin/sessions', 'Sessions', '04'],
    ['logs', '/admin/logs', 'Tool logs', '05'],
  ];
  if (isAdmin) navItems.push(['users', '/admin/users', 'Users', '06']);
  const nav = navItems.map(([key, href, label, number]) =>
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
        ${user ? `<div style="font-size:0.75rem;color:var(--text-dim);margin:6px 0 4px;line-height:1.3"><strong style="color:var(--text-muted)">${escape(user.username)}</strong> <span class="badge ${user.role === 'admin' ? 'badge-warning' : 'badge-info'}" style="font-size:0.68rem;padding:1px 5px">${user.role.toUpperCase()}</span></div>` : ''}
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

<script>
  function editConnection(conn) {
    const form = document.querySelector('form[action="/admin/connections"]');
    form.querySelector('input[name="slug"]').value = conn.slug;
    form.querySelector('input[name="slug"]').readOnly = true;
    form.querySelector('input[name="url"]').value = conn.url;
    form.querySelector('input[name="database"]').value = conn.database;
    form.querySelector('select[name="version"]').value = conn.version;
    form.querySelector('input[name="canCreate"]').checked = !!conn.canCreate;
    form.querySelector('input[name="canRead"]').checked = conn.canRead !== false;
    form.querySelector('input[name="canUpdate"]').checked = !!conn.canUpdate;
    form.querySelector('input[name="canDelete"]').checked = !!conn.canDelete;
    form.querySelector('input[name="excludeAccounting"]').checked = !!conn.excludeAccounting;
    form.querySelector('input[name="excludePayroll"]').checked = !!conn.excludePayroll;
    form.querySelector('input[name="isEdit"]').value = "true";
    window.scrollTo(0, document.body.scrollHeight);
  }
</script>
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
        : `<a class="btn btn-secondary" href="/login">Sign in</a><a class="btn btn-primary" href="/register">Create Account ➔</a>`}
    </div>
  </nav>

  <header class="landing-hero">
    <div class="badge-tag">
      <span class="dot"></span> STANDALONE ODOO MCP MIDDLEWARE
    </div>
    <h1>Connect AI Agents to <span class="gradient">Any Odoo Instance</span> Without Module Installation</h1>
    <p>Eksekusi Model Context Protocol mandiri berbasis native external API Odoo v17, v18, dan v19. Zero downtime, zero addon, aman dengan allowlist model & session audit.</p>
    <div class="hero-cta">
      <a class="btn btn-primary" style="padding:12px 28px;font-size:1rem" href="/login">Masuk Control Room</a>
      <a class="btn btn-secondary" style="padding:12px 24px;font-size:1rem" href="/register">+ Create Account</a>
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

<script>
  function editConnection(conn) {
    const form = document.querySelector('form[action="/admin/connections"]');
    form.querySelector('input[name="slug"]').value = conn.slug;
    form.querySelector('input[name="slug"]').readOnly = true;
    form.querySelector('input[name="url"]').value = conn.url;
    form.querySelector('input[name="database"]').value = conn.database;
    form.querySelector('select[name="version"]').value = conn.version;
    form.querySelector('input[name="canCreate"]').checked = !!conn.canCreate;
    form.querySelector('input[name="canRead"]').checked = conn.canRead !== false;
    form.querySelector('input[name="canUpdate"]').checked = !!conn.canUpdate;
    form.querySelector('input[name="canDelete"]').checked = !!conn.canDelete;
    form.querySelector('input[name="excludeAccounting"]').checked = !!conn.excludeAccounting;
    form.querySelector('input[name="excludePayroll"]').checked = !!conn.excludePayroll;
    form.querySelector('input[name="isEdit"]').value = "true";
    window.scrollTo(0, document.body.scrollHeight);
  }
</script>
</body>
</html>`;
}

/* =========================================================================
   LOGIN PAGE
   ========================================================================= */

export function loginPage({ csrf, error = '', notice = '' }) {
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

    ${notice ? `
      <div class="alert alert-success" role="alert" style="margin-bottom:24px;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:1.1rem">✓</span>
        <span style="font-size:0.88rem;line-height:1.4">${escape(notice)}</span>
      </div>` : ''}

    ${error ? `
      <div class="alert alert-danger" role="alert" style="margin-bottom:24px;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:1.1rem">⚠</span>
        <span style="font-size:0.88rem;line-height:1.4">${escape(error)}</span>
      </div>` : ''}

    <form action="/login" method="post" autocomplete="on">
      <input type="hidden" name="isEdit" value="false">
      <input type="hidden" name="csrf" value="${escape(csrf)}">

      <div class="form-group">
        <label for="username" style="display:flex;justify-content:space-between">
          <span>Username atau Email</span>
          <small style="color:var(--tosca)">admin atau Akun Terdaftar</small>
        </label>
        <input id="username" name="username" type="text" autocomplete="username" required autofocus placeholder="admin atau nama@abajoo.co.id">
      </div>

      <div class="form-group">
        <label for="password" style="display:flex;justify-content:space-between">
          <span>Password</span>
          <small style="color:var(--text-dim)">Password Akun</small>
        </label>
        <div class="password-wrap">
          <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Masukkan password">
          <button type="button" class="password-toggle" id="pwdToggle" aria-label="Toggle password visibility" title="Lihat password">👁</button>
        </div>
      </div>

      <button class="btn btn-primary" type="submit" style="width:100%;padding:13px;margin-top:16px;font-size:0.95rem;letter-spacing:0.02em">
        Sign in ➔
      </button>
    </form>

    <div style="margin-top:20px;text-align:center">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="flex:1;height:1px;background:var(--border-subtle)"></div>
        <span style="font-size:0.75rem;color:var(--text-dim);letter-spacing:0.05em">ATAU</span>
        <div style="flex:1;height:1px;background:var(--border-subtle)"></div>
      </div>
      <a href="/register" class="btn btn-secondary" style="display:block;width:100%;padding:12px;text-align:center;text-decoration:none;font-weight:600;font-size:0.9rem">
        + Create Account (Register)
      </a>
    </div>

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;color:var(--text-dim)">
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

<script>
  function editConnection(conn) {
    const form = document.querySelector('form[action="/admin/connections"]');
    form.querySelector('input[name="slug"]').value = conn.slug;
    form.querySelector('input[name="slug"]').readOnly = true;
    form.querySelector('input[name="url"]').value = conn.url;
    form.querySelector('input[name="database"]').value = conn.database;
    form.querySelector('select[name="version"]').value = conn.version;
    form.querySelector('input[name="canCreate"]').checked = !!conn.canCreate;
    form.querySelector('input[name="canRead"]').checked = conn.canRead !== false;
    form.querySelector('input[name="canUpdate"]').checked = !!conn.canUpdate;
    form.querySelector('input[name="canDelete"]').checked = !!conn.canDelete;
    form.querySelector('input[name="excludeAccounting"]').checked = !!conn.excludeAccounting;
    form.querySelector('input[name="excludePayroll"]').checked = !!conn.excludePayroll;
    form.querySelector('input[name="isEdit"]').value = "true";
    window.scrollTo(0, document.body.scrollHeight);
  }
</script>
</body>
</html>`;
}

/* =========================================================================
   OVERVIEW PAGE
   ========================================================================= */

export function overviewPage({ connections, sessions, logs, keys = [], notice, error, user = null }) {
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
  `, { active: 'overview', notice, error, user });
}

/* =========================================================================
   CONNECTIONS PAGE
   ========================================================================= */

export function connectionsPage({ connections, csrf, notice, error, formValues = {}, user = null, users = [] }) {
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
      ${user && user.role === 'admin' ? `<td><span class="badge ${c.userId && c.userId !== 'admin' ? 'badge-info' : 'badge-warning'}">${escape(c.userId || 'admin')}</span></td>` : ''}
      <td>
        <button class="btn btn-secondary btn-sm" style="margin-bottom:10px" type="button" onclick='editConnection(${JSON.stringify(c)})'>Edit</button>
        <details>
          <summary class="btn btn-danger btn-sm" style="display:inline-block;cursor:pointer">Remove</summary>
          <form action="/admin/delete" method="post" style="margin-top:10px;background:var(--bg-input);padding:10px;border-radius:6px">
            <input type="hidden" name="isEdit" value="false">
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
        <input type="hidden" name="isEdit" value="false">
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
            <input name="database" placeholder="Kosongkan jika SaaS">
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
  `, { active: 'connections', notice, error, user });
}

/* =========================================================================
   API KEYS PAGE (NEW FEATURE)
   ========================================================================= */

export function keysPage({ keys, csrf, notice, error, tokenNotice, user = null }) {
  const rows = keys.map((k) => `
    <tr>
      <td><strong>${escape(k.name)}</strong></td>
      <td><code id="key-prefix-${k.id}">${escape(k.prefix)}…</code></td>
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
      <td style="display:flex;gap:5px">
        ${!k.revoked_at ? `
          <button class="btn btn-secondary btn-sm" type="button" onclick="revealKey('${k.id}')">Reveal</button>
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

    <div id="revealModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999;align-items:center;justify-content:center">
      <div style="background:var(--bg-card);padding:24px;border-radius:12px;max-width:400px;width:100%;box-shadow:0 10px 25px rgba(0,0,0,0.5)">
        <h3 style="margin-top:0">Reveal API Key</h3>
        <p style="font-size:0.9rem;color:var(--text-dim)">Masukkan password akun Anda untuk melihat API Key:</p>
        <form id="revealForm">
          <input type="hidden" name="csrf" value="${escape(csrf)}">
          <input type="hidden" id="revealKeyId" name="keyId">
          <input type="password" name="password" required placeholder="User password" style="width:100%;padding:10px;margin-bottom:10px;border-radius:6px;border:1px solid var(--border)">
          <button class="btn btn-primary" type="submit" style="width:100%;padding:10px">Reveal Key</button>
          <button class="btn btn-secondary" style="width:100%;margin-top:8px;padding:10px" type="button" onclick="document.getElementById('revealModal').style.display='none'">Cancel</button>
        </form>
        <div id="revealedToken" style="margin-top:15px;word-break:break-all;font-family:monospace;background:var(--bg-input);padding:10px;border-radius:6px;display:none;color:var(--tosca)"></div>
      </div>
    </div>
    <script>
      function revealKey(id) {
        document.getElementById('revealKeyId').value = id;
        document.getElementById('revealModal').style.display = 'flex';
      }
      document.getElementById('revealForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const res = await fetch('/admin/keys/reveal', { method: 'POST', body: new URLSearchParams(formData) });
        const data = await res.json();
        if (data.token) {
          document.getElementById('revealedToken').textContent = data.token;
          document.getElementById('revealedToken').style.display = 'block';
        } else {
          alert(data.error || 'Terjadi kesalahan');
        }
      });
    </script>
  `, { active: 'keys', notice, error, tokenNotice, user });
}

export function sessionsPage({ sessions, csrf, notice, error, user = null }) {
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
            <input type="hidden" name="isEdit" value="false">
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
  `, { active: 'sessions', notice, error, user });
}

/* =========================================================================
   TOOL LOGS PAGE
   ========================================================================= */

export function logsPage({ logs, sessions, currentStatus = 'all', searchQuery = '', notice, error, user = null }) {
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
  `, { active: 'logs', notice, error, user });
}

export function registerPage({ csrf, error = '', notice = '' }) {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Create Account · ABJ Odoo MCP</title>
  <link rel="stylesheet" href="/assets/admin.css">
</head>
<body class="login-body">
  <div class="login-card">
    <div class="login-header">
      <span class="mark">A</span>
      <h2>Create Account</h2>
      <p>Register to manage your isolated Odoo MCP connections</p>
    </div>

    ${notice ? `
      <div class="alert alert-success" role="alert" style="margin-bottom:24px;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:1.1rem">✓</span>
        <span style="font-size:0.88rem;line-height:1.4">${escape(notice)}</span>
      </div>` : ''}

    ${error ? `
      <div class="alert alert-danger" role="alert" style="margin-bottom:24px;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:1.1rem">⚠</span>
        <span style="font-size:0.88rem;line-height:1.4">${escape(error)}</span>
      </div>` : ''}

    <form action="/register" method="post" autocomplete="on">
      <input type="hidden" name="isEdit" value="false">
      <input type="hidden" name="csrf" value="${escape(csrf)}">

      <div class="form-group">
        <label for="username">Username</label>
        <input id="username" name="username" type="text" autocomplete="username" required autofocus placeholder="contoh: budi_dev" pattern="^[a-zA-Z0-9_.-]{3,30}$" title="Minimal 3 karakter, huruf, angka, _, ., -">
        <small style="color:var(--text-dim);font-size:0.75rem;margin-top:3px;display:block">Digunakan untuk login dan prefix API key</small>
      </div>

      <div class="form-group">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required placeholder="nama@abajoo.co.id">
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required minlength="6" placeholder="Minimal 6 karakter">
      </div>

      <div class="form-group">
        <label for="confirmPassword">Konfirmasi Password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" required minlength="6" placeholder="Ulangi password">
      </div>

      <button class="btn btn-primary" type="submit" style="width:100%;padding:13px;margin-top:16px;font-size:0.95rem;letter-spacing:0.02em">
        Create Account ➔
      </button>
    </form>

    <div style="margin-top:20px;text-align:center">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="flex:1;height:1px;background:var(--border-subtle)"></div>
        <span style="font-size:0.75rem;color:var(--text-dim);letter-spacing:0.05em">SUDAH PUNYA AKUN?</span>
        <div style="flex:1;height:1px;background:var(--border-subtle)"></div>
      </div>
      <a href="/login" class="btn btn-secondary" style="display:block;width:100%;padding:12px;text-align:center;text-decoration:none;font-weight:600;font-size:0.9rem">
        ← Sign in ke Akun
      </a>
    </div>

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;color:var(--text-dim)">
      <a href="/" style="color:var(--tosca);text-decoration:none">← Beranda</a>
      <span>Session 8 jam · AES-256</span>
    </div>
  </div>

<script>
  function editConnection(conn) {
    const form = document.querySelector('form[action="/admin/connections"]');
    form.querySelector('input[name="slug"]').value = conn.slug;
    form.querySelector('input[name="slug"]').readOnly = true;
    form.querySelector('input[name="url"]').value = conn.url;
    form.querySelector('input[name="database"]').value = conn.database;
    form.querySelector('select[name="version"]').value = conn.version;
    form.querySelector('input[name="canCreate"]').checked = !!conn.canCreate;
    form.querySelector('input[name="canRead"]').checked = conn.canRead !== false;
    form.querySelector('input[name="canUpdate"]').checked = !!conn.canUpdate;
    form.querySelector('input[name="canDelete"]').checked = !!conn.canDelete;
    form.querySelector('input[name="excludeAccounting"]').checked = !!conn.excludeAccounting;
    form.querySelector('input[name="excludePayroll"]').checked = !!conn.excludePayroll;
    form.querySelector('input[name="isEdit"]').value = "true";
    window.scrollTo(0, document.body.scrollHeight);
  }
</script>
</body>
</html>`;
}

export function usersPage({ users = [], csrf, notice = '', error = '', user = null }) {
  const rows = users.map((u) => `
    <tr>
      <td><strong>${escape(u.username)}</strong></td>
      <td>${escape(u.email)}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-warning' : 'badge-info'}">${escape(u.role)}</span></td>
      <td><span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">${escape(u.status)}</span></td>
      <td>${date(u.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <!-- Reset Password -->
          <details>
            <summary class="btn btn-secondary btn-sm" style="display:inline-block;cursor:pointer;list-style:none">Reset PW</summary>
            <form action="/admin/users/reset-password" method="post" style="margin-top:8px;background:var(--bg-input);padding:10px;border-radius:6px;min-width:220px">
              <input type="hidden" name="isEdit" value="false">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
              <input type="hidden" name="userId" value="${escape(u.id)}">
              <div class="form-group" style="margin-bottom:8px">
                <label style="font-size:0.75rem">Password baru</label>
                <input name="password" type="password" minlength="6" required placeholder="Min 6 karakter" style="margin-top:4px">
              </div>
              <button class="btn btn-primary btn-sm" type="submit" style="width:100%">Reset Password</button>
            </form>
          </details>
          <!-- Edit User -->
          <details>
            <summary class="btn btn-secondary btn-sm" style="display:inline-block;cursor:pointer;list-style:none">Edit</summary>
            <form action="/admin/users/update" method="post" style="margin-top:8px;background:var(--bg-input);padding:10px;border-radius:6px;min-width:220px">
              <input type="hidden" name="isEdit" value="false">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
              <input type="hidden" name="userId" value="${escape(u.id)}">
              <div class="form-group" style="margin-bottom:8px">
                <label style="font-size:0.75rem">Email</label>
                <input name="email" type="email" value="${escape(u.email)}" required style="margin-top:4px">
              </div>
              <div class="form-group" style="margin-bottom:8px">
                <label style="font-size:0.75rem">Role</label>
                <select name="role" style="margin-top:4px;width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main)">
                  <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom:8px">
                <label style="font-size:0.75rem">Status</label>
                <select name="status" style="margin-top:4px;width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main)">
                  <option value="active" ${u.status === 'active' ? 'selected' : ''}>active</option>
                  <option value="disabled" ${u.status === 'disabled' ? 'selected' : ''}>disabled</option>
                </select>
              </div>
              <button class="btn btn-primary btn-sm" type="submit" style="width:100%">Update User</button>
            </form>
          </details>
          <!-- Delete User -->
          <details>
            <summary class="btn btn-danger btn-sm" style="display:inline-block;cursor:pointer;list-style:none">Delete</summary>
            <form action="/admin/users/delete" method="post" style="margin-top:8px;background:var(--bg-input);padding:10px;border-radius:6px;min-width:220px">
              <input type="hidden" name="isEdit" value="false">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
              <input type="hidden" name="userId" value="${escape(u.id)}">
              <p style="font-size:0.82rem;margin:0 0 8px;color:var(--danger)">Yakin hapus user <strong>${escape(u.username)}</strong>? Koneksi milik user ini tidak ikut terhapus.</p>
              <button class="btn btn-danger btn-sm" type="submit" style="width:100%">Hapus Permanen</button>
            </form>
          </details>
        </div>
      </td>
    </tr>`).join('');

  return layout('Users', `
    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h2 style="margin:0 0 2px">Registered Users</h2>
          <small style="color:var(--text-dim)">${users.length} akun terdaftar</small>
        </div>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto">
        ${users.length === 0 ? empty('Belum ada user', 'User yang register via /register akan muncul di sini.') : `
        <table class="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th style="min-width:200px">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`}
      </div>
    </div>
  `, { active: 'users', notice, error, user });
}
