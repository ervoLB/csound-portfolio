/**
 * CodeMirror 6 editor for CSD files. Loaded lazily (its own chunk) by the player.
 */
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentUnit } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
  type Tooltip,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { csound } from './csoundLanguage';
import { metaCompletionSource, opcodeCompletionSource } from './completions';
import { lookupOpcode, manualUrl } from './opcodeCatalog';

export interface EditorDiagnostic {
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  columns?: [number, number];
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** Ctrl/Cmd+Enter. */
  onRun?: () => void;
  diagnostics?: EditorDiagnostic[];
  ariaLabel?: string;
  readOnly?: boolean;
  onFocusChange?: (focused: boolean) => void;
}

const opcodeHover = hoverTooltip((view, pos): Tooltip | null => {
  const word = view.state.wordAt(pos);
  if (!word) return null;
  const entry = lookupOpcode(view.state.sliceDoc(word.from, word.to));
  if (!entry) return null;
  return {
    pos: word.from,
    end: word.to,
    above: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cp-editor-doc';
      const title = document.createElement('strong');
      title.textContent = entry.name;
      dom.append(title);
      if (entry.purpose) {
        const p = document.createElement('p');
        p.textContent = entry.purpose;
        dom.append(p);
      }
      for (const line of (entry.syntax ?? []).slice(0, 4)) {
        const code = document.createElement('code');
        code.textContent = line;
        dom.append(code);
      }
      const url = manualUrl(entry);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Csound manual';
        dom.append(a);
      }
      return { dom };
    },
  };
});

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--cp-text)',
    backgroundColor: 'var(--cp-editor-bg)',
    fontSize: 'var(--cp-editor-font-size, 13px)',
  },
  '.cm-scroller': { fontFamily: 'var(--cp-mono)', lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--cp-accent)', padding: '8px 0' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--cp-accent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-gutters': {
    backgroundColor: 'var(--cp-editor-bg)',
    color: 'var(--cp-muted)',
    borderRight: '1px solid var(--cp-border)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--cp-editor-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--cp-editor-active-line)', color: 'var(--cp-text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--cp-editor-selection) !important',
  },
  '.cm-matchingBracket': { backgroundColor: 'var(--cp-accent-soft)', outline: 'none' },
  '.cm-tooltip': {
    backgroundColor: 'var(--cp-surface)',
    color: 'var(--cp-text)',
    border: '1px solid var(--cp-border)',
    borderRadius: 'var(--cp-radius-sm)',
    boxShadow: 'var(--cp-shadow)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--cp-accent)',
    color: 'var(--cp-on-accent)',
  },
  '.cm-completionDetail': { fontFamily: 'var(--cp-mono)', opacity: '0.75', marginLeft: '8px' },
  '.cm-panels': { backgroundColor: 'var(--cp-surface-2)', color: 'var(--cp-text)' },
  '.cm-searchMatch': { backgroundColor: 'var(--cp-syn-meta-bg)' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--cp-danger)' },
  '.cm-diagnostic-warning': { borderLeftColor: 'var(--cp-warn)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--cp-danger)' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--cp-warn)' },
});

function toCmDiagnostics(state: EditorState, diagnostics: EditorDiagnostic[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const d of diagnostics) {
    if (d.line < 1 || d.line > state.doc.lines) continue;
    const line = state.doc.line(d.line);
    let from = line.from;
    let to = line.to;
    if (d.columns) {
      from = Math.min(line.to, line.from + Math.max(0, d.columns[0] - 1));
      to = Math.min(line.to, line.from + Math.max(d.columns[0], d.columns[1]));
    } else {
      // Underline the code, not the leading indentation.
      const indent = line.text.length - line.text.trimStart().length;
      from = line.from + indent;
    }
    if (to <= from) to = Math.min(line.to, from + 1);
    out.push({ from, to, severity: d.severity, message: d.message, source: 'Csound' });
  }
  return out;
}

export function CodeEditor({ value, onChange, onRun, diagnostics = [], ariaLabel = 'Csound code', readOnly = false, onFocusChange }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onRun, onFocusChange });
  callbacks.current = { onChange, onRun, onFocusChange };

  useEffect(() => {
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      indentUnit.of('  '),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      autocompletion({ override: [metaCompletionSource, opcodeCompletionSource], activateOnTyping: true }),
      lintGutter(),
      opcodeHover,
      csound(),
      editorTheme,
      EditorView.lineWrapping,
      // Explicit tabindex: keyboard users can always reach (and scroll) the code.
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel, tabindex: '0' }),
      EditorState.readOnly.of(readOnly),
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            preventDefault: true,
            run: () => {
              callbacks.current.onRun?.();
              return true;
            },
          },
        ]),
      ),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) callbacks.current.onChange?.(update.state.doc.toString());
        if (update.focusChanged) callbacks.current.onFocusChange?.(update.view.hasFocus);
      }),
    ];
    const v = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: host.current! });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once; value/diagnostics are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ariaLabel, readOnly]);

  // External value changes (load another instrument, reset) replace the document.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch(setDiagnostics(v.state, toCmDiagnostics(v.state, diagnostics)));
  }, [diagnostics, value]);

  return <div ref={host} className="cp-editor" />;
}

export default CodeEditor;
