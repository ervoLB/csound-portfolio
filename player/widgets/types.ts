import type { WidgetDef } from '../meta/types';

/** Props every widget component receives. Values flow through the ChannelStore context. */
export interface WidgetProps {
  def: WidgetDef;
}
