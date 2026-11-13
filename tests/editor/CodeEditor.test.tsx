// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { forEachDiagnostic, type Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { CodeEditor, type EditorDiagnostic } from '../../player/editor/CodeEditor';

function findView(container: HTMLElement): EditorView {
  const content = container.querySelector('.cm-content');
  expect(content).toBeInstanceOf(HTMLElement);
  const view = EditorView.findFromDOM(content as HTMLElement);
  expect(view).not.toBeNull();
  return view!;
}

function linesOf(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('.cm-line')].map((line) => line.textContent);
}

function pressEnter(content: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    ...init,
  });
  content.dispatchEvent(event);
  return event;
}

function diagnosticsIn(view: EditorView): Diagnostic[] {
  const found: Diagnostic[] = [];
  forEachDiagnostic(view.state, (diagnostic) => found.push(diagnostic));
  return found;
}

describe('CodeEditor', () => {
  it('shows the initial value', () => {
    const value = 'instr 1\n  out 1\nendin';
    const { container } = render(<CodeEditor value={value} />);

    const view = findView(container);
    expect(view.state.doc.toString()).toBe(value);
    expect(linesOf(container)).toEqual(['instr 1', '  out 1', 'endin']);
  });

  it('exposes the default aria label', () => {
    const { container } = render(<CodeEditor value="" />);
    expect(container.querySelector('.cm-content')!.getAttribute('aria-label')).toBe('Csound code');
  });

  it('calls onChange when the document is edited through the view', () => {
    const onChange = vi.fn();
    const { container } = render(<CodeEditor value="instr 1" onChange={onChange} />);
    const view = findView(container);

    act(() => {
      view.dispatch({ changes: { from: 0, insert: '; ' } });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('; instr 1');
    expect(view.state.doc.toString()).toBe('; instr 1');
  });

  // jsdom reports a non-Mac platform, so CodeMirror binds "Mod" to Ctrl here.
  // The Meta variant is covered in CodeEditor.mac.test.tsx.
  it('calls onRun for Mod-Enter (Ctrl in this environment)', () => {
    const onRun = vi.fn();
    const { container } = render(<CodeEditor value="instr 1" onRun={onRun} />);
    const content = container.querySelector('.cm-content')!;

    const ctrlEnter = pressEnter(content, { ctrlKey: true });
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(ctrlEnter.defaultPrevented).toBe(true);

    pressEnter(content, {});
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('replaces the document when the value prop changes', () => {
    const initial = 'instr 1\nendin';
    const next = 'instr 2\n  out 1\nendin';
    const { container, rerender } = render(<CodeEditor value={initial} />);
    const view = findView(container);
    expect(view.state.doc.toString()).toBe(initial);

    rerender(<CodeEditor value={next} />);

    expect(findView(container)).toBe(view);
    expect(view.state.doc.toString()).toBe(next);
    expect(linesOf(container)).toEqual(['instr 2', '  out 1', 'endin']);
  });

  it('puts error and warning diagnostics in the lint gutter', () => {
    const value = 'instr 1\n  out 1\nendin';
    const diagnostics: EditorDiagnostic[] = [
      { line: 2, severity: 'error', message: 'unknown opcode' },
      { line: 3, severity: 'warning', message: 'deprecated' },
    ];
    const { container } = render(<CodeEditor value={value} diagnostics={diagnostics} />);

    expect(container.querySelectorAll('.cm-lint-marker-error')).toHaveLength(1);
    expect(container.querySelectorAll('.cm-lint-marker-warning')).toHaveLength(1);

    const view = findView(container);
    expect(diagnosticsIn(view)).toMatchObject([
      { severity: 'error', message: 'unknown opcode', source: 'Csound', from: 10, to: 15 },
      { severity: 'warning', message: 'deprecated', source: 'Csound', from: 16, to: 21 },
    ]);
  });

  it('turns diagnostic columns into an underline range', () => {
    const { container } = render(
      <CodeEditor
        value={'a1 oscili 440'}
        diagnostics={[{ line: 1, severity: 'error', message: 'bad', columns: [3, 5] }]}
      />,
    );
    const view = findView(container);
    expect(diagnosticsIn(view)).toMatchObject([{ message: 'bad', from: 2, to: 5 }]);
  });

  it('updates the gutter when the diagnostics prop changes', () => {
    const value = 'instr 1\nendin';
    const { container, rerender } = render(
      <CodeEditor value={value} diagnostics={[{ line: 1, severity: 'error', message: 'bad' }]} />,
    );
    expect(container.querySelectorAll('.cm-lint-marker-error')).toHaveLength(1);

    rerender(<CodeEditor value={value} diagnostics={[]} />);
    expect(container.querySelectorAll('.cm-lint-marker-error')).toHaveLength(0);
    expect(diagnosticsIn(findView(container))).toEqual([]);
  });

  it('ignores out-of-range diagnostic lines without throwing', () => {
    const { container } = render(
      <CodeEditor
        value={'instr 1\nendin'}
        diagnostics={[
          { line: 0, severity: 'error', message: 'before the document' },
          { line: 99, severity: 'warning', message: 'after the document' },
        ]}
      />,
    );

    const view = findView(container);
    expect(diagnosticsIn(view)).toEqual([]);
    expect(container.querySelectorAll('.cm-lint-marker-error')).toHaveLength(0);
    expect(container.querySelectorAll('.cm-lint-marker-warning')).toHaveLength(0);
  });
});
