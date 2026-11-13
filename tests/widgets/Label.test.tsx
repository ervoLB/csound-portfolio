// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatLabelValue, Label, LABEL_REFRESH_MS } from '../../player/widgets/Label';
import { makeDef, renderWidget } from './helpers';

describe('Label', () => {
  it('renders the text and typography overrides', () => {
    const { container } = renderWidget(
      <Label
        def={makeDef({
          type: 'label',
          text: 'Filter section',
          fontSize: 20,
          align: 'right',
          fontWeight: 600,
          color: 'red',
        })}
      />,
    );
    const text = screen.getByText('Filter section');
    expect(text.className).toBe('cp-label');
    expect(text.style.textAlign).toBe('right');
    expect(text.style.fontSize).toBe('20px');
    expect(text.style.fontWeight).toBe('600');
    expect(text.style.color).toBe('red');
    expect(container.querySelector('.cp-widget--label')).toBeTruthy();
  });

  it('falls back to label, then to empty text', () => {
    const { unmount } = renderWidget(<Label def={makeDef({ type: 'label', label: 'From label' })} />);
    expect(screen.getByText('From label')).toBeTruthy();
    unmount();
    const { container } = renderWidget(<Label def={makeDef({ type: 'label' })} />);
    expect(container.querySelector('.cp-label')?.textContent).toBe('');
  });

  it('renders plain text only, never HTML', () => {
    const { container } = renderWidget(<Label def={makeDef({ type: 'label', text: '<b>hi</b>' })} />);
    expect(screen.getByText('<b>hi</b>')).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
  });

  it('uses safe defaults and clamps the font size', () => {
    renderWidget(<Label def={makeDef({ type: 'label', text: 'x', fontSize: 500, align: 'middle' })} />);
    const text = screen.getByText('x');
    expect(text.style.fontSize).toBe('72px');
    expect(text.style.textAlign).toBe(''); // an unknown align is ignored: the stylesheet centres the text
  });

  it('has no channel and needs no store value', () => {
    const { container } = renderWidget(<Label def={makeDef({ type: 'label', text: 'Static' })} />);
    expect(container.querySelector('.cp-widget')?.getAttribute('title')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });
});

describe('Label bound to a channel (chnset)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('puts the value into {value} with the given decimals', () => {
    const { store } = renderWidget(<Label def={makeDef({ type: 'label', channel_name: 'rms', text: 'RMS: {value}', decimals: 3 })} />);
    expect(screen.getByText('RMS: 0.000')).toBeTruthy();
    act(() => store.publish({ rms: 0.23149 }));
    act(() => vi.advanceTimersByTime(LABEL_REFRESH_MS));
    expect(screen.getByText('RMS: 0.231')).toBeTruthy();
  });

  it('without {value}, shows the number under the text as a caption', () => {
    const { store, container } = renderWidget(<Label def={makeDef({ type: 'label', channel_name: 'peak', label: 'peak', decimals: 1 })} />);
    act(() => store.publish({ peak: 12.345 }));
    act(() => vi.advanceTimersByTime(LABEL_REFRESH_MS));
    expect(container.querySelector('.cp-widget__label')!.textContent).toBe('peak');
    expect(container.querySelector('.cp-label--live')!.textContent).toBe('12.3');
  });

  it('redraws at most every LABEL_REFRESH_MS, always ending on the latest value', () => {
    const { store } = renderWidget(<Label def={makeDef({ type: 'label', channel_name: 'x', text: '{value}', decimals: 0 })} />);
    act(() => vi.advanceTimersByTime(LABEL_REFRESH_MS));
    act(() => store.publish({ x: 1 }));
    act(() => vi.advanceTimersByTime(LABEL_REFRESH_MS / 2));
    act(() => store.publish({ x: 2 }));
    act(() => vi.advanceTimersByTime(LABEL_REFRESH_MS / 4));
    expect(screen.queryByText('2')).toBeNull(); // not yet redrawn
    act(() => store.publish({ x: 3 }));
    act(() => vi.advanceTimersByTime(LABEL_REFRESH_MS));
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('formats numbers', () => {
    expect(formatLabelValue(0.23149, 2)).toBe('0.23');
    expect(formatLabelValue(-3, 0)).toBe('-3');
    expect(formatLabelValue(Number.NaN, 1)).toBe('0.0');
    expect(formatLabelValue(1234.5)).toBe('1235');
  });
});
