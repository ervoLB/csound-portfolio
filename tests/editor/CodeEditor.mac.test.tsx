// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { expect, it, vi } from 'vitest';

// @codemirror/view decides what "Mod" means the first time it is imported.
// Pretend to be macOS before that happens, so Mod-Enter is Meta-Enter.
Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });

it('calls onRun for Mod-Enter (Meta on macOS)', async () => {
  const [{ CodeEditor }, { EditorView }] = await Promise.all([
    import('../../player/editor/CodeEditor'),
    import('@codemirror/view'),
  ]);

  const onRun = vi.fn();
  const { container } = render(createElement(CodeEditor, { value: 'instr 1', onRun }));
  const content = container.querySelector('.cm-content')!;
  expect(EditorView.findFromDOM(content as HTMLElement)).not.toBeNull();

  const metaEnter = new KeyboardEvent('keydown', {
    key: 'Enter',
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  content.dispatchEvent(metaEnter);
  expect(onRun).toHaveBeenCalledTimes(1);
  expect(metaEnter.defaultPrevented).toBe(true);

  // Ctrl-Enter is not the "Mod" binding on macOS.
  content.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(onRun).toHaveBeenCalledTimes(1);
});
