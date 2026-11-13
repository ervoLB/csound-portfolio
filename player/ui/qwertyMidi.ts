/**
 * Computer-keyboard piano: two rows like most DAWs.
 *   A W S E D F T G Y H U J K O L P ;  → C … E (one octave + a fourth)
 *   Z / X  → octave down / up
 */
export const QWERTY_NOTE_OFFSETS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};

export interface QwertyState {
  octave: number; // MIDI note of the "A" key = 12 * (octave + 1)
  held: Map<string, number>;
}

export function createQwertyState(): QwertyState {
  return { octave: 4, held: new Map() };
}

export type MidiSend = (status: number, data1: number, data2: number) => void;

/** Returns true when the event was used (caller should preventDefault). */
export function qwertyKeyDown(state: QwertyState, event: { code: string; repeat?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }, send: MidiSend, channel = 0): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  if (event.code === 'KeyZ' || event.code === 'KeyX') {
    if (event.repeat) return true;
    state.octave = Math.max(0, Math.min(8, state.octave + (event.code === 'KeyX' ? 1 : -1)));
    return true;
  }
  const offset = QWERTY_NOTE_OFFSETS[event.code];
  if (offset === undefined) return false;
  if (event.repeat || state.held.has(event.code)) return true;
  const note = 12 * (state.octave + 1) + offset;
  if (note > 127) return true;
  state.held.set(event.code, note);
  send(0x90 | channel, note, 100);
  return true;
}

export function qwertyKeyUp(state: QwertyState, event: { code: string }, send: MidiSend, channel = 0): boolean {
  const note = state.held.get(event.code);
  if (note === undefined) return false;
  state.held.delete(event.code);
  send(0x80 | channel, note, 0);
  return true;
}

/** Release everything (focus lost, instrument changed). */
export function qwertyReleaseAll(state: QwertyState, send: MidiSend, channel = 0): void {
  for (const note of state.held.values()) send(0x80 | channel, note, 0);
  state.held.clear();
}
