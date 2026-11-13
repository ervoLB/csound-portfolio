/**
 * Public entry point of the player. The portfolio site imports only from here.
 */
import './styles/player.css';
import './styles/editor.css';
import './styles/shell.css';
import './styles/minimal.css';
import { createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { CsoundEngine } from './engine/CsoundEngine';
import { PlayerShell, type PlayerHandle, type PlayerShellProps } from './ui/PlayerShell';

export { defineCsoundPlayer, CsoundPlayerElement } from './element';
export { CsoundEngine } from './engine/CsoundEngine';
export type { EngineState, PlayResult } from './engine/CsoundEngine';
export { preloadWasm, onWasmProgress, DEFAULT_WASM_URL, CSOUND_VERSION } from './engine/wasmLoader';
export { detectMidi } from './engine/midiDetect';
export { parseInstrument, parseWidgets } from './meta';
export type { InstrumentMeta, WidgetDef } from './meta/types';
export type { PlayerHandle, PlayerShellProps, BoardPosition, EditorMode, LoadSource, PlayerState, PlayerChrome, WidgetControls } from './ui/PlayerShell';

/**
 * Start the shared engine early: download the official Csound wasm at idle time and
 * unlock audio on the first click or key press anywhere on the page.
 */
export function warmUpEngine(): CsoundEngine {
  const engine = CsoundEngine.shared();
  engine.preload();
  engine.installGestureUnlock(window);
  return engine;
}

/** Mount a player into an element without using the custom element. */
export function createPlayer(container: Element, props: Omit<PlayerShellProps, 'engine'> = {}): Promise<PlayerHandle> {
  const ref = createRef<PlayerHandle>();
  const root = createRoot(container);
  return new Promise((resolve) => {
    const attach = (h: PlayerHandle | null) => {
      (ref as { current: PlayerHandle | null }).current = h;
      if (h) resolve(h);
    };
    root.render(createElement(PlayerShell, { ...props, engine: CsoundEngine.shared(), ref: attach }));
  });
}
