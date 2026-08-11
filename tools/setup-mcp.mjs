/**
 * Makes this machine ready for the Playwright MCP server.
 *
 *   node tools/setup-mcp.mjs             # download the matching browser
 *   node tools/setup-mcp.mjs <folder>    # and declare the server there
 *
 * Two jobs, because readiness is two things.
 *
 * The browser. The server needs the exact browser build its own
 * Playwright pins, and `npx playwright install chromium` does not give
 * that: run in this repository it resolves the e2e suite's Playwright
 * and downloads that suite's build instead. The two builds are close
 * enough to confuse and not close enough to work. This installs through
 * the pinned server package, so the browser and the server can never
 * disagree.
 *
 * The folder argument. An editor finds `.mcp.json` in the folder it has
 * open, and that is not always this repository: a workspace that holds
 * several repositories side by side has its root one level up, and the
 * file committed here is then never read. Given that root folder, this
 * writes the declaration there, pointing at the launcher by its full
 * path. The file may belong to more than this project, so it is merged,
 * not replaced: only the `playwright` entry is written, every other
 * server is kept, and a file that does not parse is left alone.
 *
 * Run from a terminal, where node is on PATH like every other command
 * in this repository. The editor never runs this; it runs
 * `tools/mcp-playwright.sh`, which finds node by itself.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCHER = path.join(ROOT, 'tools', 'mcp-playwright.sh');

/** The one place the server version is pinned. */
const pinnedVersion = () => {
  const script = readFileSync(LAUNCHER, 'utf8');
  const pin = script.match(/^version=(\S+)$/m)?.[1];
  if (!pin) {
    throw new Error(`no \`version=\` line found in ${LAUNCHER}`);
  }
  return pin;
};

/**
 * Downloads the browser build the pinned server asks for.
 *
 * `npx` sits beside the node running this script, so this works even in
 * a shell whose PATH found node some other way. `-p` puts the pinned
 * server package on the path npx resolves from, which is what makes the
 * `playwright` here the server's own and not the e2e suite's.
 */
const installBrowser = (pin) => {
  const npx = path.join(path.dirname(process.execPath), 'npx');
  const command = existsSync(npx) ? npx : 'npx';

  console.log(`browser for @playwright/mcp@${pin}:`);
  // Playwright warns whenever it is run through npx rather than from a
  // project's own dependencies. Here that is the point: the pinned
  // server package is what ties the browser to the right build.
  console.log(
    '(a warning about installing dependencies first may follow; '
      + 'it does not apply here)',
  );
  const run = spawnSync(
    command,
    ['-y', '-p', `@playwright/mcp@${pin}`, 'playwright', 'install', 'chromium'],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) {
    throw new Error('the browser download failed; see above');
  }
};

/**
 * Declares the server in `<folder>/.mcp.json`, keeping what is there.
 *
 * The folder was named on the command line, which is the permission to
 * write in it. Only the `playwright` entry is this project's to change,
 * so everything else in the file is read and written back untouched. A
 * file that does not parse is somebody's work in an unknown state, and
 * the only safe thing to do with it is nothing.
 */
const declareServer = (folder) => {
  const target = path.join(path.resolve(folder), '.mcp.json');

  const current = existsSync(target)
    ? readFileSync(target, 'utf8')
    : '{}';

  const parsed = (() => {
    try {
      return JSON.parse(current);
    } catch {
      throw new Error(
        `${target} exists but is not JSON. Not touching it — repair it, then run this again.`,
      );
    }
  })();

  const merged = {
    ...parsed,
    mcpServers: {
      ...parsed.mcpServers,
      playwright: { command: LAUNCHER },
    },
  };

  writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`);

  const others = Object.keys(merged.mcpServers).filter(
    (name) => name !== 'playwright',
  );
  console.log(`declared the server in ${target}`);
  if (others.length > 0) {
    console.log(`kept as they were: ${others.join(', ')}`);
  }
};

const main = () => {
  const folder = process.argv[2];
  // The declaration first: it is quick, and a folder whose file cannot
  // be read should stop the run before the download, not after it.
  if (folder) {
    declareServer(folder);
  }
  installBrowser(pinnedVersion());
  console.log('\nto see that it works: node tools/check-mcp.mjs');
};

try {
  main();
} catch (error) {
  console.error(`setup-mcp: ${error.message}`);
  process.exitCode = 1;
}
