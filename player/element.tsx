/**
 * <csound-player> custom element: a thin wrapper around PlayerShell.
 *
 *   <csound-player src="instruments/fm-bells/fm-bells.csd" board="right" editor="open"></csound-player>
 *
 * Optional: chrome="minimal" (text commands, a More menu, a status line) and
 * controls="text" (knobs, sliders and meters drawn as character cells, plus a
 * box-drawing picture of the MIDI keyboard that a layout's CSS can show).
 *
 * Methods: load(url | {code, title}), play(), stop(), run().
 * Events (bubbling CustomEvents): cp-ready, cp-state, cp-error, cp-ended.
 */
import { createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CsoundEngine } from './engine/CsoundEngine';
import {
  PlayerShell,
  type BoardPosition,
  type EditorMode,
  type LoadSource,
  type PlayerChrome,
  type PlayerHandle,
  type PlayerShellProps,
  type WidgetControls,
} from './ui/PlayerShell';

const BOARD_VALUES: BoardPosition[] = ['right', 'bottom', 'hidden'];
const EDITOR_VALUES: EditorMode[] = ['open', 'collapsed', 'hidden'];
const CHROME_VALUES: PlayerChrome[] = ['full', 'minimal'];
const CONTROLS_VALUES: WidgetControls[] = ['graphic', 'text'];

function pick<T extends string>(value: string | null, allowed: T[]): T | undefined {
  return value !== null && (allowed as string[]).includes(value) ? (value as T) : undefined;
}

export class CsoundPlayerElement extends HTMLElement {
  static observedAttributes = ['src', 'board', 'editor', 'chrome', 'controls', 'title-text'];

  private root: Root | null = null;
  private handle = createRef<PlayerHandle>();
  private pending: Array<(h: PlayerHandle) => void> = [];

  connectedCallback() {
    if (!this.root) {
      this.classList.add('cp-host');
      this.root = createRoot(this);
    }
    this.render();
  }

  disconnectedCallback() {
    // Unmount on the next tick so moving the element in the DOM doesn't tear it down.
    queueMicrotask(() => {
      if (!this.isConnected && this.root) {
        this.root.unmount();
        this.root = null;
      }
    });
  }

  attributeChangedCallback() {
    if (this.root) this.render();
  }

  private render() {
    const props: PlayerShellProps = {
      src: this.getAttribute('src') ?? undefined,
      title: this.getAttribute('title-text') ?? undefined,
      board: pick(this.getAttribute('board'), BOARD_VALUES),
      editor: pick(this.getAttribute('editor'), EDITOR_VALUES),
      chrome: pick(this.getAttribute('chrome'), CHROME_VALUES),
      controls: pick(this.getAttribute('controls'), CONTROLS_VALUES),
      engine: CsoundEngine.shared(),
      onEvent: (type, detail) => this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })),
    };
    this.root!.render(<PlayerShell ref={this.attachHandle} {...props} />);
  }

  private attachHandle = (h: PlayerHandle | null) => {
    (this.handle as { current: PlayerHandle | null }).current = h;
    if (h) {
      const waiting = this.pending;
      this.pending = [];
      for (const resolve of waiting) resolve(h);
    }
  };

  private ready(): Promise<PlayerHandle> {
    if (this.handle.current) return Promise.resolve(this.handle.current);
    return new Promise((resolve) => this.pending.push(resolve));
  }

  /**
   * Move keyboard focus to the player's Play/Stop button, so the computer keyboard
   * plays notes right away (the site calls this after a visitor picks an instrument).
   */
  focus(options?: FocusOptions) {
    const target = this.querySelector<HTMLElement>('.cp-btn--transport');
    if (target) target.focus(options);
    else super.focus(options);
  }

  /** Current player state ('empty', 'loading', 'ready', 'playing', …). */
  get state(): string {
    return this.handle.current?.state ?? 'empty';
  }

  load(source: LoadSource): Promise<boolean> {
    // Prime audio inside the caller's click handler (before any await).
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (activation?.isActive === true) CsoundEngine.shared().unlock().catch(() => {});
    return this.ready().then((h) => h.load(source));
  }

  play() {
    CsoundEngine.shared().unlock().catch(() => {});
    return this.ready().then((h) => h.play());
  }

  stop() {
    return this.ready().then((h) => h.stop());
  }

  run() {
    return this.ready().then((h) => h.run());
  }
}

/** Register <csound-player> (safe to call more than once). */
export function defineCsoundPlayer(tagName = 'csound-player'): void {
  if (!customElements.get(tagName)) customElements.define(tagName, class extends CsoundPlayerElement {});
}
