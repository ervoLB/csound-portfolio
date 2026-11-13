/**
 * Hardware MIDI input through the Web MIDI API (Chrome, Edge, Firefox; not Safari).
 * Only short channel messages (note, CC, pitch bend, aftertouch, program) are forwarded.
 */
export type MidiHandler = (status: number, data1: number, data2: number) => void;

export function webMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as Navigator & { requestMIDIAccess?: unknown }).requestMIDIAccess === 'function';
}

export interface MidiConnection {
  inputs: string[];
  disconnect(): void;
}

/** Ask for MIDI access (shows the browser's permission prompt) and listen to every input. */
export async function connectWebMidi(handler: MidiHandler, onInputsChanged?: (names: string[]) => void): Promise<MidiConnection> {
  if (!webMidiSupported()) throw new Error('This browser does not support MIDI devices. Try Chrome, Edge or Firefox.');
  const access = await navigator.requestMIDIAccess({ sysex: false });
  const listen = (event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data.length < 2) return;
    const status = data[0];
    if (status < 0x80 || status >= 0xf0) return; // ignore system / realtime messages
    handler(status, data[1] ?? 0, data[2] ?? 0);
  };
  const attach = () => {
    const names: string[] = [];
    access.inputs.forEach((input) => {
      input.onmidimessage = listen;
      names.push(input.name ?? 'MIDI input');
    });
    onInputsChanged?.(names);
    return names;
  };
  const inputs = attach();
  access.onstatechange = () => attach();
  return {
    inputs,
    disconnect() {
      access.onstatechange = null;
      access.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
    },
  };
}
