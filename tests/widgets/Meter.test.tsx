// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Meter } from '../../player/widgets/Meter';
import { makeDef, renderWidget } from './helpers';

const def = makeDef({ type: 'meter', channel_name: 'level', label: 'Level', min: 0, max: 1 });

describe('Meter', () => {
  it('is a read-only meter showing the fallback value', () => {
    const { container, sent } = renderWidget(<Meter def={def} />);
    const meter = screen.getByRole('meter', { name: 'Level' });
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('1');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
    expect(container.querySelector('.cp-widget__value')?.textContent).toBe('0.00');
    expect(sent).toHaveLength(0);
  });

  it('follows engine-published values and sizes the fill', () => {
    const { container, store } = renderWidget(<Meter def={def} />);
    act(() => store.publish({ level: 0.5 }));
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('0.5');
    const fill = container.querySelector('.cp-meter__fill') as HTMLElement;
    expect(fill.style.height).toBe('50%');
    expect(fill.getAttribute('data-zone')).toBe('accent');
  });

  it('switches to warn above 85% and danger above 98%', () => {
    const { container, store } = renderWidget(<Meter def={def} />);
    const fill = container.querySelector('.cp-meter__fill') as HTMLElement;
    act(() => store.publish({ level: 0.86 }));
    expect(fill.getAttribute('data-zone')).toBe('warn');
    act(() => store.publish({ level: 0.99 }));
    expect(fill.getAttribute('data-zone')).toBe('danger');
    expect(fill.style.height).toBe('99%');
  });

  it('clamps out-of-range published values', () => {
    const { container, store } = renderWidget(<Meter def={def} />);
    act(() => store.publish({ level: 5 }));
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('1');
    expect((container.querySelector('.cp-meter__fill') as HTMLElement).style.height).toBe('100%');
    act(() => store.publish({ level: -3 }));
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('0');
    expect((container.querySelector('.cp-meter__fill') as HTMLElement).style.height).toBe('0%');
  });

  it('supports horizontal orientation, showValue=false and a fill override', () => {
    const { container } = renderWidget(
      <Meter
        def={makeDef({
          type: 'meter',
          channel_name: 'level',
          orientation: 'horizontal',
          showValue: false,
          fillColor: 'red',
        })}
      />,
    );
    expect(container.querySelector('.cp-meter--horizontal')).toBeTruthy();
    expect(container.querySelector('.cp-widget__value')).toBeNull();
    const fill = container.querySelector('.cp-meter__fill') as HTMLElement;
    expect(fill.style.backgroundColor).toBe('red');
    expect(fill.style.width).toBe('0%');
  });

  it('handles min > max and no channel', () => {
    const { store } = renderWidget(<Meter def={makeDef({ type: 'meter', channel_name: 'level', min: 10, max: 0 })} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('10');
    act(() => store.publish({ level: 7 }));
    expect(meter.getAttribute('aria-valuenow')).toBe('7');
  });

  it('renders with no channel without crashing', () => {
    renderWidget(<Meter def={makeDef({ type: 'meter', label: 'Level' })} />);
    expect(screen.getByRole('meter', { name: 'Level' }).getAttribute('aria-valuenow')).toBe('0');
  });
});
