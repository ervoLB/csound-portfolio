// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toggle } from '../../player/widgets/Toggle';
import { makeDef, renderWidget } from './helpers';

const def = makeDef({ type: 'toggle', channel_name: 'bypass', label: 'Bypass', default: 0 });

describe('Toggle', () => {
  it('renders a switch with the default value and a visible label', () => {
    const { container } = renderWidget(<Toggle def={def} />);
    const toggle = screen.getByRole('switch', { name: 'Bypass' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Bypass')).toBeTruthy();
    expect(container.querySelector('.cp-widget--toggle')?.getAttribute('title')).toBe('Channel: bypass');
  });

  it('toggles with a click, sending 1 then 0', () => {
    const { sent } = renderWidget(<Toggle def={def} />);
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(sent.at(-1)).toEqual(['bypass', 1]);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(sent.at(-1)).toEqual(['bypass', 0]);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggles with Space and Enter', () => {
    const { sent } = renderWidget(<Toggle def={def} />);
    const toggle = screen.getByRole('switch');
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(sent.at(-1)).toEqual(['bypass', 1]);
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(sent.at(-1)).toEqual(['bypass', 0]);
  });

  it('clamps the default to 0 / 1', () => {
    renderWidget(<Toggle def={makeDef({ type: 'toggle', channel_name: 'bypass', default: 9 })} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('follows engine-published values, including out-of-range ones', () => {
    const { store } = renderWidget(<Toggle def={def} />);
    const toggle = screen.getByRole('switch');
    act(() => store.publish({ bypass: 1 }));
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    act(() => store.publish({ bypass: -3 }));
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    act(() => store.publish({ bypass: 100 }));
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('applies active / inactive colour overrides', () => {
    const { container } = renderWidget(
      <Toggle
        def={makeDef({
          type: 'toggle',
          channel_name: 'bypass',
          default: 1,
          activeColor: 'green',
          inactiveColor: 'gray',
        })}
      />,
    );
    const track = container.querySelector('.cp-toggle__track') as HTMLElement;
    expect(track.style.backgroundColor).toBe('green');
    fireEvent.click(screen.getByRole('switch'));
    expect(track.style.backgroundColor).toBe('gray');
  });

  it('works with no channel', () => {
    const { sent } = renderWidget(<Toggle def={makeDef({ type: 'toggle', label: 'Bypass' })} />);
    const toggle = screen.getByRole('switch', { name: 'Bypass' });
    expect(() => fireEvent.click(toggle)).not.toThrow();
    expect(sent).toHaveLength(0);
  });
});
