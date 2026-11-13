/**
 * Widget board with automatic layout: widgets flow in the order they appear in
 * the CSD, grouped into titled sections by their `group` property. The same
 * layout works docked on the right (one column) or at the bottom (wide rows).
 */
import { Component, useMemo, type ErrorInfo, type ReactNode } from 'react';
import type { WidgetDef, WidgetType } from '../meta/types';
import { WIDGET_COMPONENTS } from '../widgets';
import { TEXT_WIDGET_COMPONENTS } from '../widgets/text';

export const AUTO_KEYBOARD_ID = '__auto_keyboard';

/** Widget types that need a full row. */
const WIDE_TYPES = new Set<WidgetType>(['midi_keyboard', 'xypad']);

export interface BoardSection {
  title: string | null;
  widgets: WidgetDef[];
}

/** Group widgets by `group`, keeping first-appearance order. Exported for tests. */
export function buildSections(widgets: WidgetDef[]): BoardSection[] {
  const sections: BoardSection[] = [];
  const byTitle = new Map<string | null, BoardSection>();
  for (const widget of widgets) {
    const title = typeof widget.group === 'string' && widget.group.trim() ? widget.group.trim() : null;
    let section = byTitle.get(title);
    if (!section) {
      section = { title, widgets: [] };
      byTitle.set(title, section);
      sections.push(section);
    }
    section.widgets.push(widget);
  }
  return sections;
}

/** Adds an on-screen keyboard for MIDI instruments that don't declare one. Exported for tests. */
export function withAutoKeyboard(widgets: WidgetDef[], midiEnabled: boolean): WidgetDef[] {
  if (!midiEnabled || widgets.some((w) => w.type === 'midi_keyboard')) return widgets;
  const keyboard: WidgetDef = {
    type: 'midi_keyboard',
    id: AUTO_KEYBOARD_ID,
    line: 0,
    label: 'Keyboard',
    min: 0,
    max: 1,
    default: 0,
    start_note: 48,
    end_note: 72,
    midi_channel: 1,
    show_labels: true,
  };
  return [...widgets, keyboard];
}

class WidgetErrorBoundary extends Component<{ def: WidgetDef; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`Widget "${this.props.def.id}" failed to render`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="cp-widget cp-widget--broken" role="note">
          <span className="cp-widget__label">{this.props.def.label ?? this.props.def.id}</span>
          <span className="cp-widget__value">Couldn't show this {this.props.def.type}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface WidgetBoardProps {
  widgets: WidgetDef[];
  position: 'right' | 'bottom';
  midiEnabled: boolean;
  /** `text` swaps knobs, sliders and meters for character-cell versions and gives the keyboard its text picture. */
  controls?: WidgetControls;
}

export type WidgetControls = 'graphic' | 'text';

export function WidgetBoard({ widgets, position, midiEnabled, controls = 'graphic' }: WidgetBoardProps) {
  const sections = useMemo(() => buildSections(withAutoKeyboard(widgets, midiEnabled)), [widgets, midiEnabled]);

  if (sections.length === 0) {
    return (
      <div className={`cp-board cp-board--${position} cp-board--empty`}>
        <p className="cp-board__empty">
          This instrument has no controls. Add one with a <code>{'; <@WIDGET knob:{...}>'}</code> comment in the code.
        </p>
      </div>
    );
  }

  return (
    <div className={`cp-board cp-board--${position} cp-board--${controls}`} aria-label="Instrument controls">
      {sections.map((section, i) => (
        <section key={section.title ?? `__ungrouped_${i}`} className={`cp-board__section${section.title ? '' : ' cp-board__section--plain'}`} aria-label={section.title ?? undefined}>
          {section.title && <h3 className="cp-board__title">{section.title}</h3>}
          <div className="cp-board__cells">
            {section.widgets.map((def) => {
              const Widget = (controls === 'text' ? TEXT_WIDGET_COMPONENTS[def.type] : undefined) ?? WIDGET_COMPONENTS[def.type];
              if (!Widget) return null;
              return (
                <div key={def.id} className={`cp-board__cell cp-board__cell--${def.type}${WIDE_TYPES.has(def.type) ? ' cp-board__cell--wide' : ''}`} data-widget-id={def.id}>
                  <WidgetErrorBoundary def={def}>
                    <Widget def={def} />
                  </WidgetErrorBoundary>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
