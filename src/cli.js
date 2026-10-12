import { spawnSync, spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { atomicJson, initialize, readJson, dataDir } from './config.js';
import { startServer } from './web.js';

const executable = fileURLToPath(new URL('../bin/abj-odoo-mcp.js', import.meta.url));
const connectionName = 'abj-odoo-mcp';

async function ask(question) {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await readline.question(question)).trim(); }
  finally { readline.close(); }
}

async function secret(question) {
  if (!process.stdin.isTTY) throw new Error('Interactive terminal required (or supply token via ABJ_MCP_TOKEN)');
  process.stdout.write(question);
  return new Promise((resolve) => {
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const handle = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === '\r' || char === '\n') {
          process.stdin.off('data', handle);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f') value = value.slice(0, -1);
        else if (char === '\u0003') {
          process.stdin.off('data', handle);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          process.exit(1);
        } else value += char;
      }
    };
    process.stdin.on('data', handle);
  });
}

async function connectRemote(settings) {
  const client = new Client({ name: connectionName, version: '0.1.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(settings.url), {
    requestInit: { headers: { Authorization: `Bearer ${settings.token}` } },
  });
  await client.connect(transport);
  return client;
}

function commandFound(command) {
  return spawnSync(command, ['--version'], { stdio: 'ignore', timeout: 4000 }).status === 0;
}

function existing(command, args) {
  return spawnSync(command, args, { stdio: 'ignore', timeout: 5000 }).status === 0;
}

// Attempt to register Claude Desktop (direct JSON edit)
async function registerClaudeDesktop() {
  const configPaths = [
    join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), // macOS
    join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'), // Windows
    join(homedir(), '.config', 'Claude', 'claude_desktop_config.json'), // Linux
  ];
  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue;
    let config = {};
    try { config = JSON.parse(await readFile(configPath, 'utf8')); } catch { config = {}; }
    if (config?.mcpServers?.[connectionName]) return { name: 'Claude Desktop', skipped: true };
    config.mcpServers = config.mcpServers || {};
    config.mcpServers[connectionName] = {
      command: process.execPath,
      args: [executable, 'proxy'],
    };
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    return { name: 'Claude Desktop', configPath };
  }
  return null;
}

// Attempt to register Cursor (direct JSON edit)
async function registerCursor() {
  const configPaths = [
    join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
    join(homedir(), '.cursor', 'mcp.json'),
    join(homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
  ];
  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue;
    let config = {};
    try { config = JSON.parse(await readFile(configPath, 'utf8')); } catch { config = {}; }
    if (config?.mcpServers?.[connectionName]) return { name: 'Cursor', skipped: true };
    config.mcpServers = config.mcpServers || {};
    config.mcpServers[connectionName] = {
      command: process.execPath,
      args: [executable, 'proxy'],
    };
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    return { name: 'Cursor', configPath };
  }
  return null;
}

async function installedClients() {
  const found = [];
  if (commandFound('codex') && !existing('codex', ['mcp', 'get', connectionName])) found.push({ name: 'Codex', command: 'codex', args: ['mcp', 'add', connectionName, '--', process.execPath, executable, 'proxy'] });
  if (commandFound('claude')) {
    let config = null;
    try { config = JSON.parse(await readFile(join(homedir(), '.claude.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!config?.mcpServers?.[connectionName] && !existing('claude', ['mcp', 'get', connectionName])) {
      found.push({ name: 'Claude Code', command: 'claude', args: ['mcp', 'add', '--scope', 'user', connectionName, '--', process.execPath, executable, 'proxy'] });
    }
  }
  if (commandFound('agy')) {
    let config = null;
    try { config = JSON.parse(await readFile(join(homedir(), '.gemini/config/mcp_config.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!config?.mcpServers?.[connectionName]) found.push({ name: 'Antigravity CLI', command: 'agy', args: ['mcp', 'add', connectionName, process.execPath, executable, 'proxy'] });
  }
  return found;
}

function isPrivateHost(hostname) {
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  return false;
}

export async function setup({ url, token, yes = false } = {}) {
  const endpoint = url || await ask('Middleware MCP URL (https://.../mcp): ');
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isPrivateHost(parsed.hostname))) {
    throw new Error('Remote MCP URL must use HTTPS (HTTP is allowed only on loopback, LAN, or Tailscale)');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || !parsed.pathname.endsWith('/mcp')) throw new Error('URL must end with /mcp and contain no credentials, query, or fragment');
  const accessToken = token || process.env.ABJ_MCP_TOKEN || await secret('MCP access token (hidden): ');
  if (!accessToken) throw new Error('Token required');
  const settings = { url: parsed.href, token: accessToken };
  const client = await connectRemote(settings);
  try {
    const result = await client.listTools();
    console.log(`MCP connection OK; ${result.tools.length} tools currently available.`);
  } finally { await client.close(); }
  const clients = await installedClients();
  console.log(`Will register ${connectionName} in: ${clients.map((entry) => entry.name).join(', ') || '(none found or already configured)'}`);
  if (clients.length && !yes && (await ask('Proceed? [y/N] ')).toLowerCase() !== 'y') return;
  await atomicJson('client.json', settings);
  for (const entry of clients) {
    const result = spawnSync(entry.command, entry.args, { encoding: 'utf8', timeout: 15000 });
    if (result.status === 0) console.log(`Registered: ${entry.name}`);
    else console.error(`${entry.name} registration failed: ${result.stderr?.trim() || result.error?.message || 'unknown error'}`);
  }
  // also attempt direct JSON config clients
  const desktop = await registerClaudeDesktop();
  if (desktop && !desktop.skipped) console.log(`Registered: ${desktop.name} (${desktop.configPath})`);
  const cursor = await registerCursor();
  if (cursor && !cursor.skipped) console.log(`Registered: ${cursor.name} (${cursor.configPath})`);
  console.log('Restart your MCP clients to refresh tools. Existing MCP registrations were not replaced.');
}

// Create and load macOS LaunchAgent for local daemon mode
async function daemonStart() {
  if (platform() !== 'darwin') {
    throw new Error('--daemon is only supported on macOS. On Linux/Windows, run: abj-odoo-mcp serve');
  }
  const label = 'com.abajoo.odoo-mcp';
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const logDir = dataDir();
  await mkdir(logDir, { recursive: true, mode: 0o700 });
  const port = process.env.ABJ_PORT || '8090';
  const host = process.env.ABJ_HOST || '127.0.0.1';
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${executable}</string>
        <string>serve</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${join(executable, '..', '..')}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>ABJ_DATA_DIR</key>
        <string>${logDir}</string>
        <key>ABJ_HOST</key>
        <string>${host}</string>
        <key>ABJ_PORT</key>
        <string>${port}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>Umask</key>
    <integer>63</integer>
    <key>StandardOutPath</key>
    <string>${join(logDir, 'launchd.stdout.log')}</string>
    <key>StandardErrorPath</key>
    <string>${join(logDir, 'launchd.stderr.log')}</string>
</dict>
</plist>
`;
  await writeFile(plistPath, plist, 'utf8');
  // Unload first if already loaded (ignore errors)
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' });
  const result = spawnSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new Error(`launchctl bootstrap failed: ${result.stderr?.trim() || 'unknown'}`);
  console.log(`Daemon started (LaunchAgent: ${label})`);
  console.log(`Web UI: http://${host}:${port}`);
  console.log(`MCP : http://${host}:${port}/mcp`);
  return `http://${host}:${port}/mcp`;
}

async function daemonStop() {
  if (platform() !== 'darwin') {
    console.log('Stop command only works on macOS. Kill the process manually on other platforms.');
    return;
  }
  const label = 'com.abajoo.odoo-mcp';
  const result = spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${label}`], { encoding: 'utf8', timeout: 10000 });
  if (result.status === 0) console.log('Daemon stopped.');
  else console.error(`Stop failed: ${result.stderr?.trim() || 'already stopped'}`);
}

// quickstart: init (if needed) + daemon + register clients
export async function quickstart({ yes = false } = {}) {
  const port = process.env.ABJ_PORT || '8090';
  const host = process.env.ABJ_HOST || '127.0.0.1';
  const mcpUrl = `http://${host}:${port}/mcp`;

  // 1. Init if no data yet
  const settings = await readJson('client.json');
  let token = settings?.token;
  if (!token) {
    console.log('\n=== ABJ Odoo MCP — First-time Setup ===\n');
    const password = process.env.ABJ_ADMIN_PASSWORD || await secret('Set admin password (min. 6 chars, hidden): ');
    token = await initialize(password);
    console.log(`\n✓ Admin password set.`);
    console.log(`✓ Master MCP Token: ${token}`);
    console.log('  (Save this token; it will not be shown again)\n');
  } else {
    console.log('Existing configuration found — skipping init.');
    token = settings.token;
  }

  // 2. Start daemon (macOS) or advise manual serve
  if (platform() === 'darwin') {
    await daemonStart();
    // Wait up to 5s for server to be ready
    for (let i = 0; i < 10; i++) {
      try {
        const r = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(500) });
        if (r.ok) break;
      } catch { /* not ready yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
  } else {
    console.log(`\nRun this in a separate terminal to start the server:`);
    console.log(`  abj-odoo-mcp serve`);
    console.log('Then re-run quickstart or run: abj-odoo-mcp setup\n');
  }

  // 3. Register proxy mode with all MCP clients
  const newSettings = { url: mcpUrl, token };
  await atomicJson('client.json', newSettings);

  const clients = await installedClients();
  if (clients.length) {
    console.log(`\nRegistering with: ${clients.map((e) => e.name).join(', ')}`);
    for (const entry of clients) {
      const result = spawnSync(entry.command, entry.args, { encoding: 'utf8', timeout: 15000 });
      if (result.status === 0) console.log(`  ✓ ${entry.name}`);
      else console.error(`  ✗ ${entry.name}: ${result.stderr?.trim() || 'unknown error'}`);
    }
  }

  const desktop = await registerClaudeDesktop();
  if (desktop && !desktop.skipped) console.log(`  ✓ Claude Desktop`);
  const cursor = await registerCursor();
  if (cursor && !cursor.skipped) console.log(`  ✓ Cursor`);

  console.log('\n=== Setup Complete ===');
  console.log(`Web UI : http://${host}:${port}`);
  console.log(`MCP URL: ${mcpUrl}`);
  console.log(`Token  : ${token}`);
  console.log('\nRestart your MCP clients (Claude Desktop, Codex, etc.) to apply changes.');
}

export async function proxy() {
  const settings = await readJson('client.json');
  if (!settings) throw new Error('Run abj-odoo-mcp setup first');
  const remote = await connectRemote(settings);
  const server = new Server({ name: connectionName, version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => remote.listTools());
  server.setRequestHandler(CallToolRequestSchema, async (request) => remote.callTool(request.params));
  try { await server.connect(new StdioServerTransport()); }
  catch (error) { await remote.close(); throw error; }
}

export async function main() {
  const args = process.argv.slice(2);
  switch (args[0]) {
    case 'init': {
      const password = process.env.ABJ_ADMIN_PASSWORD || await secret('New admin password (min. 6 characters): ');
      const token = await initialize(password);
      console.log(`MCP access token (save it now; shown only once): ${token}`);
      console.log('Start server: abj-odoo-mcp serve');
      break;
    }
    case 'serve': await startServer(); break;
    case 'start':
    case 'quickstart': await quickstart({ yes: args.includes('--yes') }); break;
    case 'setup': await setup({ url: args[1], yes: args.includes('--yes') }); break;
    case 'stop': await daemonStop(); break;
    case 'proxy': await proxy(); break;
    default:
      console.log('ABJ Odoo MCP — Standalone MCP middleware for Odoo\n');
      console.log('Commands:');
      console.log('  quickstart         First-time setup: init + daemon + register MCP clients');
      console.log('  serve              Start the HTTP server (foreground)');
      console.log('  stop               Stop the background daemon (macOS)');
      console.log('  init               Initialize data store and generate master token');
      console.log('  setup [URL]        Connect this device to a remote ABJ MCP server');
      console.log('  proxy              Stdio-to-HTTP proxy (used by MCP clients)');
      console.log('\nQuickstart on a new device:');
      console.log('  npm install -g github:abajoo-dev/abajoo-mcp');
      console.log('  abj-odoo-mcp quickstart');
  }
}
