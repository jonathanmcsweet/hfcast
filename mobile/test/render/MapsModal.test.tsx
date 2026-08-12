import { fireEvent } from '@testing-library/react-native';

import MapsModal from '../../src/components/MapsModal';
import i18n from '../../src/i18n/index';
import { usePrecomputeStore } from '../../src/store/usePrecomputeStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { renderWithApp } from './harness';

/**
 * The two controls that decide whether a job runs at all.
 *
 * Both are here because both failed the same way in the field: the app
 * was doing exactly what it had been told and gave no readable account
 * of it. A job held back for a charger reported that in a caption below
 * the fold, which was read as a stall, and the switch that would have
 * released it was hidden for the whole time a job was running — which is
 * the only time anybody wants it (user, 2026-08-12).
 *
 * So these mount the dialog in the state that was misread and assert
 * what a person can actually see and press.
 */

const t = i18n.t.bind(i18n);

/** The dialog in the state a job reaches when it is held for power. */
const heldForPower = () => {
  usePrecomputeStore.getState().begin(24);
  usePrecomputeStore.getState().setWaiting(true);
};

describe('the compute-ahead dialog', () => {
  beforeEach(() => {
    usePrecomputeStore.getState().finish(false);
    useSettingsStore.getState().setPrecomputeOnCharger(true);
  });

  it('says why nothing is moving when it waits for a charger', async () => {
    heldForPower();
    const view = await renderWithApp(
      <MapsModal visible onDismiss={() => {}} />,
    );

    expect(view.getByText(t('maps.waitingTitle'))).toBeTruthy();
  });

  it('names the switch that ends the wait', async () => {
    // The words matter more than their presence. Somebody reading this
    // has to learn that the wait is a setting rather than a fault, and
    // the sentence only does that if it carries the switch's own label.
    heldForPower();
    const view = await renderWithApp(
      <MapsModal visible onDismiss={() => {}} />,
    );

    const told = t('maps.waitingForCharger', {
      setting: t('maps.onCharger'),
    });
    expect(told).toContain(t('maps.onCharger'));
    expect(view.getByText(told)).toBeTruthy();
  });

  it('shows nothing about waiting when it is not', async () => {
    usePrecomputeStore.getState().begin(24);
    const view = await renderWithApp(
      <MapsModal visible onDismiss={() => {}} />,
    );

    expect(view.queryByText(t('maps.waitingTitle'))).toBeNull();
  });

  it('offers the charger switch while a job is running', async () => {
    // The case it was missing from. A dialog that only offers this
    // between jobs offers it at the one time nobody is asking.
    heldForPower();
    const view = await renderWithApp(
      <MapsModal visible onDismiss={() => {}} />,
    );

    const control = view.getByLabelText(t('maps.onCharger'));
    fireEvent(control, 'valueChange', false);
    expect(useSettingsStore.getState().precomputeOnCharger).toBe(false);
  });

  it('warns about the battery once the charger rule is off', async () => {
    useSettingsStore.getState().setPrecomputeOnCharger(false);
    const view = await renderWithApp(
      <MapsModal visible onDismiss={() => {}} />,
    );

    expect(view.getByText(t('maps.batteryNote'))).toBeTruthy();
  });
});
