// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Checkbox } from '../../player/widgets/Checkbox';
import { makeDef, renderWidget } from './helpers';

const def = makeDef({ type: 'checkbox', channel_name: 'mute', label: 'Mute', default: 0 });

describe('Checkbox', () => {
  it('renders a labelled native checkbox with the default value', () => {
    const { container, sent } = renderWidget(<Checkbox def={def} />);
    const input = screen.getByRole('checkbox', { name: 'Mute' });
    expect((input as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Mute')).toBeTruthy();
    expect(container.querySelector('.cp-widget--checkbox')?.getAttribute('title')).toBe('Channel: mute');
    expect(sent).toHaveLength(0);
  });

  it('sends 1 / 0 when toggled', () => {
    const { sent } = renderWidget(<Checkbox def={def} />);
    const input = screen.getByRole('checkbox', { name: 'Mute' });
    fireEvent.click(input);
    expect(sent.at(-1)).toEqual(['mute', 1]);
    expect((input as HTMLInputElement).checked).toBe(true);
    fireEvent.click(input);
    expect(sent.at(-1)).toEqual(['mute', 0]);
  });

  it('clamps the default to 0 / 1', () => {
    const { unmount } = renderWidget(<Checkbox def={makeDef({ type: 'checkbox', channel_name: 'mute', default: 5 })} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    unmount();
    renderWidget(<Checkbox def={makeDef({ type: 'checkbox', channel_name: 'mute', default: -2 })} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('follows engine-published values and clamps out-of-range values', () => {
    const { store } = renderWidget(<Checkbox def={def} />);
    const input = screen.getByRole('checkbox') as HTMLInputElement;
    act(() => store.publish({ mute: 1 }));
    expect(input.checked).toBe(true);
    act(() => store.publish({ mute: 42 }));
    expect(input.checked).toBe(true);
    act(() => store.publish({ mute: 0 }));
    expect(input.checked).toBe(false);
    act(() => store.publish({ mute: -7 }));
    expect(input.checked).toBe(false);
  });

  it('uses the initial channel value when present', () => {
    renderWidget(<Checkbox def={def} />, { mute: 1 });
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('applies the checked fill colour override', () => {
    const { container } = renderWidget(
      <Checkbox def={makeDef({ type: 'checkbox', channel_name: 'mute', color: 'red', default: 1 })} />,
    );
    const box = container.querySelector('.cp-checkbox__box') as HTMLElement;
    expect(box.style.backgroundColor).toBe('red');
    expect(box.style.borderColor).toBe('red');
  });

  it('works with no channel', () => {
    const { sent } = renderWidget(<Checkbox def={makeDef({ type: 'checkbox', label: 'Mute' })} />);
    const input = screen.getByRole('checkbox', { name: 'Mute' });
    expect(() => fireEvent.click(input)).not.toThrow();
    expect(sent).toHaveLength(0);
  });
});
