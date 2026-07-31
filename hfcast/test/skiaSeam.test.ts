import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * `src/render/` is the only place that names `@shopify/react-native-skia`,
 * and `legacy/render/` is what `tools/build-android.sh` copies over it for
 * the legacy build, which has no Skia to name.
 *
 * The swap happens during a ten-minute Android build, so a mismatch
 * surfaces there rather than here unless something checks it. That is
 * what this file is. It reads the sources rather than importing them:
 * the real seam pulls in a React Native package that cannot load under
 * plain node.
 */
const MODERN = 'src/render';
const LEGACY = 'legacy/render';

/** Every name a module exports, however it spells the export. */
function exportsOf(source: string): Set<string> {
  const named = [...source.matchAll(/export\s+(?:const|function)\s+(\w+)/g)]
    .map((m) => m[1] as string);
  const listed = [...source.matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap((m) => (m[1] as string).split(','))
    .map((name) => name.trim().split(/\s+as\s+/).pop() ?? '')
    .filter((name) => name !== '');
  const fallthrough = /export\s*\{\s*default\s*\}\s*from/.test(source)
      || /export\s+default/.test(source)
    ? ['default']
    : [];
  return new Set([...named, ...listed, ...fallthrough]);
}

const read = (path: string) => readFileSync(path, 'utf8');

describe('the Skia seam and its legacy stand-in', () => {
  it('has a stand-in for every file the legacy build would otherwise take', () => {
    // The whole directory is replaced, so a modern file with no
    // counterpart simply disappears from the legacy tree — and anything
    // importing it stops resolving. Except the web loader, which the
    // legacy build has no web target for.
    const modern = readdirSync(MODERN)
      .filter((name) => !name.includes('.web.'));
    const legacy = new Set(readdirSync(LEGACY));

    // `CellCanvas` is the one exception: nothing in the legacy tree
    // imports it, because `CellLayer` is the only way in and its
    // stand-in draws nothing.
    const needed = modern.filter((name) => !name.startsWith('CellCanvas'));

    for (const name of needed) {
      assert.ok(
        legacy.has(name),
        `${LEGACY}/${name} is missing, so the legacy build would fail to resolve it`,
      );
    }
  });

  it('exports the same names from both sides of the swap', () => {
    for (const name of readdirSync(LEGACY)) {
      const wanted = exportsOf(read(`${MODERN}/${name}`));
      const got = exportsOf(read(`${LEGACY}/${name}`));
      assert.deepEqual(
        [...got].sort(),
        [...wanted].sort(),
        `${name} exports differ between the two builds`,
      );
    }
  });

  it('reports the canvas absent in the legacy stand-in', () => {
    // The single fact the rest of the map branches on. If this ever said
    // true, the legacy build would render a canvas it cannot draw on.
    assert.match(read(`${LEGACY}/available.ts`), /hasSkia\s*=\s*false/);
  });

  it('answers the availability question without importing Skia', () => {
    // On web the package binds its whole API once, at module evaluation,
    // from a CanvasKit that the loader fetches later. So a file the app
    // imports early must not reach the package: doing it bound the API to
    // nothing and the map died on `undefined (reading 'Path')`.
    //
    // `available.ts` is imported by the map itself, so it has to stay
    // free of imports entirely.
    for (const dir of [MODERN, LEGACY]) {
      const source = read(`${dir}/available.ts`);
      assert.equal(
        /^\s*import\s/m.test(source),
        false,
        `${dir}/available.ts must not import anything`,
      );
    }
  });

  it('keeps the eager Skia binding in the file web loads last', () => {
    // Only the canvas may name the package's main entry, because that is
    // what evaluates the binding. It is reached through a dynamic import
    // on web, after CanvasKit has arrived.
    const eager = readdirSync(MODERN)
      .filter((name) => !name.startsWith('CellCanvas'))
      .filter((name) =>
        /from\s+'@shopify\/react-native-skia'/.test(read(`${MODERN}/${name}`))
      );
    assert.deepEqual(eager, []);
  });

  it('keeps every mention of the package inside the seam', () => {
    // A second file naming Skia would break the legacy build without
    // this directory swap covering it — the failure mode that cost an
    // Android build during the spike.
    const offenders = [...walk('src')]
      .filter((path) => !path.startsWith(`${MODERN}/`))
      .filter((path) => read(path).includes('@shopify/react-native-skia'));
    assert.deepEqual(offenders, []);
  });
});

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.tsx?$/.test(entry.name)) yield path;
  }
}
