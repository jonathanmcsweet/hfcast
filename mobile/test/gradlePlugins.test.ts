import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ABI_CODES, addAbiSplits } from '../plugins/withAbiSplits.ts';
import {
  JVM_ARGS,
  type PropertiesItem,
  setBuildMemory,
} from '../plugins/withBuildMemory.ts';
import { addReleaseSigning } from '../plugins/withReleaseSigning.ts';
import { BUILD_TIERS, versionCodeFor } from '../src/data/version.ts';

/**
 * The two plugins that decide what a release is.
 *
 * One chooses the signing key, the other splits the APK by architecture and
 * gives each file its own version code. Both work by rewriting the text of
 * `android/app/build.gradle`, which `expo prebuild` writes fresh every time
 * and which git does not hold.
 *
 * Nothing checked either of them. Running them for real needs a prebuild, an
 * Android SDK and about twenty minutes, so both faults they can produce were
 * only visible in a finished APK:
 *
 * - A release signed with the debug key. It installs, and it looks correct.
 *   Nobody who installed it can ever take an update, because Android refuses
 *   to replace a debug-signed package with a properly signed one.
 * - Four APKs sharing one version code, or codes that fall between releases.
 *   Android compares the code across the whole application, so this shows as
 *   an update that will not install.
 *
 * These call the transform on a string instead. The template below is the
 * shape React Native and Expo SDK 57 generate, cut down to the parts the two
 * plugins look for.
 */

const TEMPLATE = `
apply plugin: "com.android.application"

def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'

android {
    ndkVersion rootProject.ext.ndkVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace 'solutions.cloudburner.hfcast'
    defaultConfig {
        applicationId 'solutions.cloudburner.hfcast'
        minSdkVersion rootProject.ext.minSdkVersion
        versionCode 54041
        versionName "0.54.4"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
}
`;

/** Where a piece of text sits, so two of them can be compared by order. */
const at = (text: string, needle: string): number => {
  const index = text.indexOf(needle);
  assert.notEqual(index, -1, `not found: ${needle}`);
  return index;
};

describe('the release signing plugin', () => {
  const signed = addReleaseSigning(TEMPLATE);

  it('leaves the debug build on the debug key', () => {
    // The template names the debug key twice. Only the second, in the
    // release block, may change. Changing the first would break every
    // development build on every machine.
    //
    // The plugin adds a `release {` of its own above `buildTypes`, so the
    // search for the end of the debug block starts from `buildTypes`.
    const buildTypes = signed.slice(at(signed, 'buildTypes {'));
    const debugBlock = buildTypes.slice(0, at(buildTypes, 'release {'));
    assert.match(debugBlock, /signingConfig signingConfigs\.debug/);
    assert.doesNotMatch(debugBlock, /HFCAST_STORE_FILE/);
  });

  it('makes the release build choose the key at build time', () => {
    const releaseBlock = signed.slice(at(signed, 'buildTypes'));
    assert.match(
      releaseBlock,
      /release \{[\s\S]*signingConfig project\.hasProperty\('HFCAST_STORE_FILE'\) \? signingConfigs\.release : signingConfigs\.debug/,
    );
  });

  it('adds the release key only when the machine has one', () => {
    // A person cloning this repository, and F-Droid, both build with no
    // key. The block has to be absent then, not empty, or Gradle fails on
    // a `storeFile` it cannot read.
    assert.match(
      signed,
      /signingConfigs \{\s*\/\/[\s\S]*?if \(project\.hasProperty\('HFCAST_STORE_FILE'\)\) \{\s*release \{/,
    );
    assert.match(signed, /storeFile file\(HFCAST_STORE_FILE\)/);
  });

  it('puts the signing configs inside the android block', () => {
    assert.ok(
      at(signed, 'android {') < at(signed, 'storeFile file(HFCAST_STORE_FILE)'),
    );
    assert.ok(
      at(signed, 'storeFile file(HFCAST_STORE_FILE)')
        < at(signed, 'dependencies {'),
    );
  });

  it('holds no password and no path of its own', () => {
    // The keystore and its passwords live outside the repository. Every one
    // of them reaches Gradle as a property, never as text here.
    assert.doesNotMatch(signed, /\.jks/);
    assert.doesNotMatch(signed, /storePassword ['"](?!android)/);
  });

  it('adds nothing a second time', () => {
    assert.equal(addReleaseSigning(signed), signed);
  });

  it('stops when the template no longer has two debug key lines', () => {
    // Position is the only anchor: the debug assignment comes first and the
    // release one second. If the template stops having exactly two, this
    // plugin cannot tell which to change and must not guess.
    const one = TEMPLATE.replace(
      / {12}signingConfig signingConfigs\.debug\n/,
      '',
    );
    assert.throws(() => addReleaseSigning(one), /holds 1 .* expected two/);

    const three = `${TEMPLATE}\n        signingConfig signingConfigs.debug\n`;
    assert.throws(() => addReleaseSigning(three), /holds 3 .* expected two/);

    const none = TEMPLATE.replaceAll('signingConfig signingConfigs.debug', '');
    assert.throws(() => addReleaseSigning(none), /holds 0 .* expected two/);
  });
});

describe('the architecture split plugin', () => {
  const split = addAbiSplits(TEMPLATE);

  it('builds the four architectures and no fifth file', () => {
    assert.match(split, /include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"/);
    assert.match(split, /universalApk false/);
    assert.match(split, /enable true/);
  });

  it('puts splits inside the android block and the codes outside it', () => {
    // `applicationVariants` belongs to the plugin, not to the `android`
    // extension. Inside the block, Gradle fails to configure.
    assert.ok(at(split, 'android {') < at(split, 'splits {'));
    assert.ok(at(split, 'dependencies {') < at(split, 'ext.abiCodes'));
  });

  it('stops when there is no android block to add to', () => {
    assert.throws(
      () => addAbiSplits('dependencies {\n}\n'),
      /no `android \{` block/,
    );
  });

  it('adds nothing a second time', () => {
    assert.equal(addAbiSplits(split), split);
  });

  it('leaves the signing plugin able to run after it', () => {
    // Both rewrite the same file, in an order `app.json` decides, and both
    // add their block just inside `android {`. So the two orders do not
    // give the same text — but neither may take the other's anchor away,
    // and both results must hold everything.
    //
    // The order the blocks end up in does not matter to Gradle. What
    // matters is that each is present, once, on the correct side of
    // `dependencies {`.
    for (
      const both of [
        addAbiSplits(addReleaseSigning(TEMPLATE)),
        addReleaseSigning(addAbiSplits(TEMPLATE)),
      ]
    ) {
      assert.match(both, /storeFile file\(HFCAST_STORE_FILE\)/);
      assert.match(both, /universalApk false/);
      assert.match(
        both,
        /signingConfig project\.hasProperty\('HFCAST_STORE_FILE'\)/,
      );
      assert.ok(at(both, 'android {') < at(both, 'splits {'));
      assert.ok(at(both, 'dependencies {') < at(both, 'ext.abiCodes'));
      // And neither adds itself again over the other's output.
      assert.equal(addAbiSplits(addReleaseSigning(both)), both);
    }
  });
});

describe('the build memory plugin', () => {
  /** The shape `expo prebuild` writes, cut down to the lines this reads. */
  const TEMPLATE = [
    {
      type: 'comment',
      value: 'Specifies the JVM arguments used for the daemon',
    },
    {
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: '-Xmx2048m -XX:MaxMetaspaceSize=512m',
    },
    { type: 'property', key: 'org.gradle.parallel', value: 'true' },
  ] as const;

  /** Narrows to the entries that have a key, which comments do not. */
  const named = (entries: readonly PropertiesItem[], key: string) =>
    entries.filter((entry) =>
      entry.type === 'property' && entry.key === key
    ) as {
      type: 'property';
      key: string;
      value: string;
    }[];

  it('raises the metaspace the daemon runs out of', () => {
    const out = setBuildMemory(TEMPLATE);
    const [args] = named(out, 'org.gradle.jvmargs');
    assert.equal(args?.value, JVM_ARGS);
    assert.match(JVM_ARGS, /MaxMetaspaceSize=1024m/);
  });

  it('leaves every other property where it was', () => {
    const out = setBuildMemory(TEMPLATE);
    assert.equal(out.length, TEMPLATE.length);
    assert.deepEqual(out[0], TEMPLATE[0]);
    assert.deepEqual(out[2], TEMPLATE[2]);
  });

  it('adds the key if the template stops writing it', () => {
    // A template without the key would otherwise leave the daemon on the
    // JVM's own default, which is smaller than what it starts with today.
    const without = TEMPLATE.filter(
      (entry) =>
        entry.type !== 'property' || entry.key !== 'org.gradle.jvmargs',
    );
    const out = setBuildMemory(without);
    assert.equal(named(out, 'org.gradle.jvmargs').length, 1);
  });

  it('adds nothing a second time', () => {
    // `expo prebuild` can call the plugins again over a tree that already
    // has the change.
    assert.deepEqual(
      setBuildMemory(setBuildMemory(TEMPLATE)),
      setBuildMemory(TEMPLATE),
    );
  });
});

/**
 * The version code arithmetic, read out of the plugin's own Groovy.
 *
 * The sum is written in Groovy and runs inside Gradle, so it cannot be
 * called from here. Instead the numbers are read from the text the plugin
 * injects, and the sum is checked against `versionCodeFor`, which supplies
 * the other half.
 */
const abiCodes = (): Map<string, number> => {
  const line = /ext\.abiCodes = \[([^\]]+)\]/.exec(ABI_CODES);
  assert.ok(line, 'the plugin no longer declares ext.abiCodes');
  return new Map(
    line[1]
      .split(',')
      .map((entry) => entry.split(':').map((part) => part.trim()))
      .map(([name, code]) => [name.replaceAll('"', ''), Number(code)]),
  );
};

/** What Android will compare, for one release, one tier, one architecture. */
const finalCode = (version: string, tier: 'legacy' | 'modern', abi: number) =>
  versionCodeFor(version, tier) * 10 + abi;

describe('the version code each architecture gets', () => {
  it('multiplies by ten, so the architecture is the last digit', () => {
    // Adding instead of multiplying would let the fourth file of one
    // release reach into the next release's numbers.
    assert.match(
      ABI_CODES,
      /variant\.versionCode \* 10 \+ project\.ext\.abiCodes\.get\(abi\)/,
    );
  });

  it('numbers the four architectures the way it always has', () => {
    // These must never be reordered. A device that installed `arm64-v8a`
    // as 3 has to keep seeing 3, or its next update reads as a downgrade
    // and Android refuses it.
    assert.deepEqual(
      [...abiCodes()],
      [['armeabi-v7a', 1], ['x86', 2], ['arm64-v8a', 3], ['x86_64', 4]],
    );
  });

  it('gives every file of every release its own number', () => {
    const versions = [
      '0.54.3',
      '0.54.4',
      '0.55.0',
      '0.99.99',
      '1.0.0',
      '2.0.0',
    ];
    const codes = versions.flatMap((v) =>
      (['legacy', 'modern'] as const).flatMap((tier) =>
        [...abiCodes().values()].map((abi) => finalCode(v, tier, abi))
      )
    );
    assert.equal(new Set(codes).size, codes.length, 'two files, one code');
  });

  it('leaves no code of one release above any code of the next', () => {
    // The gap the multiply buys. Every file of 0.54.4 has to be above
    // every file of 0.54.3, whichever tier and architecture.
    const all = (v: string) =>
      (['legacy', 'modern'] as const).flatMap((tier) =>
        [...abiCodes().values()].map((abi) => finalCode(v, tier, abi))
      );
    const rising = ['0.54.3', '0.54.4', '0.55.0', '0.99.99', '1.0.0'];
    for (const [i, version] of rising.slice(1).entries()) {
      assert.ok(
        Math.min(...all(version)) > Math.max(...all(rising[i])),
        `${version} does not clear ${rising[i]}`,
      );
    }
  });

  it('stays under the number Android will accept', () => {
    // 2,100,000,000 is the limit. With the tier digit and the architecture
    // digit below the version, the scheme runs out at major 210.
    const largest = (v: string) => finalCode(v, 'modern', 4);
    assert.ok(largest('209.999.99') <= 2_100_000_000);
    assert.ok(largest('210.0.0') > 2_100_000_000);
    assert.equal(BUILD_TIERS.modern, 1);
  });
});
