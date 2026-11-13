import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { WidgetDef } from '../../player/meta/types';
import { ChannelStore, ChannelStoreContext } from '../../player/widgets/runtime';

export function makeDef(partial: Partial<WidgetDef> & Pick<WidgetDef, 'type'>): WidgetDef {
  return { id: `${partial.type}_001`, line: 1, min: 0, max: 1, default: 0, ...partial } as WidgetDef;
}

/** Render a widget with a fresh ChannelStore; returns the store and the inputs it sent. */
export function renderWidget(ui: ReactElement, initial: Record<string, number> = {}) {
  const sent: [string, number][] = [];
  const midi: [number, number, number][] = [];
  const store = new ChannelStore({
    onInput: (channel, value) => sent.push([channel, value]),
    onMidi: (s, d1, d2) => midi.push([s, d1, d2]),
  });
  store.reset(initial);
  const result = render(<ChannelStoreContext.Provider value={store}>{ui}</ChannelStoreContext.Provider>);
  return { ...result, store, sent, midi };
}
