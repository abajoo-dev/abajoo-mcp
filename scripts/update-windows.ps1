# Manual, backup-first Abajoo MCP updater for Windows PowerShell.
# No automatic installation, server restart, or credential reset.
$ErrorActionPreference = 'Stop'
$state = Join-Path $env:USERPROFILE '.abj-odoo-mcp'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$listener = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  throw "Port 8090 is in use. Stop Abajoo MCP with Ctrl+C, then rerun. No update applied."
}
if (Test-Path $state) {
  $backup = Join-Path $env:USERPROFILE ("abj-mcp-backup-" + $stamp)
  Copy-Item -LiteralPath $state -Destination $backup -Recurse -ErrorAction Stop
  Write-Host "Configuration backed up to $backup"
}
& npm.cmd install -g "git+https://github.com/abajoo-dev/abajoo-mcp.git#main"
if ($LASTEXITCODE -ne 0) { throw "npm installation failed. Configuration backup is intact." }
Write-Host "Updated. Start with: abj-odoo-mcp.cmd serve"
Write-Host "Admin: http://127.0.0.1:8090/admin/keys"
