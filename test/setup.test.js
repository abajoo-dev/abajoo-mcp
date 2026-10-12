import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialize, readJson } from '../src/config.js';
import { createApp } from '../src/web.js';
import { setup } from '../src/cli.js';

test('local setup verifies MCP, skips an existing registration, and uses client CLIs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'abj-setup-'));
  const bin = join(directory, 'bin');
  await mkdir(bin);
  const previous = { home: process.env.HOME, data: process.env.ABJ_DATA_DIR, path: process.env.PATH, log: process.env.ABJ_TEST_LOG };
  process.env.HOME = directory;
  process.env.ABJ_DATA_DIR = join(directory, 'data');
  process.env.PATH = bin;
  process.env.ABJ_TEST_LOG = join(directory, 'commands.log');
  for (const name of ['codex', 'claude', 'agy']) {
    await writeFile(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "$ABJ_TEST_LOG"\nif [ "${name}" = codex ] && [ "$1 $2" = 'mcp get' ]; then exit 0; fi\nif [ "$1 $2" = 'mcp get' ]; then exit 1; fi\nexit 0\n`, { mode: 0o700 });
  }
  await writeFile(join(directory, '.claude.json'), JSON.stringify({ mcpServers: { 'abj-odoo-mcp': { command: 'existing' } } }));
  const token = await initialize('a strong admin test password');
  const app = createApp(await readJson('server.json'));
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  try {
    await setup({ url: `http://127.0.0.1:${app.address().port}/mcp`, token, yes: true });
    const calls = await readFile(process.env.ABJ_TEST_LOG, 'utf8');
    assert.doesNotMatch(calls, /codex mcp add/);
    assert.doesNotMatch(calls, /claude mcp add/);
    assert.match(calls, /agy mcp add abj-odoo-mcp/);
    assert.equal((await readJson('client.json')).token, token);
    if (process.platform !== 'win32') assert.equal((await stat(join(directory, 'data/client.json'))).mode & 0o077, 0);
    await rm(join(directory, '.claude.json'));
    await writeFile(join(bin, 'codex'), '#!/bin/sh\necho "codex $*" >> "$ABJ_TEST_LOG"\nif [ "$1 $2" = "mcp get" ]; then exit 1; fi\nexit 0\n', { mode: 0o700 });
    await setup({ url: `http://127.0.0.1:${app.address().port}/mcp`, token, yes: true });
    const updatedCalls = await readFile(process.env.ABJ_TEST_LOG, 'utf8');
    assert.match(updatedCalls, /codex mcp add abj-odoo-mcp --/);
    assert.match(updatedCalls, /claude mcp add --scope user abj-odoo-mcp --/);
  } finally {
    await new Promise((resolve) => app.close(resolve));
    process.env.HOME = previous.home;
    if (previous.data === undefined) delete process.env.ABJ_DATA_DIR;
    else process.env.ABJ_DATA_DIR = previous.data;
    process.env.PATH = previous.path;
    if (previous.log === undefined) delete process.env.ABJ_TEST_LOG;
    else process.env.ABJ_TEST_LOG = previous.log;
    await rm(directory, { recursive: true, force: true });
  }
});
