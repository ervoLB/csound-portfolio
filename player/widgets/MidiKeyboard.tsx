import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { keyboardArt, WHITE_COLS, type ArtCell } from './keyboardArt';
import { useChannelStore } from './runtime';
import { toFiniteNumber } from './valueMath';
import type { WidgetProps } from './types';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_PITCHES = new Set([1, 3, 6, 8, 10]);
const ACTIVATION_KEYS = new Set([' ', 'Enter', 'Spacebar']);
const MIN_WHITE_KEY_PX = 18;

function noteLabel(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

/** Consecutive cells with the same pressed state become one span. */
function ArtRow({ cells }: { cells: ArtCell[] }) {
  const runs: { text: string; on: boolean }[] = [];
  for (const cell of cells) {
    const last = runs.at(-1);
    if (last && last.on === cell.on) last.text += cell.ch;
    else runs.push({ text: cell.ch, on: cell.on });
  }
  return (
    <>
      {runs.map((run, i) => (run.on ? <b key={i}>{run.text}</b> : run.text))}
      {'\n'}
    </>
  );
}

/**
 * Piano keyboard sending Note On/Off to the shared MIDI output.
 * `art` adds a box-drawing picture of the keys (text controls); the layout's CSS
 * decides whether the picture or the styled buttons are shown.
 */
export function MidiKeyboard({ def, art = false }: WidgetProps & { art?: boolean }) {
  const store = useChannelStore();
  const rawStart = Math.round(toFiniteNumber(def.start_note, 48));
  const rawEnd = Math.round(toFiniteNumber(def.end_note, 72));
  const low = Math.max(0, Math.min(127, Math.min(rawStart, rawEnd)));
  const high = Math.max(0, Math.min(127, Math.max(rawStart, rawEnd)));
  const channel = Math.max(1, Math.min(16, Math.round(toFiniteNumber(def.midi_channel, 1))));
  const statusOn = 0x90 | (channel - 1);
  const statusOff = 0x80 | (channel - 1);
  const showLabels = def.show_labels !== false;
  const label = def.label ?? '';
  const whiteKeyColor = typeof def.whiteKeyColor === 'string' ? def.whiteKeyColor : undefined;
  const blackKeyColor = typeof def.blackKeyColor === 'string' ? def.blackKeyColor : undefined;
  const accentColor = typeof def.accentColor === 'string' ? def.accentColor : undefined;

  const notes = useMemo(() => {
    const list: number[] = [];
    for (let note = low; note <= high; note++) list.push(note);
    return list;
  }, [low, high]);
  const whiteNotes = notes.filter((note) => !BLACK_PITCHES.has(note % 12));
  const blackNotes = notes
    .filter((note) => BLACK_PITCHES.has(note % 12))
    .map((note) => ({ note, whiteBefore: whiteNotes.filter((white) => white < note).length }));
  const whiteCount = Math.max(1, whiteNotes.length);
  const whitePct = 100 / whiteCount;

  // One entry per input source (`p:<pointerId>` or `k:<key>`) so multiple
  // pointers and the keyboard can hold notes at the same time.
  const holds = useRef<Map<string, number>>(new Map());
  const [active, setActive] = useState<Set<number>>(new Set());
  const syncActive = useCallback(() => setActive(new Set(holds.current.values())), []);

  const press = useCallback(
    (source: string, note: number) => {
      const previous = holds.current.get(source);
      if (previous === note) return;
      if (previous !== undefined) store.midi(statusOff, previous, 0); // glissando
      holds.current.set(source, note);
      store.midi(statusOn, note, 100);
      syncActive();
    },
    [store, statusOn, statusOff, syncActive],
  );

  const release = useCallback(
    (source: string) => {
      const note = holds.current.get(source);
      if (note === undefined) return;
      holds.current.delete(source);
      store.midi(statusOff, note, 0);
      syncActive();
    },
    [store, statusOff, syncActive],
  );

  // A key held when the widget disappears must not stay sounding forever.
  useEffect(
    () => () => {
      for (const note of holds.current.values()) store.midi(statusOff, note, 0);
      holds.current.clear();
    },
    [store, statusOff],
  );

  const noteFromTarget = (target: EventTarget | null): number | null => {
    const element = target as Element | null;
    const key = element?.closest?.('[data-note]');
    const note = key ? Number(key.getAttribute('data-note')) : NaN;
    return Number.isFinite(note) ? note : null;
  };

  const noteUnderPointer = (event: ReactPointerEvent<HTMLDivElement>): number | null => {
    const direct = noteFromTarget(event.target);
    if (direct !== null) return direct;
    // With pointer capture the event target is the container, so hit-test.
    try {
      if (typeof document.elementFromPoint === 'function') {
        const key = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-note]');
        const note = key ? Number(key.getAttribute('data-note')) : NaN;
        if (Number.isFinite(note)) return note;
      }
    } catch {
      // No hit-testing available (e.g. jsdom).
    }
    return null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const note = noteUnderPointer(event);
    if (note === null) return;
    event.preventDefault();
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      /* pointer capture is unavailable for synthetic events */
    }
    press(`p:${event.pointerId}`, note);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const source = `p:${event.pointerId}`;
    if (!holds.current.has(source)) return;
    const note = noteUnderPointer(event);
    if (note !== null) press(source, note);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    release(`p:${event.pointerId}`);
    try {
      (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    } catch {
      /* not captured */
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!ACTIVATION_KEYS.has(event.key)) return;
    const note = noteFromTarget(event.target);
    if (note === null) return;
    event.preventDefault();
    if (event.repeat) return;
    press(`k:${event.key}`, note);
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!ACTIVATION_KEYS.has(event.key)) return;
    release(`k:${event.key}`);
  };

  const artRows = art
    ? keyboardArt(whiteNotes, blackNotes, active, (note) => (showLabels && note % 12 === 0 ? noteLabel(note) : null))
    : null;

  const onBlur = () => {
    for (const source of [...holds.current.keys()]) if (source.startsWith('k:')) release(source);
  };

  return (
    <div
      className="cp-widget cp-widget--midi_keyboard"
      title={def.channel_name ? `Channel: ${def.channel_name}` : `MIDI channel: ${channel}`}
    >
      {label && <span className="cp-widget__label">{label}</span>}
      <div
        className={`cp-midi-keyboard${art ? ' cp-midi-keyboard--art' : ''}`}
        role="group"
        aria-label="MIDI keyboard"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={onBlur}
      >
        <div
          className="cp-midi-keyboard__surface"
          style={{ minWidth: `${whiteCount * MIN_WHITE_KEY_PX}px`, ['--cp-art-cols' as string]: whiteCount * WHITE_COLS + 1 }}
        >
          {artRows && (
            <pre className="cp-midi-art" aria-hidden="true">
              {artRows.map((cells, i) => (
                <ArtRow key={i} cells={cells} />
              ))}
            </pre>
          )}
          <div className="cp-midi-keyboard__whites">
            {whiteNotes.map((note) => {
              const isActive = active.has(note);
              return (
                <button
                  key={note}
                  type="button"
                  className="cp-midi-key cp-midi-key--white"
                  data-note={note}
                  data-active={isActive ? 'true' : 'false'}
                  aria-label={noteLabel(note)}
                  aria-pressed={isActive}
                  style={
                    isActive
                      ? accentColor
                        ? { backgroundColor: accentColor }
                        : undefined
                      : whiteKeyColor
                        ? { backgroundColor: whiteKeyColor }
                        : undefined
                  }
                >
                  {showLabels && note % 12 === 0 && (
                    <span className="cp-midi-key__label">{noteLabel(note)}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="cp-midi-keyboard__blacks">
            {blackNotes.map(({ note, whiteBefore }) => {
              const isActive = active.has(note);
              return (
                <button
                  key={note}
                  type="button"
                  className="cp-midi-key cp-midi-key--black"
                  data-note={note}
                  data-active={isActive ? 'true' : 'false'}
                  aria-label={noteLabel(note)}
                  aria-pressed={isActive}
                  style={{
                    // Black keys are --cp-black-key (default 0.62) of a white key wide, centred on the edge.
                    left: `calc(${whiteBefore * whitePct}% - ${whitePct}% * var(--cp-black-key, 0.62) / 2)`,
                    width: `calc(${whitePct}% * var(--cp-black-key, 0.62))`,
                    ...(isActive
                      ? accentColor
                        ? { backgroundColor: accentColor }
                        : {}
                      : blackKeyColor
                        ? { backgroundColor: blackKeyColor }
                        : {}),
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
