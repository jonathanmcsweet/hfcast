/**
 * Says whether this clone can use the Playwright MCP server.
 *
 *   node tools/check-mcp.mjs                      # server and browser
 *   node tools/check-mcp.mjs http://127.0.0.1:8099  # and a running build
 *
 * The editor starts this server for you, and when it cannot, it reports
 * only that the server did not connect. That is the same message whether
 * node is missing, the browser was never downloaded, or the pinned
 * version moved. This starts the server the same way the editor does and
 * says which of those it is.
 *
 * Run it after changing the version in `.mcp.json`: a new version can
 * ask for a browser build that is not on the machine yet, and nothing
 * else reports that until someone tries to open a page.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 120_000;

/** What to open. A page built into the URL needs no server running. */
const target = process.argv[2]
  ?? 'data:text/html,<title>ok</title><h1>ok</h1>';

const say = (ok, text, fix) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
  if (!ok && fix) console.log(`      ${fix}`);
  return ok;
};

const readConfig = () => {
  const file = path.join(ROOT, '.mcp.json');
  const server = JSON.parse(readFileSync(file, 'utf8')).mcpServers?.playwright;
  if (!server?.command) {
    throw new Error('.mcp.json declares no `playwright` server');
  }
  return server;
};

/**
 * A client that speaks only the part of MCP this check needs.
 *
 * Replies arrive on stdout as one JSON object per line and in any order,
 * so each request keeps its own resolver under its id.
 */
const connect = (server) => {
  const child = spawn(server.command, server.args ?? [], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...server.env },
  });

  const pending = new Map();
  const errors = [];
  let buffer = '';

  child.on('error', (error) => errors.push(error));
  child.stderr.on('data', (data) => errors.push(new Error(String(data))));
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    // Side effects only, one line at a time, so not a `map`.
    for (const line of lines.filter((l) => l.trim())) {
      const message = JSON.parse(line);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });

  /**
   * Rejects as soon as the server is gone.
   *
   * A command that is not on the machine raises `error` and never
   * raises `exit`, so waiting for `exit` alone waits for the timeout
   * and then says the wrong thing. Both are watched. The listener that
   * collects the text is added first, so it has run by the time this
   * one reads it.
   */
  const dead = new Promise((_, reject) => {
    const fail = () =>
      reject(
        new Error(
          errors.map((e) => e.message).join('; ').trim()
            || 'the server stopped',
        ),
      );
    child.on('error', fail);
    child.on('close', fail);
  });
  // Closing the server at the end rejects this with nobody listening.
  dead.catch(() => {});

  let nextId = 1;
  const request = (method, params) =>
    Promise.race([
      new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        child.stdin.write(
          `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
        );
      }),
      dead,
    ]);

  const notify = (method) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);

  /**
   * Stops the server and lets this program end.
   *
   * The pipes are closed as well as the process. A command that never
   * started still has its three pipes, and an open pipe keeps node
   * running after the answer is printed.
   */
  const close = () => {
    child.kill();
    // Side effects on three streams, so not a `map`.
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      stream?.destroy();
    }
  };

  return { close, request, notify };
};

/**
 * The promise, or an error if it takes too long.
 *
 * The timer is always cleared. An armed timer keeps node running, so
 * leaving it set means a check that has already printed its answer sits
 * there until the limit runs out.
 */
const withTimeout = (promise, what) => {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} took longer than ${TIMEOUT_MS} ms`)),
      TIMEOUT_MS,
    );
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
};

const main = async () => {
  const server = readConfig();
  console.log(`command: ${server.command} ${(server.args ?? []).join(' ')}\n`);

  const { close, request, notify } = connect(server);

  const started = await withTimeout(
    request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'check-mcp', version: '1' },
    }),
    'starting the server',
  ).catch((error) => error);

  if (started instanceof Error) {
    close();
    say(
      false,
      `the server did not start: ${started.message.trim()}`,
      started.message.includes('ENOENT')
        ? 'node is not on PATH where the editor starts the server. Give '
          + '.mcp.json the full path to npx and a PATH in its `env`.'
        : 'run the command above by hand to see what it says.',
    );
    return 1;
  }

  notify('notifications/initialized');
  say(true, `the server started: ${started.result.serverInfo.name}`);

  const opened = await withTimeout(
    request('tools/call', {
      name: 'browser_navigate',
      arguments: { url: target },
    }),
    'opening a page',
  ).catch((error) => error);

  close();

  if (opened instanceof Error) {
    say(false, `no page opened: ${opened.message.trim()}`);
    return 1;
  }

  const text = opened.result.content.map((part) => part.text ?? '').join('\n');
  const failed = opened.result.isError || text.includes('Error:');

  if (failed) {
    const noBrowser = text.includes('not found at')
      || text.includes('playwright install');
    // The server answers in markdown. The first line is a heading that
    // only says there was an error, so take the first line under it.
    const reason = text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));

    say(
      false,
      `no page opened: ${reason ?? text}`,
      noBrowser
        ? 'the browser is missing. Run: npx playwright install chromium'
        : 'if the address is a running build, check it is still serving.',
    );
    return 1;
  }

  say(true, `a page opened: ${target}`);
  console.log('\nthis clone can use the Playwright MCP server');
  return 0;
};

process.exitCode = await main().catch((error) => {
  console.log(`FAIL  ${error.message}`);
  return 1;
});
