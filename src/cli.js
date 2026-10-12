import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { atomicJson, initialize, readJson } from './config.js';
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
          process.exitCode = 130;
          process.stdout.write('\n');
          resolve('');
          return;
        } else value += char;
      }
    };
    process.stdin.on('data', handle);
  });
}

function upstream(settings) {
  return new StreamableHTTPClientTransport(new URL(settings.url), {
    requestInit: { headers: { Authorization: `Bearer ${settings.token}` }, redirect: 'error' },
  });
}

async function connectRemote(settings) {
  const client = new Client({ name: 'abj-odoo-mcp-local', version: '0.1.0' });
  await client.connect(upstream(settings));
  return client;
}

function commandFound(command) {
  return spawnSync(command, ['--version'], { stdio: 'ignore', timeout: 4000 }).status === 0;
}

function existing(command, args) {
  return spawnSync(command, args, { stdio: 'ignore', timeout: 5000 }).status === 0;
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

export async function setup({ url, token, yes = false } = {}) {
  const endpoint = url || await ask('Middleware MCP URL (https://.../mcp): ');
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))) {
    throw new Error('Remote MCP URL must use HTTPS; HTTP is allowed only on loopback');
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
  console.log('Restart your MCP clients to refresh tools. Existing MCP registrations were not replaced.');
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

export async function main(args = process.argv.slice(2)) {
  switch (args[0]) {
    case 'init': {
      const password = process.env.ABJ_ADMIN_PASSWORD || await secret('New admin password (min. 6 characters): ');
      const token = await initialize(password);
      console.log(`MCP access token (save it now; shown only once): ${token}`);
      console.log('Start server: abj-odoo-mcp serve');
      break;
    }
    case 'serve': await startServer(); break;
    case 'setup': await setup({ url: args[1], yes: args.includes('--yes') }); break;
    case 'proxy': await proxy(); break;
    default: console.log('Usage: abj-odoo-mcp init | serve | setup [MCP_URL] [--yes] | proxy');
  }
}
