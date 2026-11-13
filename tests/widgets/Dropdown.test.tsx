// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dropdown } from '../../player/widgets/Dropdown';
import { makeDef, renderWidget } from './helpers';

const options = [
  { label: 'Sine', value: 0 },
  { label: 'Saw', value: 1 },
  { label: 'Square', value: 2 },
];
const def = makeDef({ type: 'dropdown', channel_name: 'wave', label: 'Wave', options, default: 0 });

describe('Dropdown', () => {
  it('renders a labelled native select with the default selected', () => {
    const { container } = renderWidget(<Dropdown def={def} />);
    const select = screen.getByRole('combobox', { name: 'Wave' });
    expect((select as HTMLSelectElement).value).toBe('0');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Sine', 'Saw', 'Square']);
    expect(container.querySelector('.cp-widget--dropdown')?.getAttribute('title')).toBe('Channel: wave');
  });

  it('sends the numeric value of the chosen option', () => {
    const { sent } = renderWidget(<Dropdown def={def} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '2' } });
    expect(sent.at(-1)).toEqual(['wave', 2]);
    expect((select as HTMLSelectElement).value).toBe('2');
  });

  it('prefers the initial channel value, then an explicit default, then the first option', () => {
    const first = renderWidget(<Dropdown def={def} />, { wave: 1 });
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('1');
    first.unmount();

    const second = renderWidget(
      <Dropdown def={makeDef({ type: 'dropdown', channel_name: 'wave', options, default: 2 })} />,
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('2');
    second.unmount();

    // makeDef supplies default: 0, which is not one of these option values.
    renderWidget(
      <Dropdown
        def={makeDef({
          type: 'dropdown',
          channel_name: 'wave',
          options: [
            { label: 'A', value: 1 },
            { label: 'B', value: 2 },
          ],
        })}
      />,
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('1');
  });

  it('renders a disabled select for empty / missing options', () => {
    const { unmount } = renderWidget(<Dropdown def={makeDef({ type: 'dropdown', channel_name: 'wave', options: [] })} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    unmount();
    renderWidget(<Dropdown def={makeDef({ type: 'dropdown', channel_name: 'wave' })} />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
  });

  it('follows engine-published values and ignores out-of-range values', () => {
    const { store } = renderWidget(<Dropdown def={def} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    act(() => store.publish({ wave: 2 }));
    expect(select.value).toBe('2');
    act(() => store.publish({ wave: 99 }));
    expect(select.value).toBe('0'); // no such option: keep the widget default
    expect(select.disabled).toBe(false);
  });

  it('works with no channel', () => {
    const { sent } = renderWidget(<Dropdown def={makeDef({ type: 'dropdown', label: 'Wave', options })} />);
    const select = screen.getByRole('combobox', { name: 'Wave' });
    fireEvent.change(select, { target: { value: '1' } });
    expect(sent).toHaveLength(0);
  });
});
