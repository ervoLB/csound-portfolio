/**
 * The player: toolbar, code editor, widget board and Csound console around the
 * shared engine. Used by the <csound-player> element and by createPlayer().
 */
import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { CsoundEngine, type EngineState, type PlayResult } from '../engine/CsoundEngine';
import { classifyLine, diagnosticsFromLog, type LogDiagnostic } from '../engine/csoundLog';
import { isCsd } from '../engine/csdText';
import { detectMidi } from '../engine/midiDetect';
import { onWasmProgress } from '../engine/wasmLoader';
import { connectWebMidi, webMidiSupported, type MidiConnection } from '../engine/webMidi';
import { inputChannelDefaults, outputChannels, parseInstrument, parseWidgets } from '../meta';
import type { InstrumentMeta, MetaIssue, WidgetDef } from '../meta/types';
import { ChannelStore, ChannelStoreContext } from '../widgets/runtime';
import { Console, type ConsoleLine } from './Console';
import { claimEngine, engineOwner, onOwnerChange } from './engineOwner';
import { OutputLevel } from './OutputLevel';
import { createQwertyState, qwertyKeyDown, qwertyKeyUp, qwertyReleaseAll } from './qwertyMidi';
import { hasPref, readNumberPref, readPref, writePref } from './storage';
import { MoreMenu, type MoreMenuItem } from './MoreMenu';
import { WidgetBoard, type WidgetControls } from './WidgetBoard';

const CodeEditor = lazy(() => import('../editor/CodeEditor'));

export type BoardPosition = 'right' | 'bottom' | 'hidden';
export type EditorMode = 'open' | 'collapsed' | 'hidden';
/** `full`: every action in the toolbar. `minimal`: text commands, a More menu and a status line. */
export type PlayerChrome = 'full' | 'minimal';
export type { WidgetControls };
export type PlayerEventType = 'cp-ready' | 'cp-state' | 'cp-error' | 'cp-ended';

export interface PlayerShellProps {
  /** URL of the CSD to load. */
  src?: string;
  /** Title shown in the toolbar (defaults to @INSTRUMENT name, then the file name). */
  title?: string;
  board?: BoardPosition;
  editor?: EditorMode;
  chrome?: PlayerChrome;
  /** `text` draws knobs, sliders and meters as character cells (and adds the keyboard's text picture). */
  controls?: WidgetControls;
  engine?: CsoundEngine;
  onEvent?: (type: PlayerEventType, detail: Record<string, unknown>) => void;
}

export type LoadSource = string | { code: string; title?: string; url?: string };

export interface PlayerHandle {
  load(source: LoadSource): Promise<boolean>;
  play(): Promise<PlayResult | null>;
  stop(): Promise<void>;
  run(): Promise<PlayResult | null>;
  readonly state: PlayerState;
}

export type PlayerState = 'empty' | 'loading' | 'ready' | EngineState;

interface Analysis {
  widgets: WidgetDef[];
  meta: InstrumentMeta | null;
  issues: MetaIssue[];
  midi: boolean;
}

function analyse(code: string): Analysis {
  const w = parseWidgets(code);
  const i = parseInstrument(code);
  return {
    widgets: w.widgets,
    meta: i.meta,
    issues: [...w.issues, ...i.issues],
    midi: detectMidi(code, i.meta?.midi).enabled,
  };
}

const EMPTY_ANALYSIS: Analysis = { widgets: [], meta: null, issues: [], midi: false };

/** Last path segment of a URL, decoded when possible (malformed escapes are kept as-is). */
function lastSegment(url: string): string {
  const raw = url.split(/[?#]/)[0].split('/').pop() ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function fileTitle(url: string | null): string {
  if (!url) return 'Untitled';
  const base = lastSegment(url).replace(/\.csd$/i, '');
  const words = base.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Untitled';
}

function fileName(url: string | null, title: string): string {
  const fromUrl = url ? lastSegment(url) : '';
  if (/\.csd$/i.test(fromUrl)) return fromUrl;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'instrument';
  return `${slug}.csd`;
}

const STATUS_TEXT: Record<PlayerState, string> = {
  empty: 'No instrument',
  loading: 'Loading…',
  ready: 'Ready',
  idle: 'Ready',
  starting: 'Starting Csound…',
  compiling: 'Compiling…',
  playing: 'Playing',
  stopped: 'Stopped',
  ended: 'Finished',
  error: 'Error',
};

const MAX_CONSOLE_LINES = 500;

/**
 * Whether the viewer's saved choice for `key` applies. It is remembered together with
 * the page's default at the time; when the page changes its default (another layout,
 * a new portfolio.json setting), the page's new default wins again.
 */
function savedFor(key: 'board' | 'editor', pageDefault: string): boolean {
  if (!hasPref(key) || !hasPref(`${key}-default`)) return false;
  return readPref(`${key}-default`, ['right', 'bottom', 'hidden', 'open', 'collapsed'] as const, 'right') === pageDefault;
}

export const PlayerShell = forwardRef<PlayerHandle, PlayerShellProps>(function PlayerShell(props, ref) {
  const engine = props.engine ?? CsoundEngine.shared();
  const id = useRef(Symbol('player')).current;
  const onEvent = useRef(props.onEvent);
  onEvent.current = props.onEvent;

  // ---- document ----------------------------------------------------------------
  const [url, setUrl] = useState<string | null>(null);
  const [original, setOriginal] = useState('');
  const [code, setCode] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const codeRef = useRef('');
  codeRef.current = code;
  const loadToken = useRef(0);

  // Widgets follow the editor with a short delay; loading a file updates immediately.
  const [analysis, setAnalysis] = useState<Analysis>(EMPTY_ANALYSIS);
  useEffect(() => {
    const timer = setTimeout(() => setAnalysis(analyse(code)), 300);
    return () => clearTimeout(timer);
  }, [code]);

  const title = props.title ?? analysis.meta?.name ?? fileTitle(url);

  // ---- engine state (only while this player owns the engine) -------------------
  const [engineState, setEngineState] = useState<EngineState>('idle');
  const [engineError, setEngineError] = useState<string | undefined>();
  const [isOwner, setIsOwner] = useState(engineOwner() === id);
  const [wasmPct, setWasmPct] = useState<number | null>(null);
  // True between a play() request and its result. The engine can be "starting" just
  // because the first click on the page unlocked audio; that alone isn't playback.
  const [playPending, setPlayPending] = useState(false);
  const runningCode = useRef<string | null>(null);
  const [runInfo, setRunInfo] = useState<{ sr: number; ksmps: number; nchnls: number } | null>(null);

  const store = useMemo(() => new ChannelStore(), []);
  store.onInput = (channel, value) => {
    if (engineOwner() === id && engine.state === 'playing') engine.setChannel(channel, value);
  };
  store.onMidi = (status, d1, d2) => {
    if (engineOwner() === id) engine.midi(status, d1, d2);
  };

  // ---- console -------------------------------------------------------------------
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [suppressed, setSuppressed] = useState(0);
  const [runDiagnostics, setRunDiagnostics] = useState<LogDiagnostic[]>([]);
  const lineId = useRef(0);
  const runLog = useRef<string[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);

  const appendLines = useCallback((texts: string[], level?: ConsoleLine['level']) => {
    if (texts.length === 0) return;
    setLines((prev) => {
      const next = prev.concat(texts.map((text) => ({ id: ++lineId.current, text, level: level ?? classifyLine(text) })));
      return next.length > MAX_CONSOLE_LINES ? next.slice(next.length - MAX_CONSOLE_LINES) : next;
    });
  }, []);

  // ---- layout preferences (a viewer's saved choice wins over the attribute default) --
  const boardAttr = props.board ?? 'right';
  const editorAttr = props.editor ?? 'open';
  const [boardPos, setBoardPos] = useState<'right' | 'bottom'>(() =>
    boardAttr === 'hidden' ? 'right' : savedFor('board', boardAttr) ? readPref('board', ['right', 'bottom'] as const, 'right') : boardAttr,
  );
  const [editorOpen, setEditorOpen] = useState<boolean>(() =>
    editorAttr === 'hidden' ? false : savedFor('editor', editorAttr) ? readPref('editor', ['open', 'collapsed'] as const, 'open') === 'open' : editorAttr === 'open',
  );
  const [boardSize, setBoardSize] = useState(() => ({
    right: readNumberPref('board-width', 340, 220, 900),
    bottom: readNumberPref('board-height', 280, 140, 900),
  }));
  const [volume, setVolume] = useState(() => readNumberPref('volume', 0.8, 0, 1));
  useEffect(() => engine.setVolume(volume), [engine, volume]);

  // Attribute changes after mount (e.g. setAttribute('board', 'bottom')) apply immediately.
  const firstLayout = useRef(true);
  useEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    if (boardAttr !== 'hidden') setBoardPos(boardAttr);
    if (editorAttr !== 'hidden') setEditorOpen(editorAttr === 'open');
  }, [boardAttr, editorAttr]);

  const boardVisible = boardAttr !== 'hidden';
  const editorVisible = editorAttr !== 'hidden' && editorOpen;

  // ---- engine events --------------------------------------------------------------
  useEffect(() => {
    const offState = engine.on('state', ({ state, error }) => {
      if (engineOwner() !== id) return;
      setEngineState(state);
      setEngineError(error);
      onEvent.current?.('cp-state', { state, error });
      if (state === 'error') {
        setConsoleOpen(true);
        onEvent.current?.('cp-error', { message: error ?? 'Unknown error' });
      }
      if (state === 'ended') onEvent.current?.('cp-ended', {});
    });
    const offLog = engine.on('log', ({ lines: newLines, suppressed: hidden }) => {
      if (engineOwner() !== id) return;
      appendLines(newLines);
      if (hidden) setSuppressed((n) => n + hidden);
      runLog.current.push(...newLines);
      if (runLog.current.length > 2000) runLog.current.splice(0, runLog.current.length - 2000);
      if (newLines.some((l) => classifyLine(l) !== 'info')) setRunDiagnostics(diagnosticsFromLog(runLog.current));
    });
    const offChannels = engine.on('channels', ({ values }) => {
      if (engineOwner() === id) store.publish(values);
    });
    const offOwner = onOwnerChange((owner) => {
      const mine = owner === id;
      setIsOwner(mine);
      // The engine may already be starting (the first click's pointerdown unlocks audio
      // before this player claims it): adopt its current state.
      if (mine) {
        setEngineState(engine.state);
        setEngineError(engine.error);
      } else {
        setEngineState((s) => (s === 'idle' ? s : 'stopped'));
        qwertyReleaseAll(qwerty.current, () => {});
      }
    });
    const offWasm = onWasmProgress((p) => setWasmPct(p.status === 'loading' ? Math.round(p.fraction * 100) : null));
    return () => {
      offState();
      offLog();
      offChannels();
      offOwner();
      offWasm();
    };
  }, [engine, id, store, appendLines]);

  // ---- actions --------------------------------------------------------------------
  const unlockIfGesture = useCallback(() => {
    // Only inside a real user gesture; otherwise the page-wide gesture listener does it.
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (activation?.isActive === true) engine.unlock().catch(() => {});
  }, [engine]);

  const stop = useCallback(async () => {
    if (engineOwner() === id) await engine.stop();
  }, [engine, id]);

  const play = useCallback(async (): Promise<PlayResult | null> => {
    const text = codeRef.current;
    if (!text) return null;
    claimEngine(id);
    const a = analyse(text);
    setAnalysis(a);
    // Keep the user's widget values for channels that still exist; new ones get defaults.
    const defaults = inputChannelDefaults(a.widgets);
    const current = store.snapshot();
    const channels: Record<string, number> = { ...defaults };
    for (const name of Object.keys(defaults)) if (name in current) channels[name] = current[name];
    store.reset(channels);
    engine.watch(outputChannels(a.widgets));
    runLog.current = [];
    setRunDiagnostics([]);
    appendLines([`▶ ${props.title ?? a.meta?.name ?? fileTitle(url)}`], 'system');
    setPlayPending(true);
    const promise = engine.play(text, { midi: a.meta?.midi, channels }); // unlocks audio synchronously (user gesture)
    let result: PlayResult;
    try {
      result = await promise;
    } finally {
      setPlayPending(false);
    }
    if (result.ok) {
      runningCode.current = text;
      setRunInfo({ sr: result.sr, ksmps: result.ksmps, nchnls: result.nchnls });
      if (result.removedOptions.length > 0) {
        appendLines([`Ignored options that don't apply in the browser: ${result.removedOptions.join(' ')}`], 'system');
      }
    } else if (!result.superseded) {
      runningCode.current = null;
      setConsoleOpen(true);
    }
    return result;
  }, [engine, id, store, appendLines, props.title, url]);

  const load = useCallback(
    async (source: LoadSource): Promise<boolean> => {
      unlockIfGesture();
      const token = ++loadToken.current;
      let text: string;
      let srcUrl: string | null = null;
      setLoading(true);
      setLoadError(null);
      try {
        if (typeof source === 'string') {
          srcUrl = source;
          const response = await fetch(source);
          if (!response.ok) throw new Error(`Couldn't load ${source} (HTTP ${response.status}).`);
          text = await response.text();
        } else {
          text = source.code;
          srcUrl = source.url ?? null;
        }
        if (!isCsd(text)) throw new Error('This file is not a CSD: it needs <CsoundSynthesizer> and <CsInstruments> sections.');
      } catch (error) {
        if (token !== loadToken.current) return false;
        const message = error instanceof Error ? error.message : String(error);
        setLoading(false);
        setLoadError(message);
        onEvent.current?.('cp-error', { message });
        return false;
      }
      if (token !== loadToken.current) return false;
      // Loading into any player stops whatever is playing (in this or another player).
      claimEngine(id);
      if (engine.busy) await engine.stop();
      if (token !== loadToken.current) return false; // a newer load started while stopping
      const a = analyse(text);
      store.reset(inputChannelDefaults(a.widgets));
      setUrl(srcUrl);
      setOriginal(text);
      setCode(text);
      codeRef.current = text;
      setAnalysis(a);
      setLoading(false);
      runningCode.current = null;
      setRunInfo(null);
      setRunDiagnostics([]);
      onEvent.current?.('cp-ready', { title: props.title ?? a.meta?.name ?? fileTitle(srcUrl), url: srcUrl });
      return true;
    },
    [engine, id, store, unlockIfGesture, props.title],
  );

  // Load the `src` attribute.
  useEffect(() => {
    if (props.src) void load(props.src);
  }, [props.src, load]);

  // Stop this player's sound when it is removed from the page.
  useEffect(() => () => void stop(), [stop]);

  const state: PlayerState = loading ? 'loading' : !code ? 'empty' : isOwner ? engineState : 'ready';
  const playing = state === 'playing' || state === 'compiling' || (state === 'starting' && playPending);
  const modified = playing && runningCode.current !== null && code !== runningCode.current;

  useImperativeHandle(ref, () => ({ load, play, stop, run: play, state }), [load, play, stop, state]);

  // ---- MIDI input: computer keyboard and devices ----------------------------------
  const qwerty = useRef(createQwertyState());
  const midiActive = isOwner && state === 'playing' && analysis.midi;
  const sendMidi = useCallback((s: number, d1: number, d2: number) => store.midi(s, d1, d2), [store]);
  useEffect(() => {
    if (!midiActive) qwertyReleaseAll(qwerty.current, sendMidi);
  }, [midiActive, sendMidi]);

  const [midiDevices, setMidiDevices] = useState<string[] | null>(null);
  const [midiError, setMidiError] = useState<string | null>(null);
  const midiConnection = useRef<MidiConnection | null>(null);
  useEffect(() => () => midiConnection.current?.disconnect(), []);
  const connectMidi = useCallback(async () => {
    setMidiError(null);
    try {
      midiConnection.current?.disconnect();
      midiConnection.current = await connectWebMidi(sendMidi, setMidiDevices);
      setMidiDevices(midiConnection.current.inputs);
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : String(error));
    }
  }, [sendMidi]);

  // Keyboard inside the player: Escape stops the sound; letter keys play notes on
  // MIDI instruments (not while typing in the editor or a form field).
  const isTypingTarget = (target: HTMLElement) =>
    Boolean(target.closest('.cm-editor, input, select, textarea, [contenteditable="true"]'));

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (isTypingTarget(target)) return;
    if (event.key === 'Escape' && playing) {
      void stop();
      return;
    }
    if (!midiActive) return;
    if (qwertyKeyDown(qwerty.current, event, sendMidi)) event.preventDefault();
  };
  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (qwertyKeyUp(qwerty.current, event, sendMidi)) event.preventDefault();
  };
  // Release held notes when focus leaves the player or the window.
  useEffect(() => {
    if (!midiActive) return;
    const release = () => qwertyReleaseAll(qwerty.current, sendMidi);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('blur', release);
      release();
    };
  }, [midiActive, sendMidi]);

  // ---- splitter --------------------------------------------------------------------
  const mainRef = useRef<HTMLDivElement>(null);
  const resizeBoard = useCallback(
    (size: number) => {
      const key = boardPos === 'right' ? 'right' : 'bottom';
      const clamped = Math.round(Math.max(key === 'right' ? 220 : 140, Math.min(900, size)));
      setBoardSize((s) => ({ ...s, [key]: clamped }));
      writePref(key === 'right' ? 'board-width' : 'board-height', clamped);
    },
    [boardPos],
  );
  const onSplitterPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const el = event.currentTarget;
    el.setPointerCapture?.(event.pointerId);
    const rect = mainRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Matches the container query in shell.css: narrow players stack the board above the editor.
    const narrow = rect.width <= 720;
    const move = (e: PointerEvent) =>
      resizeBoard(narrow ? e.clientY - rect.top : boardPos === 'right' ? rect.right - e.clientX : rect.bottom - e.clientY);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const currentBoardSize = boardPos === 'right' ? boardSize.right : boardSize.bottom;
  const onSplitterKey = (event: ReactKeyboardEvent) => {
    const grow = boardPos === 'right' ? ['ArrowLeft'] : ['ArrowUp'];
    const shrink = boardPos === 'right' ? ['ArrowRight'] : ['ArrowDown'];
    if (grow.includes(event.key)) resizeBoard(currentBoardSize + 24);
    else if (shrink.includes(event.key)) resizeBoard(currentBoardSize - 24);
    else return;
    event.preventDefault();
  };

  // ---- other actions ---------------------------------------------------------------
  const download = () => {
    const blob = new Blob([codeRef.current], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName(url, title);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const editorDiagnostics = useMemo(
    () => [
      ...analysis.issues.map((i) => ({ line: i.line, severity: i.severity, message: i.message })),
      ...runDiagnostics,
    ],
    [analysis.issues, runDiagnostics],
  );
  const errorCount = lines.filter((l) => l.level === 'error').length;

  let statusText = STATUS_TEXT[state];
  if (state === 'starting' && !playPending) statusText = 'Ready';
  if (state === 'starting' && playPending && wasmPct !== null) statusText = `Loading Csound… ${wasmPct}%`;
  if (state === 'error' && engineError) statusText = 'Error';
  const showMidiButton = analysis.midi && webMidiSupported() && isOwner && state === 'playing';
  const minimal = props.chrome === 'minimal';
  const controls: WidgetControls = props.controls === 'text' ? 'text' : 'graphic';
  const edited = code !== original;
  const midiLabel =
    midiDevices === null ? 'Connect MIDI' : midiDevices.length ? `MIDI: ${midiDevices.length} device${midiDevices.length > 1 ? 's' : ''}` : 'No MIDI devices';
  const midiTitle = midiDevices?.length ? `Connected: ${midiDevices.join(', ')}` : 'Use a MIDI keyboard connected to this computer';
  const toggleEditor = () => {
    setEditorOpen((o) => !o);
    writePref('editor', editorOpen ? 'collapsed' : 'open');
    writePref('editor-default', editorAttr);
  };
  const toggleBoardPos = () => {
    const next = boardPos === 'right' ? 'bottom' : 'right';
    setBoardPos(next);
    writePref('board', next);
    writePref('board-default', boardAttr);
  };
  const changeVolume = (v: number) => {
    setVolume(v);
    writePref('volume', v);
  };

  const status = (
    <span className={`cp-status cp-status--${state}`} role="status" title={engineError}>
      <span className="cp-status__dot" aria-hidden="true" />
      {statusText}
    </span>
  );
  const transport = (
    <button
      type="button"
      className={`cp-btn cp-btn--primary cp-btn--transport${playing ? ' is-playing' : ''}`}
      onClick={() => void (playing ? stop() : play())}
      disabled={!code || loading}
      aria-label={playing ? 'Stop' : 'Play'}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="cp-icon">
        {playing ? <rect x="3.5" y="3.5" width="9" height="9" rx="1" /> : <path d="M4.5 2.8v10.4L13 8z" />}
      </svg>
      <span>{playing ? 'Stop' : 'Play'}</span>
    </button>
  );
  const applyButton = modified && (
    <button type="button" className="cp-btn cp-btn--accent-outline cp-btn--apply" onClick={() => void play()} title="Recompile with your changes (Ctrl/⌘ + Enter)">
      Apply changes
    </button>
  );
  const volumeControl = (
    <label className="cp-volume" title="Volume">
      <span className={minimal ? 'cp-volume__text' : 'cp-visually-hidden'}>Volume</span>
      {!minimal && (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="cp-icon">
          <path d="M2 6h3l4-3v10l-4-3H2z" />
        </svg>
      )}
      <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => changeVolume(Number(e.target.value))} />
      {minimal && (
        <span className="cp-volume__value" aria-hidden="true">
          {Math.round(volume * 100)}%
        </span>
      )}
    </label>
  );
  const outputButton = (
    <button type="button" className="cp-btn cp-btn--ghost" aria-pressed={consoleOpen} onClick={() => setConsoleOpen((o) => !o)}>
      Output{errorCount > 0 && <span className="cp-badge cp-badge--error">{errorCount}</span>}
    </button>
  );
  const codeButton = editorAttr !== 'hidden' && (
    <button type="button" className="cp-btn cp-btn--ghost" aria-pressed={editorOpen} onClick={toggleEditor}>
      Code
    </button>
  );

  const moreItems: MoreMenuItem[] = [];
  if (showMidiButton) moreItems.push({ label: midiLabel, title: midiTitle, onSelect: () => void connectMidi() });
  if (boardVisible && editorVisible) {
    moreItems.push({ label: boardPos === 'right' ? 'Controls below the code' : 'Controls next to the code', onSelect: toggleBoardPos });
  }
  moreItems.push({ label: 'Download .csd', title: 'Download the CSD file (with your edits)', onSelect: download, disabled: !code });
  if (edited) moreItems.push({ label: 'Reset code', title: 'Undo all edits', onSelect: () => setCode(original) });

  const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);

  return (
    <div
      className={`cp-player cp-player--board-${boardVisible ? boardPos : 'hidden'}${editorVisible ? '' : ' cp-player--no-editor'}${minimal ? ' cp-player--minimal' : ''} cp-player--controls-${controls}`}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) qwertyReleaseAll(qwerty.current, sendMidi);
      }}
    >
      {minimal ? (
        <div className="cp-toolbar" role="toolbar" aria-label="Player controls">
          {transport}
          {applyButton}
          <div className="cp-toolbar__spacer" />
          <div className="cp-toolbar__group">
            {codeButton}
            {outputButton}
            <MoreMenu items={moreItems}>{volumeControl}</MoreMenu>
          </div>
        </div>
      ) : (
        <div className="cp-toolbar" role="toolbar" aria-label="Player controls">
          {transport}
          {applyButton}
          <div className="cp-toolbar__title">
            <span className="cp-toolbar__name">{code ? title : 'No instrument loaded'}</span>
            {status}
          </div>
          <OutputLevel engine={engine} active={isOwner && playing} />
          {volumeControl}
          {showMidiButton && (
            <button type="button" className="cp-btn cp-btn--ghost" onClick={() => void connectMidi()} title={midiTitle}>
              {midiLabel}
            </button>
          )}
          <div className="cp-toolbar__spacer" />
          <div className="cp-toolbar__group">
            {codeButton}
            {boardVisible && editorVisible && (
              <button
                type="button"
                className="cp-btn cp-btn--ghost"
                title={boardPos === 'right' ? 'Move controls below the code' : 'Move controls next to the code'}
                onClick={toggleBoardPos}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="cp-icon">
                  {boardPos === 'right' ? (
                    <path d="M2 2.5h12v11H2zM2 10h12" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  ) : (
                    <path d="M2 2.5h12v11H2zM10 2.5v11" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  )}
                </svg>
                <span>{boardPos === 'right' ? 'Controls below' : 'Controls right'}</span>
              </button>
            )}
            {outputButton}
            <button type="button" className="cp-btn cp-btn--ghost" onClick={download} disabled={!code} title="Download the CSD file (with your edits)">
              Download
            </button>
            {edited && (
              <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setCode(original)} title="Undo all edits">
                Reset code
              </button>
            )}
          </div>
        </div>
      )}
      {midiError && (
        <p className="cp-notice cp-notice--warn" role="alert">
          {midiError}
        </p>
      )}

      <div className="cp-player__main" ref={mainRef} style={{ ['--cp-board-size' as string]: `${currentBoardSize}px` }}>
        {loadError ? (
          <div className="cp-player__message" role="alert">
            <p>{loadError}</p>
            {props.src && (
              <button type="button" className="cp-btn" onClick={() => void load(props.src!)}>
                Try again
              </button>
            )}
          </div>
        ) : !code ? (
          <div className="cp-player__message">
            <p>{loading ? 'Loading instrument…' : 'Choose an instrument to start.'}</p>
          </div>
        ) : (
          <>
            {editorVisible && (
              <div className="cp-player__editor">
                <Suspense fallback={<pre className="cp-editor cp-editor--loading">{code}</pre>}>
                  <CodeEditor value={code} onChange={setCode} onRun={() => void play()} diagnostics={editorDiagnostics} ariaLabel={`${title} code`} />
                </Suspense>
              </div>
            )}
            {editorVisible && boardVisible && (
              <div
                className="cp-splitter"
                role="separator"
                tabIndex={0}
                aria-orientation={boardPos === 'right' ? 'vertical' : 'horizontal'}
                aria-label="Resize controls"
                aria-valuenow={currentBoardSize}
                aria-valuemin={boardPos === 'right' ? 220 : 140}
                aria-valuemax={900}
                onPointerDown={onSplitterPointerDown}
                onKeyDown={onSplitterKey}
              />
            )}
            {boardVisible && (
              <div className="cp-player__board">
                <ChannelStoreContext.Provider value={store}>
                  <WidgetBoard widgets={analysis.widgets} position={editorVisible ? boardPos : 'bottom'} midiEnabled={analysis.midi} controls={controls} />
                </ChannelStoreContext.Provider>
              </div>
            )}
          </>
        )}
      </div>

      {minimal && (
        <div className="cp-statusline">
          {status}
          <span className="cp-statusline__file">
            {code ? fileName(url, title) : '—'}
            {edited && (
              <span className="cp-statusline__modified" title="Edited">
                [+]
              </span>
            )}
          </span>
          {runInfo && (
            <span className="cp-statusline__info">
              {runInfo.sr} Hz · ksmps {runInfo.ksmps} · {runInfo.nchnls} ch{analysis.midi ? ' · midi' : ''}
            </span>
          )}
          <span className="cp-statusline__spacer" />
          <span className="cp-statusline__keys" aria-hidden="true">
            {playing && <span className="cp-statusline__esc">esc stop{editorVisible ? ' · ' : ''}</span>}
            {editorVisible ? `${isMac ? '⌘' : 'ctrl'}+enter ${playing ? 'apply' : 'run'}` : ''}
          </span>
          <OutputLevel engine={engine} active={isOwner && playing} variant="text" />
        </div>
      )}
      {consoleOpen && (
        <Console
          lines={lines}
          suppressed={suppressed}
          onClear={() => {
            setLines([]);
            setSuppressed(0);
          }}
        />
      )}
    </div>
  );
});
