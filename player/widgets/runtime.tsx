/**
 * Widget runtime: a tiny channel store shared by all widgets of one player.
 *
 * - Input widgets call `set(channel, value)`; the store remembers the value and
 *   forwards it to the engine through `onInput`.
 * - Output values reported by the engine (meters, live labels) arrive through
 *   `publish(values)` and are NOT sent back to the engine.
 * - Widgets subscribe per channel with `useChannel`, so a meter update only
 *   re-renders the widgets bound to that channel.
 */
import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react';

type Listener = () => void;

export interface ChannelStoreOptions {
  onInput?: (channel: string, value: number) => void;
  onMidi?: (status: number, data1: number, data2: number) => void;
}

export class ChannelStore {
  private values = new Map<string, number>();
  private listeners = new Map<string, Set<Listener>>();
  onInput: ((channel: string, value: number) => void) | undefined;
  onMidi: ((status: number, data1: number, data2: number) => void) | undefined;

  constructor(options: ChannelStoreOptions = {}) {
    this.onInput = options.onInput;
    this.onMidi = options.onMidi;
  }

  get(channel: string): number | undefined {
    return this.values.get(channel);
  }

  /** Snapshot of all current values (used to keep widget values across recompiles). */
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.values);
  }

  /** A value changed by the user: store it and send it to the engine. */
  set(channel: string, value: number): void {
    if (!channel || !Number.isFinite(value)) return;
    this.values.set(channel, value);
    this.notify(channel);
    this.onInput?.(channel, value);
  }

  /** Initialise values without sending them (the engine receives them with load()). */
  reset(values: Record<string, number>): void {
    const changed = new Set<string>([...this.values.keys(), ...Object.keys(values)]);
    this.values = new Map(Object.entries(values).filter(([, v]) => Number.isFinite(v)));
    for (const channel of changed) this.notify(channel);
  }

  /** Values reported by the engine (output channels). */
  publish(values: Record<string, number>): void {
    for (const [channel, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) continue;
      this.values.set(channel, value);
      this.notify(channel);
    }
  }

  subscribe(channel: string, listener: Listener): () => void {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    const listeners = set;
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  midi(status: number, data1: number, data2: number): void {
    this.onMidi?.(status, data1, data2);
  }

  private notify(channel: string): void {
    const set = this.listeners.get(channel);
    if (set) for (const listener of [...set]) listener();
  }
}

export const ChannelStoreContext = createContext<ChannelStore | null>(null);

export function useChannelStore(): ChannelStore {
  const store = useContext(ChannelStoreContext);
  if (!store) throw new Error('Widgets must be rendered inside a ChannelStoreContext provider');
  return store;
}

const noopSubscribe = () => () => {};

/**
 * Current value of a channel plus a setter that sends changes to the engine.
 * Without a channel the widget still works locally (value = fallback).
 */
export function useChannel(channel: string | undefined, fallback: number): [number, (value: number) => void] {
  const store = useChannelStore();
  const subscribe = useCallback(
    (listener: Listener) => (channel ? store.subscribe(channel, listener) : noopSubscribe()),
    [store, channel],
  );
  const getSnapshot = useCallback(() => (channel ? store.get(channel) ?? fallback : fallback), [store, channel, fallback]);
  const shared = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // Widgets without a channel keep a local value so they still respond to the user.
  const [local, setLocal] = useState(fallback);
  const setValue = useCallback(
    (next: number) => {
      if (channel) store.set(channel, next);
      else if (Number.isFinite(next)) setLocal(next);
    },
    [store, channel],
  );
  return [channel ? shared : local, setValue];
}
