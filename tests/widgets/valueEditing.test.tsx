// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Knob } from '../../player/widgets/Knob';
import { Slider } from '../../player/widgets/Slider';
import { TextFader } from '../../player/widgets/text/TextFader';
import { makeDef, renderWidget } from './helpers';

// All three start at 1000 and accept 1500; the slider's max makes 1500 clamp to 1200.
const knobDef = makeDef({
  type: 'knob',
  channel_name: 'cutoff',
  label: 'Cutoff',
  min: 100,
  max: 2000,
  default: 1000,
  step: 10,
});
const sliderDef = makeDef({
  type: 'slider',
  channel_name: 'level',
  label: 'Level',
  min: 0,
  max: 1200,
  default: 1000,
  step: 25,
});
const faderDef = makeDef({
  type: 'knob',
  channel_name: 'freq',
  label: 'Freq',
  min: 20,
  max: 20000,
  default: 1000,
  step: 1,
});

interface WidgetCase {
  name: string;
  ui: () => ReactElement;
  channel: string;
  label: string;
  typed1500: number;
  max: number;
}

const widgets: WidgetCase[] = [
  {
    name: 'Knob',
    ui: () => <Knob def={knobDef} />,
    channel: 'cutoff',
    label: 'Cutoff',
    typed1500: 1500,
    max: 2000,
  },
  {
    name: 'Slider',
    ui: () => <Slider def={sliderDef} />,
    channel: 'level',
    label: 'Level',
    typed1500: 1200,
    max: 1200,
  },
  {
    name: 'TextFader',
    ui: () => <TextFader def={faderDef} />,
    channel: 'freq',
    label: 'Freq',
    typed1500: 1500,
    max: 20000,
  },
];

function valueText(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('.cp-widget__value')!;
}

function openEditor(container: HTMLElement): HTMLInputElement {
  fireEvent.doubleClick(valueText(container));
  return screen.getByRole('textbox') as HTMLInputElement;
}

describe.each(widgets)('$name value editing', ({ ui, channel, label, typed1500, max }) => {
  it('opens an input on double-click of the value text', () => {
    const { container } = renderWidget(ui());
    expect(valueText(container).textContent).toBe('1000');

    const input = openEditor(container);
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input.getAttribute('aria-label')).toBe(`${label} value`);
    expect(input.value).toBe('1000');
    expect(document.activeElement).toBe(input);
  });

  it('sends the typed value on Enter, clamped to the range and snapped to the step', () => {
    const { container, sent } = renderWidget(ui());
    const input = openEditor(container);

    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(sent.at(-1)).toEqual([channel, typed1500]);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('clamps a value above the maximum', () => {
    const { container, sent } = renderWidget(ui());
    const input = openEditor(container);

    fireEvent.change(input, { target: { value: '99999' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(sent.at(-1)).toEqual([channel, max]);
  });

  it('changes nothing for invalid text', () => {
    const { container, sent } = renderWidget(ui());
    const input = openEditor(container);

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(sent).toEqual([]);
    expect(input.getAttribute('aria-invalid')).toBe('true'); // stays open to be corrected
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(valueText(container).textContent).toBe('1000');
  });

  it('cancels on Escape', () => {
    const { container, sent } = renderWidget(ui());
    const input = openEditor(container);

    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(sent).toEqual([]);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(valueText(container).textContent).toBe('1000');
  });

  it('returns focus to the slider after Enter', () => {
    const { container } = renderWidget(ui());
    const input = openEditor(container);

    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(document.activeElement).toBe(screen.getByRole('slider'));
  });

  it('returns focus to the slider after Escape', () => {
    const { container } = renderWidget(ui());
    const input = openEditor(container);

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(document.activeElement).toBe(screen.getByRole('slider'));
  });

  it('opens the input when Enter is pressed on the slider control', () => {
    renderWidget(ui());
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'Enter' });

    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-label')).toBe(`${label} value`);
    expect(document.activeElement).toBe(input);
  });

  it('still resets to the default on double-click of the control itself', () => {
    const { container, sent } = renderWidget(ui(), { [channel]: 1200 });
    const slider = screen.getByRole('slider');

    fireEvent.doubleClick(slider);

    expect(sent.at(-1)).toEqual([channel, 1000]);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(valueText(container).textContent).toBe('1000');
  });
});

describe('value editing specifics', () => {
  it('snaps a typed value to the nearest step (Knob step 10 from min 100)', () => {
    const { container, sent } = renderWidget(<Knob def={knobDef} />);
    const input = openEditor(container);

    fireEvent.change(input, { target: { value: '1507' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(sent.at(-1)).toEqual(['cutoff', 1510]);
  });

  it('applies a value typed on blur', () => {
    const { container, sent } = renderWidget(<TextFader def={faderDef} />);
    const input = openEditor(container);

    fireEvent.change(input, { target: { value: '4321' } });
    fireEvent.blur(input);

    expect(sent.at(-1)).toEqual(['freq', 4321]);
  });
});
