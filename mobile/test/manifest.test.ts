import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * The module's manifest, parsed.
 *
 * It is XML that nothing type-checks and nothing lints, and the only
 * thing that reads it is a Gradle task nine minutes into an Android
 * build — which is how long it took to find out that a comment in it
 * contained `expo prebuild` written with two hyphens. Two hyphens are
 * illegal inside an XML comment, the merger said only "Error parsing",
 * and no test, lint or typecheck here had anything to say about it.
 *
 * So this parses the file the way the merger does, and checks that the
 * four things the background map job needs are actually in it. It costs
 * milliseconds and it stands in for a build.
 */

const MANIFEST = path.join(
  import.meta.dirname,
  '..',
  'modules',
  'engine-bridge',
  'android',
  'src',
  'main',
  'AndroidManifest.xml',
);

const xml = readFileSync(MANIFEST, 'utf8');

/**
 * Comment bodies, as the parser sees them.
 *
 * Written out rather than taken from a library: adding an XML parser to
 * the app's dependencies to check one file it ships would be a poor
 * trade, and the fault this exists for is a lexical one.
 */
const comments = (text: string): string[] =>
  [...text.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1] ?? '');

describe("the engine module's Android manifest", () => {
  it('holds no comment that would fail the parser', () => {
    for (const body of comments(xml)) {
      assert.ok(
        !body.includes('--'),
        `a comment contains two hyphens together, which XML does not
           allow: ${body.trim().slice(0, 80)}`,
      );
    }
  });

  it('closes every comment it opens', () => {
    assert.equal(
      (xml.match(/<!--/g) ?? []).length,
      (xml.match(/-->/g) ?? []).length,
      'an opened comment is never closed',
    );
  });

  it('asks for what a job running with the screen off needs', () => {
    // Each of these is load-bearing. Without the first two Android
    // refuses to start the service at all from Android 9 and 14; without
    // WAKE_LOCK the processor sleeps with the screen; without the last
    // the notification is silently dropped from Android 13.
    for (
      const permission of [
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
        'android.permission.WAKE_LOCK',
        'android.permission.POST_NOTIFICATIONS',
      ]
    ) {
      assert.ok(
        xml.includes(`android:name="${permission}"`),
        `${permission} is not asked for`,
      );
    }
  });

  it('declares the service, unexported, with its type', () => {
    assert.match(xml, /android:name="com\.hfcast\.engine\.PrecomputeService"/);
    // An exported service that takes a wake lock is a way for any other
    // app on the device to flatten the battery.
    assert.match(xml, /android:exported="false"/);
    // Required from Android 14, and the service asks for the matching
    // type when it starts. The two have to agree or it throws.
    assert.match(xml, /android:foregroundServiceType="dataSync"/);
  });
});
