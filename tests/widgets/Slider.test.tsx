// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Slider } from '../../player/widgets/Slider';
import { makeDef, renderWidget } from './helpers';

const def = makeDef({ type: 'slider', channel_name: 'gain', label: 'Gain', min: 0, max: 10, default: 2 });

function stubRect(element: Element, width = 100, height = 100) {
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('Slider', () => {
  it('shows the default value, label and vertical slider semantics', () => {
    renderWidget(<Slider def={def} />);
    const slider = screen.getByRole('slider', { name: 'Gain' });
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('10');
    expect(slider.getAttribute('aria-valuenow')).toBe('2');
    expect(slider.getAttribute('aria-orientation')).toBe('vertical');
    expect(slider.getAttribute('aria-valuetext')).toBe('2.00');
  });

  it('supports horizontal orientation and honours the size hint', () => {
    const { container } = renderWidget(
      <Slider def={makeDef({ type: 'slider', channel_name: 'gain', orientation: 'horizontal', width: 900 })} />,
    );
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-orientation')).toBe('horizontal');
    expect(slider.className).toContain('cp-slider--horizontal');
    expect((slider as HTMLElement).style.width).toBe('320px');
    expect(container.querySelector('.cp-widget--slider')).toBeTruthy();
  });

  it('jumps to the pointer position on pointer-down (y up = max)', () => {
    const { sent } = renderWidget(<Slider def={def} />);
    const slider = screen.getByRole('slider');
    stubRect(slider, 20, 100);
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 10, clientY: 25 });
    expect(sent.at(-1)).toEqual(['gain', 7.5]);
    fireEvent.pointerUp(slider, { pointerId: 1 });
  });

  it('continues dragging relatively after the jump, with Shift for fine control', () => {
    const { sent } = renderWidget(<Slider def={def} />);
    const slider = screen.getByRole('slider');
    stubRect(slider, 20, 100);
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 10, clientY: 50 });
    expect(sent.at(-1)).toEqual(['gain', 5]);
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 10, clientY: 30 }); // 20 px up = +10%
    expect(sent.at(-1)).toEqual(['gain', 6]);
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 10, clientY: 10, shiftKey: true }); // 20 px / 10
    expect(sent.at(-1)![1]).toBeCloseTo(6.1);
    fireEvent.pointerUp(slider, { pointerId: 1 });
  });

  it('works like Knob when there is no layout (zero-sized rect)', () => {
    const { sent } = renderWidget(<Slider def={def} />);
    const slider = screen.getByRole('slider');
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 80 }); // +10% of the range
    fireEvent.pointerUp(slider, { pointerId: 1 });
    expect(sent.at(-1)![1]).toBeCloseTo(3);
  });

  it('is keyboard operable and double-click resets', () => {
    const { sent } = renderWidget(<Slider def={def} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(sent.at(-1)![1]).toBeCloseTo(2.1);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(sent.at(-1)).toEqual(['gain', 10]);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(sent.at(-1)).toEqual(['gain', 0]);
    fireEvent.doubleClick(slider);
    expect(sent.at(-1)).toEqual(['gain', 2]);
  });

  it('follows engine-published values and can hide the value', () => {
    const { store } = renderWidget(<Slider def={def} />);
    act(() => store.publish({ gain: 9 }));
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('9');
  });

  it('hides the value when showValue is false', () => {
    const { container } = renderWidget(<Slider def={makeDef({ type: 'slider', showValue: false })} />);
    expect(container.querySelector('.cp-widget__value')).toBeNull();
  });

  it('handles no channel and min > max without crashing', () => {
    const { container } = renderWidget(
      <Slider def={makeDef({ type: 'slider', label: 'Gain', min: 10, max: 0, default: 4 })} />,
    );
    const slider = screen.getByRole('slider', { name: 'Gain' });
    expect(slider.getAttribute('aria-valuenow')).toBe('4');
    expect(() =>
      fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientY: 10 }),
    ).not.toThrow();
    expect(container.querySelector('.cp-widget--slider')).toBeTruthy();
  });
});
