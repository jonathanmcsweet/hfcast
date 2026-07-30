import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CREDITS, DISCLAIMER, LICENCES } from '../src/data/credits.ts';
import {
  APP_VERSION,
  APP_VERSION_CODE,
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
      ]
    ) {
      assert.ok(ids.includes(required), `no credit for ${required}`);
    }
  });

  it('states terms for every credit', () => {
    for (const credit of CREDITS) {
      assert.ok(credit.who.length > 0, `${credit.id} names nobody`);
      assert.ok(credit.terms.length > 0, `${credit.id} states no terms`);
    }
  });

  it('carries the no-endorsement disclaimer NTIA/ITS asks for', () => {
    assert.match(DISCLAIMER, /Institute for Telecommunication Sciences/);
    assert.match(DISCLAIMER, /endorse/i);
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
      for (const key of ['title', 'close', 'what', 'version', 'builtOn']) {
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
    assert.equal(APP_VERSION_CODE, versionCodeFor(APP_VERSION));
    assert.ok(APP_VERSION_CODE > 0);
  });

  it('keeps version codes ordered the way versions are', () => {
    const ordered = ['0.9.0', '0.28.0', '0.29.0', '1.0.0', '1.0.1', '2.0.0'];
    const codes = ordered.map(versionCodeFor);
    assert.deepEqual([...codes].sort((a, b) => a - b), codes, `${codes}`);
  });
});
