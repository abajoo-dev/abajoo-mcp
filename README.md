# ABJ Odoo MCP Middleware

Middleware penghubung Odoo ke berbagai AI Agent (Claude Code, Antigravity, dll).

## 👷‍♂️ Untuk Admin (Setup Server)
1. **Instalasi**: Pastikan Node.js terinstall.
2. **Setup**: Jalankan `abj-odoo-mcp init` untuk setup awal.
3. **Running**: Jalankan `abj-odoo-mcp serve`. Pastikan port 8090 terbuka.
4. **Maintenance**: Login via browser di `admin/` untuk mengelola user dan koneksi.

## 🚀 Untuk User (Menghubungkan AI)
Jika Anda ingin menghubungkan laptop Anda ke server middleware internal Abajoo:

1. **Install CLI**:
   `npm install -g git+https://github.com/abajoo-dev/abajoo-mcp.git`

2. **Setup Koneksi**:
   Jalankan perintah ini dan masukkan URL server (misal: `http://192.168.100.230:8090`) dan **API Key** pribadi Anda:
   `abj-odoo-mcp setup`

3. **Gunakan di AI Agent**:
   Daftarkan server ke Claude Desktop atau tooling lainnya lewat config file (baca dokumentasi CLI setelah setup).

**Masalah Kredensial?** Jika Odoo SaaS memberikan error 401, pastikan email Anda benar dan API Key baru di-copy tanpa spasi di browser Odoo Anda.
