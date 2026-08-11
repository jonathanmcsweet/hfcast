/**
 * Writes a version, and where there is one a `versionCode`, into each
 * named file.
 *
 * Called by `tools/bump-version.sh`, which takes `VERSION` and `CODE`
 * from the environment so neither ends up inside a shell quote.
 *
 *     VERSION=0.58.2 CODE=58021 node tools/write-version.mjs \
 *       mobile/package.json mobile/app.json
 *
 * A file that does not change is an error rather than a file left alone.
 * The whole point of this script is that every file moves together, so
 * one that did not match is a file whose shape has changed, and carrying
 * on would leave the versions disagreeing.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const { VERSION, CODE } = process.env;
if (!VERSION || !CODE) {
  console.error('VERSION and CODE must both be set');
  process.exit(1);
}

// Edited as text rather than through `JSON.parse` and `stringify`: these
// files are formatted by dprint, and rewriting them from the object would
// reflow every line.
const rewrite = (text) =>
  text
    .replace(/("version": )"[0-9]+\.[0-9]+\.[0-9]+"/, `$1"${VERSION}"`)
    .replace(/("versionCode": )[0-9]+/, `$1${CODE}`);

const failed = process.argv.slice(2).filter((file) => {
  const text = readFileSync(file, 'utf8');
  const out = rewrite(text);
  if (out === text) {
    console.error(
      `nothing changed in ${file} — its shape is not what this expects`,
    );
    return true;
  }
  writeFileSync(file, out);
  console.log(`${file}: ${VERSION}`);
  return false;
});

if (failed.length > 0) process.exit(1);
