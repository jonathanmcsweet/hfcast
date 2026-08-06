import { fireEvent } from '@testing-library/react-native';

import ChipGroup from '../../src/components/station/ChipGroup';
import { renderWithApp } from './harness';

describe('the chip row', () => {
  it('marks the chosen one and reports a tap', async () => {
    const picked: string[] = [];
    const view = await renderWithApp(
      <ChipGroup
        options={['cw', 'ssb'] as const}
        selected="cw"
        onSelect={(value) => picked.push(value)}
        label={(value) => value.toUpperCase()}
        a11yLabel={(value) => `pick ${value}`}
      />,
    );

    expect(view.getByLabelText('pick cw')).toBeSelected();
    expect(view.getByLabelText('pick ssb')).not.toBeSelected();

    await fireEvent.press(view.getByLabelText('pick ssb'));
    expect(picked).toEqual(['ssb']);
  });
});
