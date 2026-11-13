// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../../player/widgets/Button';
import { makeDef, renderWidget } from './helpers';

const def = makeDef({ type: 'button', channel_name: 'gate', text: 'Play' });

describe('Button', () => {
  it('uses text as its content and is not pressed initially', () => {
    const { container } = renderWidget(<Button def={def} />);
    const button = screen.getByRole('button', { name: 'Play' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.cp-widget__label')).toBeNull();
    expect(container.querySelector('.cp-widget--button')?.getAttribute('title')).toBe('Channel: gate');
  });

  it('falls back to label, then to "Button"', () => {
    const { unmount } = renderWidget(<Button def={makeDef({ type: 'button', label: 'Go' })} />);
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
    unmount();
    renderWidget(<Button def={makeDef({ type: 'button' })} />);
    expect(screen.getByRole('button', { name: 'Button' })).toBeTruthy();
  });

  it('momentary: press sends 1, release sends 0', () => {
    const { sent } = renderWidget(<Button def={def} />);
    const button = screen.getByRole('button', { name: 'Play' });
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    expect(sent.at(-1)).toEqual(['gate', 1]);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(sent.at(-1)).toEqual(['gate', 0]);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('momentary: keyboard Space/Enter press until keyup', () => {
    const { sent } = renderWidget(<Button def={def} />);
    const button = screen.getByRole('button', { name: 'Play' });
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(sent.at(-1)).toEqual(['gate', 1]);
    fireEvent.keyUp(button, { key: 'Enter' });
    expect(sent.at(-1)).toEqual(['gate', 0]);
    fireEvent.keyDown(button, { key: ' ' });
    expect(sent.at(-1)).toEqual(['gate', 1]);
    fireEvent.keyUp(button, { key: ' ' });
    expect(sent.at(-1)).toEqual(['gate', 0]);
  });

  it('releases on pointercancel and lostpointercapture', () => {
    const { sent } = renderWidget(<Button def={def} />);
    const button = screen.getByRole('button', { name: 'Play' });
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    fireEvent.pointerCancel(button, { pointerId: 1 });
    expect(sent.at(-1)).toEqual(['gate', 0]);
    fireEvent.pointerDown(button, { button: 0, pointerId: 2 });
    fireEvent.lostPointerCapture(button, { pointerId: 2 });
    expect(sent.at(-1)).toEqual(['gate', 0]);
  });

  it('does not release while another source still holds the button', () => {
    const { sent } = renderWidget(<Button def={def} />);
    const button = screen.getByRole('button', { name: 'Play' });
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(sent.at(-1)).toEqual(['gate', 1]);
    fireEvent.keyUp(button, { key: 'Enter' });
    expect(sent.at(-1)).toEqual(['gate', 0]);
  });

  it('latch/toggle mode toggles on click and keyboard', () => {
    for (const mode of ['latch', 'toggle']) {
      const { sent, unmount } = renderWidget(<Button def={makeDef({ type: 'button', channel_name: 'gate', mode })} />);
      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(sent.at(-1)).toEqual(['gate', 1]);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      fireEvent.keyDown(button, { key: 'Enter' });
      expect(sent.at(-1)).toEqual(['gate', 0]);
      expect(button.getAttribute('aria-pressed')).toBe('false');
      fireEvent.keyUp(button, { key: 'Enter' });
      expect(sent.at(-1)).toEqual(['gate', 0]);
      unmount();
    }
  });

  it('reflects values published by the engine in latch mode', () => {
    const { store } = renderWidget(<Button def={makeDef({ type: 'button', channel_name: 'gate', mode: 'toggle' })} />);
    const button = screen.getByRole('button');
    act(() => store.publish({ gate: 1 }));
    expect(button.getAttribute('aria-pressed')).toBe('true');
    act(() => store.publish({ gate: 0 }));
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('applies colour overrides', () => {
    renderWidget(<Button def={makeDef({ type: 'button', color: 'red', textColor: 'white' })} />);
    const button = screen.getByRole('button') as HTMLElement;
    expect(button.style.backgroundColor).toBe('red');
    expect(button.style.color).toBe('white');
  });

  it('works with no channel', () => {
    const { sent } = renderWidget(<Button def={makeDef({ type: 'button' })} />);
    const button = screen.getByRole('button', { name: 'Button' });
    expect(() => fireEvent.pointerDown(button, { button: 0, pointerId: 1 })).not.toThrow();
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(sent).toHaveLength(0);
  });
});
