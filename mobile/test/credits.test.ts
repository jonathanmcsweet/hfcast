import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CREDITS, LICENCES } from '../src/data/credits.ts';
import {
  APP_VERSION,
  APP_VERSION_CODE,
  BUILD_TIER,
  BUILD_TIERS,
  versionCodeFor,
} from '../src/data/version.ts';

/**
 * Attribution is a licence condition here, not a courtesy.
 *
 * IBM Plex ships under the SIL Open Font License, which permits redistribution
 * "provided that each copy contains the above copyright notice and this
 * license". The font is inside the APK, so the APK owes the licence text.
 * Apache-2.0 asks the same of the app's own licence when a binary is handed out,
 * and NTIA/ITS asks for credit and for no implication of endorsement.
 *
 * If this fails, the app is being distributed out of compliance. That is a
 * different kind of failure from a wrong number, which is why it has its own
 * file rather than sitting among the forecast tests.
 */

const locale = (lang: string) =>
  JSON.parse(
    readFileSync(
      path.join(
        import.meta.dirname,
        '..',
        'src',
        'i18n',
        'locales',
        `${lang}.json`,
      ),
      'utf8',
    ),
  );

const LANGUAGES = ['en', 'de', 'es', 'ja', 'ar'] as const;

describe('the licence texts the app is obliged to carry', () => {
  it('carries the Open Font License in full', () => {
    // The font is bundled, so its licence has to be too. Checked by its own
    // words rather than by name, because a file named for a licence that holds
    // something else would pass a name check and fail the obligation.
    const ofl = LICENCES.find((l) => l.name.includes('Open Font'));
    assert.ok(ofl, 'the OFL is not bundled at all');
    assert.match(ofl.text, /SIL OPEN FONT LICENSE Version 1\.1/);
    assert.match(ofl.text, /Copyright © 2017 IBM Corp/);
    // The permission and condition clauses, which are the operative part.
    assert.match(ofl.text, /PERMISSION & CONDITIONS/);
    assert.ok(ofl.text.split('\n').length > 50, 'the OFL looks truncated');
  });

  it("carries the app's own licence in full", () => {
    const apache = LICENCES.find((l) => l.name.includes('Apache'));
    assert.ok(apache, 'the app licence is not bundled');
    assert.match(apache.text, /Apache License/);
    assert.match(apache.text, /Version 2\.0, January 2004/);
    assert.ok(
      apache.text.split('\n').length > 190,
      'Apache-2.0 looks truncated',
    );
  });

  it('says what each licence covers', () => {
    // A reader looking at three licences needs to know which is which, or the
    // screen is a wall of text that discharges the obligation and informs
    // nobody.
    for (const licence of LICENCES) {
      assert.ok(licence.covers.length > 0, `${licence.name} covers nothing`);
      assert.ok(licence.text.length > 0, `${licence.name} has no text`);
    }
  });
});

describe('the credits', () => {
  it('names everyone whose work is bundled', () => {
    // Each of these ships inside the APK or answers a request the app makes.
    // Adding a data source without adding it here is the failure this catches.
    const ids = CREDITS.map((credit) => credit.id);
    for (
      const required of [
        'voacap',
        'voacapl',
        'coefficients',
        'cities',
        'naturalEarth',
        'noaa',
        'plex',
        // The two the device now asks for itself, having stopped going
        // through a server. Both are somebody else's service.
        'giro',
        'openMeteo',
      ]
    ) {
      assert.ok(ids.includes(required), `no credit for ${required}`);
    }
  });

  it('names somebody for every credit', () => {
    for (const credit of CREDITS) {
      assert.ok(credit.who.length > 0, `${credit.id} names nobody`);
      // Optional, but an empty string draws a blank line rather than nothing.
      assert.ok(credit.terms !== '', `${credit.id} has an empty terms line`);
    }
  });

  it('gives every credit somewhere to be followed up', () => {
    // An attribution nobody can act on is a courtesy that discharges
    // nothing. https rather than http: these are opened on a device.
    for (const credit of CREDITS) {
      assert.match(credit.url, /^https:\/\/\S+$/, `${credit.id} has no url`);
    }
  });

  it('links the licence text for terms it does not carry in full', () => {
    // CC BY 4.0 asks for "a URI or hyperlink to the license" as part of the
    // attribution itself, so for Open-Meteo this is an obligation. The
    // licences carried in full under `LICENCES` need no link.
    const carried = new Set(
      LICENCES.map((licence) => licence.name.toLowerCase()),
    );
    for (const credit of CREDITS) {
      const terms = credit.terms ?? '';
      const published = /^(cc0|cc by)/i.test(terms);
      if (!published || carried.has(terms.toLowerCase())) continue;
      assert.match(
        credit.termsUrl ?? '',
        /^https:\/\/(creativecommons\.org)\/\S+$/,
        `${credit.id} states ${terms} but links no licence`,
      );
    }
  });

  it('carries the no-endorsement notice NTIA/ITS asks for', () => {
    // Both halves of what ITS asks: the body named in full, and a statement
    // that they endorse nothing. It rides on the credit rather than standing
    // as its own About section.
    const voacap = CREDITS.find((credit) => credit.id === 'voacap');
    assert.ok(voacap, 'no VOACAP credit at all');
    assert.match(voacap.who, /Institute for Telecommunication Sciences/);
    assert.match(voacap.notice ?? '', /endorse/i);
  });

  it('has a description in every language', () => {
    // A credit with no translation renders as its own key, which reads as a
    // bug and discharges nothing.
    for (const lang of LANGUAGES) {
      const about = locale(lang).about;
      assert.ok(about, `${lang} has no about section`);
      for (const credit of CREDITS) {
        assert.ok(
          typeof about.credit?.[credit.id] === 'string'
            && about.credit[credit.id].length > 0,
          `${lang} is missing about.credit.${credit.id}`,
        );
      }
      for (
        const key of [
          'title',
          'what',
          'version',
          'builtOn',
          'openSource',
          'openTerms',
        ]
      ) {
        assert.ok(
          typeof about[key] === 'string' && about[key].length > 0,
          `${lang} is missing about.${key}`,
        );
      }
    }
  });
});

describe('the version the About screen reports', () => {
  it('is the version the package will carry', () => {
    // Read from app.json, which is what prebuild writes into the manifest, so
    // the screen and the installed package cannot disagree.
    assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
    const pkg = JSON.parse(
      readFileSync(
        path.join(import.meta.dirname, '..', 'package.json'),
        'utf8',
      ),
    );
    assert.equal(APP_VERSION, pkg.version);
  });

  it('moves its version code with the version', () => {
    // Android compares this integer, not the name, to decide what is an
    // upgrade. Two releases sharing a code means the second will not install
    // over the first, and nothing else in the build would notice.
    assert.equal(APP_VERSION_CODE, versionCodeFor(APP_VERSION, BUILD_TIER));
    assert.ok(APP_VERSION_CODE > 0);
  });

  it('keeps version codes ordered the way versions are', () => {
    // The list crosses each block boundary the scheme has: patch past 9,
    // minor past 99, and minor past 99 into the next major. The last of
    // those is the one that was wrong — `0.100.0` and `1.0.0` both came to
    // 100001 while major was worth 10,000, and the minor of this project
    // was already at 54.
    const ordered = [
      '0.9.0',
      '0.28.0',
      '0.29.0',
      '0.54.3',
      '0.99.98',
      '0.99.99',
      '0.100.0',
      '0.999.99',
      '1.0.0',
      '1.0.1',
      '2.0.0',
      '209.999.99',
    ];
    for (const tier of ['legacy', 'modern'] as const) {
      const codes = ordered.map((v) => versionCodeFor(v, tier));
      assert.deepEqual([...codes].sort((a, b) => a - b), codes, `${codes}`);
      assert.equal(new Set(codes).size, codes.length, 'two versions, one code');
    }
  });

  it('stays inside the ceiling Android accepts, with the architecture digit', () => {
    // `plugins/withAbiSplits.ts` multiplies by ten and adds 1 to 4 for the
    // architecture, so the largest code a release can produce is this. The
    // scheme is documented as reaching the ceiling at 210.0.0; this is what
    // makes that claim true rather than a hope.
    const largest = (v: string) => versionCodeFor(v, 'modern') * 10 + 4;
    assert.ok(largest('209.999.99') <= 2_100_000_000);
    assert.ok(largest('210.0.0') > 2_100_000_000);
  });

  it('gives the build with the higher Android floor the higher code', () => {
    // Where a store carries both APKs under one listing, this is the rule it
    // enforces: the one that needs the newer Android has to have the larger
    // code, or it will not accept the pair.
    assert.ok(BUILD_TIERS.modern > BUILD_TIERS.legacy);
    assert.ok(
      versionCodeFor(APP_VERSION, 'modern')
        > versionCodeFor(APP_VERSION, 'legacy'),
    );
  });

  it('is the same version in both dependency sets', () => {
    // The legacy build is the same release, built against older libraries. Two
    // version numbers for one release is the sort of thing nobody notices until
    // a bug report names a version that was never published.
    const read = (...where: string[]) =>
      JSON.parse(
        readFileSync(path.join(import.meta.dirname, '..', ...where), 'utf8'),
      ).version;

    assert.equal(read('legacy', 'package.json'), read('package.json'));
  });

  it('never lets an older release outrank a newer one across tiers', () => {
    // The tier digit must not be able to lift an old version above a new one.
    // With ten tiers to a patch this holds, but it is the property the scheme
    // exists to have, so it is checked rather than assumed.
    assert.ok(
      versionCodeFor('0.30.0', 'legacy') > versionCodeFor('0.29.9', 'modern'),
    );
  });
});
