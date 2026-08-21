import { fireEvent } from '@testing-library/react-native';

import PreferencesModal from '../../src/components/PreferencesModal';
import { LANGUAGE_NAMES, SUPPORTED } from '../../src/i18n';
import i18n from '../../src/i18n/index';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { renderWithApp } from './harness';

/**
 * Language and units, mounted.
 *
 * Worth mounting rather than testing as data, because what moved here
 * was a menu: the risk is not that the lists are wrong but that a choice
 * no longer reaches the store, and that is only visible once the chips
 * are on screen and pressed.
 *
 * Every language must be offered under its own name. A reader who has
 * put the app into a language they cannot read finds their way back by
 * recognising their own — so a missing or translated endonym is the one
 * fault that locks somebody out of the screen that would fix it.
 */

const t = i18n.t.bind(i18n);

describe('the preferences dialog', () => {
  beforeEach(() => {
    useSettingsStore.getState().setUnits('auto');
  });

  it('offers every language under its own name', async () => {
    const view = await renderWithApp(
      <PreferencesModal visible onDismiss={() => {}} />,
    );

    // A dropdown now, so the names are behind it.
    await fireEvent.press(view.getByLabelText(t('settings.changeLanguage')));
    for (const lang of SUPPORTED) {
      expect(view.getAllByText(LANGUAGE_NAMES[lang]).length).toBeGreaterThan(0);
    }
  });

  it('tells the three Englishes apart', async () => {
    const view = await renderWithApp(
      <PreferencesModal visible onDismiss={() => {}} />,
    );

    // Three rows reading "English" would be a coin toss. Each carries
    // its country, and no two of the seven names may be the same.
    const names = SUPPORTED.map((lang) => LANGUAGE_NAMES[lang]);
    expect(new Set(names).size).toBe(names.length);
    await fireEvent.press(view.getByLabelText(t('settings.changeLanguage')));
    for (const english of ['en', 'en-GB', 'en-CA'] as const) {
      expect(view.getAllByText(LANGUAGE_NAMES[english]).length)
        .toBeGreaterThan(0);
    }
  });

  it('records the units chosen', async () => {
    const view = await renderWithApp(
      <PreferencesModal visible onDismiss={() => {}} />,
    );

    await fireEvent.press(view.getByLabelText(t('settings.units.imperial')));
    expect(useSettingsStore.getState().units).toBe('imperial');

    await fireEvent.press(view.getByLabelText(t('settings.units.metric')));
    expect(useSettingsStore.getState().units).toBe('metric');
  });

  it('says what following the device resolved to', async () => {
    // Somebody opening this is usually checking whether it guessed right,
    // which a chip reading only "Follow the device" cannot answer.
    const view = await renderWithApp(
      <PreferencesModal visible onDismiss={() => {}} />,
    );

    const named = view.queryByLabelText(
      t('settings.units.autoNamed', { system: t('settings.units.metric') }),
    ) ?? view.queryByLabelText(
      t('settings.units.autoNamed', { system: t('settings.units.imperial') }),
    );
    expect(named).toBeTruthy();
    expect(view.queryByLabelText(t('settings.units.auto'))).toBeNull();
  });
});
