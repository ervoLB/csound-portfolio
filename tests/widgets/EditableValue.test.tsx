// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditableValue, parseTypedValue, type EditableValueProps } from '../../player/widgets/EditableValue';

function props(overrides: Partial<EditableValueProps> = {}): EditableValueProps {
  return {
    display: '1500',
    value: 1500,
    editing: false,
    onStart: vi.fn(),
    onDone: vi.fn(),
    label: 'Cutoff',
    ...overrides,
  };
}

describe('parseTypedValue', () => {
  it('parses plain, padded, comma-decimal and exponent numbers', () => {
    expect(parseTypedValue('1500')).toBe(1500);
    expect(parseTypedValue(' 0,25 ')).toBe(0.25);
    expect(parseTypedValue('-3e2')).toBe(-300);
  });

  it('rejects empty and non-numeric text', () => {
    expect(parseTypedValue('')).toBeNull();
    expect(parseTypedValue('   ')).toBeNull();
    expect(parseTypedValue('abc')).toBeNull();
    expect(parseTypedValue('1.2.3')).toBeNull();
    expect(parseTypedValue('Infinity')).toBeNull();
  });
});

describe('EditableValue', () => {
  it('shows the display text with a hint and starts editing on double-click', () => {
    const p = props();
    render(<EditableValue {...p} />);

    const text = screen.getByText('1500');
    expect(text.className).toContain('cp-widget__value');
    expect(text.className).toContain('cp-value');
    expect(text.getAttribute('title')).toBe('Double-click to type a value');

    fireEvent.doubleClick(text);
    expect(p.onStart).toHaveBeenCalledTimes(1);
  });

  it('shows a focused field with the display text selected while editing', () => {
    render(<EditableValue {...props({ editing: true })} />);

    const input = screen.getByRole('textbox', { name: 'Cutoff value' });
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect((input as HTMLInputElement).value).toBe('1500');
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe(4);
  });

  it('falls back to "Control value" when there is no label', () => {
    render(<EditableValue {...props({ editing: true, label: '' })} />);
    expect(screen.getByRole('textbox', { name: 'Control value' })).toBeTruthy();
  });

  it('reports the typed number on Enter', () => {
    const p = props({ editing: true });
    render(<EditableValue {...p} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: ' 0,25 ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(p.onDone).toHaveBeenCalledTimes(1);
    expect(p.onDone).toHaveBeenCalledWith(0.25, 'enter');
  });

  it('keeps the field open and marks it invalid when Enter gets no number', () => {
    const p = props({ editing: true });
    render(<EditableValue {...p} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(p.onDone).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.input(input, { target: { value: '12' } });
    expect(input.getAttribute('aria-invalid')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onDone).toHaveBeenCalledWith(12, 'enter');
  });

  it('starts from the exact value, not the rounded display', () => {
    render(<EditableValue {...props({ editing: true, display: '120.5', value: 120.456 })} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('120.456');
  });

  it('accepts only plain decimal numbers', () => {
    expect(parseTypedValue('.5')).toBe(0.5);
    expect(parseTypedValue('+2,5')).toBe(2.5);
    for (const bad of ['1,234,5', '0x10', '1e', '--1', '1 000']) expect(parseTypedValue(bad), bad).toBeNull();
  });

  it('reports null on Escape and keeps the keydown away from ancestors', () => {
    const p = props({ editing: true });
    const ancestor = vi.fn();
    render(
      <div onKeyDown={ancestor}>
        <EditableValue {...p} />
      </div>,
    );
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '1500' } });
    const notCancelled = fireEvent.keyDown(input, { key: 'Escape' });

    expect(p.onDone).toHaveBeenCalledTimes(1);
    expect(p.onDone).toHaveBeenCalledWith(null, 'escape');
    expect(ancestor).not.toHaveBeenCalled();
    expect(notCancelled).toBe(false); // preventDefault was called
  });

  it('reports the parsed value on blur', () => {
    const p = props({ editing: true });
    render(<EditableValue {...p} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '-3e2' } });
    fireEvent.blur(input);

    expect(p.onDone).toHaveBeenCalledTimes(1);
    expect(p.onDone).toHaveBeenCalledWith(-300, 'blur');
  });

  it('reports an invalid entry as null on blur', () => {
    const p = props({ editing: true });
    render(<EditableValue {...p} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '1.2.3' } });
    fireEvent.blur(input);

    expect(p.onDone).toHaveBeenCalledWith(null, 'blur');
  });

  it('finishes only once when Enter is followed by a blur', () => {
    const p = props({ editing: true });
    render(<EditableValue {...p} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(p.onDone).toHaveBeenCalledTimes(1);
    expect(p.onDone).toHaveBeenCalledWith(1500, 'enter');
  });

  it('hides the text when not editing and hidden, but still edits', () => {
    const { container } = render(<EditableValue {...props({ hidden: true })} />);
    expect(container.querySelector('.cp-value')).toBeNull();
    expect(screen.queryByText('1500')).toBeNull();

    const editing = props({ editing: true, hidden: true });
    const { container: editingContainer } = render(<EditableValue {...editing} />);
    expect(editingContainer.querySelector('.cp-value')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Cutoff value' })).toBeTruthy();
  });
});
