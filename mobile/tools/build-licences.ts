/**
 * Collects the licence texts the app is obliged to carry.
 *
 * Run by hand when a dependency that ships a licence changes:
 *
 *     node --experimental-strip-types tools/build-licences.ts
 *
 * This is a compliance requirement rather than a courtesy. The SIL Open Font
 * License, which IBM Plex is under, says the font may be redistributed "provided
 * that each copy contains the above copyright notice and this license" — so
 * shipping the font in the APK obliges the APK to carry the OFL text. Apache-2.0
 * asks the same of the app's own licence when a binary is distributed.
 *
 * Collected from the installed packages rather than pasted here, so the text
 * shipped is the text the dependency actually carries. If a package moves its
 * licence file, this fails loudly instead of shipping a stale copy.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = 'src/assets/licences.json';

interface Source {
  /** Shown as the heading. */
  readonly name: string;
  /** What it covers, in the reader's terms. */
  readonly covers: string;
  readonly path: string;
}

const SOURCES: readonly Source[] = [
  {
    name: 'Apache License 2.0',
    covers: 'HFcast itself, and the propagation engine inside it',
    path: '../LICENSE',
  },
  {
    name: 'SIL Open Font License 1.1',
    covers: 'IBM Plex Sans, the typeface',
    path: 'node_modules/@expo-google-fonts/ibm-plex-sans/LICENSE_FONT',
  },
  {
    name: 'MIT License',
    covers: 'the font packaging, and most libraries the app is built from',
    path: 'node_modules/@expo-google-fonts/ibm-plex-sans/LICENSE',
  },
];

const licences = SOURCES.map((source) => ({
  name: source.name,
  covers: source.covers,
  // Trailing whitespace only; the body is reproduced exactly, which is the
  // whole point of carrying it.
  text: readFileSync(source.path, 'utf8').trimEnd(),
}));

const json = JSON.stringify({ licences });
writeFileSync(OUT, json);

for (const licence of licences) {
  console.log(`${licence.name}: ${licence.text.split('\n').length} lines`);
}
console.log(`${OUT}: ${(json.length / 1024).toFixed(1)} KB`);
