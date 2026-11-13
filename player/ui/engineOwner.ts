/**
 * Several players on one page share the engine. The player that started the
 * current instrument "owns" it; the others show themselves as stopped and don't
 * forward widget values or MIDI.
 */
type Listener = (owner: symbol | null) => void;

let owner: symbol | null = null;
const listeners = new Set<Listener>();

export function claimEngine(id: symbol): void {
  if (owner === id) return;
  owner = id;
  for (const l of [...listeners]) l(owner);
}

export function engineOwner(): symbol | null {
  return owner;
}

export function onOwnerChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper. */
export function resetEngineOwner(): void {
  owner = null;
}
