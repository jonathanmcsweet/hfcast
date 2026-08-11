/**
 * Prints the version each named file holds, one per line, in order.
 *
 * Its own file because `AGENTS.md` says a program in another language is
 * never written inline in a shell script. It is called by
 * `tools/bump-version.sh`, which compares the lines: a `package.json`
 * keeps the version at the top level and `app.json` keeps it under
 * `expo`, and a file that holds neither prints an empty line so the
 * caller reports which one rather than reading past it.
 *
 *     node tools/read-versions.mjs mobile/package.json mobile/app.json
 */
import { readFileSync } from 'node:fs';

const versionIn = (file) => {
  const held = JSON.parse(readFileSync(file, 'utf8'));
  return held.version ?? held.expo?.version ?? '';
};

process.stdout.write(
  process.argv.slice(2).map((file) => `${versionIn(file)}\n`).join(''),
);
