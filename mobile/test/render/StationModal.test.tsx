import { fireEvent } from '@testing-library/react-native';

import StationModal from '../../src/components/StationModal';
import { DEFAULT_STATION } from '../../src/data/station';
import i18n from '../../src/i18n/index';
import { useStationStore } from '../../src/store/useStationStore';
import { renderWithApp } from './harness';

/**
 * The station dialog, mounted.
 *
 * Five sections over one draft. Which of them appear — a height field
 * for an antenna with a height, a gain dial for one with gain, an aim
 * control only where there is something to point — is a rule about the
 * antenna, not about any one section, so only a mounted test sees it.
 *
 * Nothing reaches the store until Save, so a test that reads the store
 * has to press it. That is the behaviour: the dialog used to write on
 * every keystroke, leaving no button that meant "keep this".
 */

const t = i18n.t.bind(i18n);

/** A named chip, by the label a screen reader would announce. */
const antennaChip = (key: string) =>
  t('station.a11y.pickAntenna', { antenna: t(`station.antenna.${key}`) });

describe('the station dialog', () => {
  beforeEach(() => {
    // The whole store, not `reset()`: that returns only the active
    // preset to its defaults, so an added station is left for the next
    // test to trip over.
    useStationStore.getState().commit({
      presets: [{ id: 's1', name: '', ...DEFAULT_STATION }],
      activeId: 's1',
    });
  });

  it('offers every mode and records the one chosen', async () => {
    const view = await renderWithApp(
      <StationModal visible onDismiss={() => {}} />,
    );

    const ft8 = t('station.a11y.pickMode', { mode: t('station.mode.ft8') });
    await fireEvent.press(view.getByLabelText(ft8));

    // Chosen but not yet kept.
    expect(useStationStore.getState().presets[0]?.mode).toBe('cw');

    await fireEvent.press(view.getByText(t('station.save')));
    expect(useStationStore.getState().presets[0]?.mode).toBe('ft8');
  });

  it('keeps nothing when the dialog is cancelled', async () => {
    const view = await renderWithApp(
      <StationModal visible onDismiss={() => {}} />,
    );

    const ft8 = t('station.a11y.pickMode', { mode: t('station.mode.ft8') });
    await fireEvent.press(view.getByLabelText(ft8));
    await fireEvent.press(view.getByText(t('station.cancel')));

    // Cancel asks first, because there is something to lose.
    await fireEvent.press(view.getByText(t('station.discard')));
    expect(useStationStore.getState().presets[0]?.mode).toBe('cw');
  });

  it('makes a station with no name, and will not save one', async () => {
    const view = await renderWithApp(
      <StationModal visible onDismiss={() => {}} />,
    );
    const nameField = () => {
      const [found] = view.getAllByLabelText(t('station.a11y.name'));
      if (found === undefined) throw new Error('no name field');
      return found;
    };

    await fireEvent.press(view.getByLabelText(t('station.a11y.pickStation')));
    await fireEvent.press(view.getByText(t('station.add')));

    // Empty, with the reason Save is off on screen beside it.
    expect(nameField().props.value).toBe('');
    expect(view.getByText(t('station.needsName'))).toBeTruthy();

    await fireEvent.press(view.getByText(t('station.save')));
    expect(useStationStore.getState().presets).toHaveLength(1);

    // A letter at a time. The field was open only while the name was
    // empty, so it shut on the first one and the rest went nowhere.
    await fireEvent.changeText(nameField(), 'F');
    expect(nameField().props.editable).toBe(true);

    await fireEvent.changeText(nameField(), 'Field day');
    expect(view.queryByText(t('station.needsName'))).toBeNull();

    await fireEvent.press(view.getByText(t('station.save')));
    const { presets, activeId } = useStationStore.getState();
    expect(presets).toHaveLength(2);
    expect(presets[1]?.name).toBe('Field day');
    expect(activeId).toBe(presets[1]?.id);
  });

  it('holds the name closed until the pencil is pressed', async () => {
    useStationStore.getState().commit({
      presets: [{ id: 's1', name: 'Home', ...DEFAULT_STATION }],
      activeId: 's1',
    });
    const view = await renderWithApp(
      <StationModal visible onDismiss={() => {}} />,
    );
    const nameField = () => {
      const [found] = view.getAllByLabelText(t('station.a11y.name'));
      if (found === undefined) throw new Error('no name field');
      return found;
    };

    expect(nameField().props.editable).toBe(false);

    await fireEvent.press(view.getByLabelText(t('station.a11y.editName')));
    expect(nameField().props.editable).toBe(true);
  });

  it('shows the station that was picked, and saves that one', async () => {
    useStationStore.getState().commit({
      presets: [
        { id: 's1', name: 'Home', ...DEFAULT_STATION },
        { id: 's2', name: 'Field day', ...DEFAULT_STATION },
      ],
      activeId: 's2',
    });
    const view = await renderWithApp(
      <StationModal visible onDismiss={() => {}} />,
    );
    const nameField = () => {
      const [found] = view.getAllByLabelText(t('station.a11y.name'));
      if (found === undefined) throw new Error('no name field');
      return found;
    };

    expect(nameField().props.value).toBe('Field day');

    await fireEvent.press(view.getByLabelText(t('station.a11y.pickStation')));
    await fireEvent.press(view.getByText('Home'));

    expect(nameField().props.value).toBe('Home');

    await fireEvent.press(view.getByText(t('station.save')));
    expect(useStationStore.getState().activeId).toBe('s1');
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

    await fireEvent.press(view.getByText(t('station.save')));
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
