import { fireEvent } from '@testing-library/react-native';

import StationModal from '../../src/components/StationModal';
import i18n from '../../src/i18n/index';
import { useStationStore } from '../../src/store/useStationStore';
import { renderWithApp } from './harness';

/**
 * The station dialog, mounted.
 *
 * It is five sections over one store, and the rules that decide which of
 * them appear — a height field for an antenna that has a height, a gain
 * dial for one with gain, an aim control only where there is something to
 * point — are rules about the antenna and not about any one section. That
 * is what a mounted test can check and a test of a pure module cannot.
 */

const t = i18n.t.bind(i18n);

/** A named chip, by the label a screen reader would announce. */
const antennaChip = (key: string) =>
  t('station.a11y.pickAntenna', { antenna: t(`station.antenna.${key}`) });

describe('the station dialog', () => {
  beforeEach(() => {
    useStationStore.getState().reset();
  });

  it('offers every mode and records the one chosen', async () => {
    const view = await renderWithApp(
      <StationModal visible onDismiss={() => {}} />,
    );

    const ft8 = t('station.a11y.pickMode', { mode: t('station.mode.ft8') });
    await fireEvent.press(view.getByLabelText(ft8));

    expect(useStationStore.getState().presets[0]?.mode).toBe('ft8');
  });

  it('asks for a height only where the antenna has one', async () => {
    const view = await renderWithApp(
      <StationModal visible onDismiss={() => {}} />,
    );

    // The default is isotropic: no height, and a note saying why.
    expect(view.queryByLabelText(t('station.a11y.height'))).toBeNull();
    expect(view.getByText(t('station.isotropicNote'))).toBeTruthy();

    await fireEvent.press(view.getByLabelText(antennaChip('dipole')));

    expect(view.getAllByLabelText(t('station.a11y.height')).length)
      .toBeGreaterThan(0);
    expect(view.queryByText(t('station.isotropicNote'))).toBeNull();
  });

  it('asks for gain only where the antenna has gain', async () => {
    const view = await renderWithApp(
      <StationModal visible onDismiss={() => {}} />,
    );

    await fireEvent.press(view.getByLabelText(antennaChip('dipole')));
    expect(view.queryByLabelText(t('station.a11y.gain'))).toBeNull();

    await fireEvent.press(view.getByLabelText(antennaChip('yagi')));
    expect(view.getByLabelText(t('station.a11y.gain'))).toBeTruthy();
  });

  it('asks a wire how it runs and a beam where it points', async () => {
    const view = await renderWithApp(
      <StationModal visible onDismiss={() => {}} />,
    );

    // A dipole is described by its run, because it radiates at right
    // angles to it. Asking for a "beam heading" would ask the operator to
    // do that conversion, and getting it wrong puts the path in the null.
    await fireEvent.press(view.getByLabelText(antennaChip('dipole')));
    expect(view.getByLabelText(t('station.a11y.wire'))).toBeTruthy();
    expect(view.queryByLabelText(t('station.a11y.beam'))).toBeNull();

    await fireEvent.press(view.getByLabelText(antennaChip('yagi')));
    expect(view.getByLabelText(t('station.a11y.beam'))).toBeTruthy();
    expect(view.queryByLabelText(t('station.a11y.wire'))).toBeNull();
  });

  it('points a beam at the other end when asked', async () => {
    const view = await renderWithApp(
      <StationModal
        visible
        onDismiss={() => {}}
        bearingToDestination={64.4}
        destinationLabel="Tokyo"
      />,
    );

    await fireEvent.press(view.getByLabelText(antennaChip('yagi')));
    await fireEvent.press(
      view.getByText(t('station.aimAt', { place: 'Tokyo', degrees: 64 })),
    );

    expect(useStationStore.getState().presets[0]?.antenna.beamDeg).toBe(64);
  });

  it('shows nothing to point for a vertical', async () => {
    const view = await renderWithApp(
      <StationModal visible onDismiss={() => {}} />,
    );

    await fireEvent.press(view.getByLabelText(antennaChip('vertical')));

    expect(view.queryByLabelText(t('station.a11y.beam'))).toBeNull();
    expect(view.queryByLabelText(t('station.a11y.wire'))).toBeNull();
    expect(view.getByText(t('station.verticalNote'))).toBeTruthy();
  });
});
