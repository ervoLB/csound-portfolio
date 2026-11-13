import { extractLiteralChannelName } from './chnChannel';
import {
  WIDGET_TYPES,
  type MetaIssue,
  type WidgetDef,
  type WidgetParseResult,
  type WidgetType,
} from './types';

/** Widget types understood by this player. Anything else is skipped with a warning. */
const SUPPORTED_TYPES = new Set<string>(WIDGET_TYPES);

/** Numeric properties that are coerced after parsing (or dropped when unusable). */
const OPTIONAL_NUMERIC_WIDGET_KEYS = [
  'step',
  'minX',
  'maxX',
  'minY',
  'maxY',
  'default_x',
  'default_y',
  'width',
  'height',
  'x',
  'y',
  'decimals',
  'crossoverPoints',
  'target_sample_rate',
  'totalFrames',
  'start_note',
  'end_note',
  'midi_channel',
] as const;

/**
 * Widgets created with an explicit `default` (or one of its aliases). Used only
 * by `inputChannelDefaults` to tell "no default given" apart from a default
 * that happens to equal the first dropdown option.
 */
const explicitDefaults = new WeakSet<WidgetDef>();

interface PropertySplit {
  parts: string[];
}

/** Split `key: value; key: value` on `;` or `,` outside double quotes. */
function splitProperties(raw: string): PropertySplit {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === ';' || char === ',') && !inQuotes) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return { parts };
}

interface ParsedProperties {
  props: Record<string, any>;
  invalidFormat: string[];
  invalidRanges: string[];
}

/** Parse the `key: value` payload of a widget meta-opcode. */
function parseProperties(raw: string): ParsedProperties {
  const props: Record<string, any> = {};
  const invalidFormat: string[] = [];
  const invalidRanges: string[] = [];

  for (const part of splitProperties(raw).parts) {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) {
      if (part.trim()) invalidFormat.push(part.trim());
      continue;
    }

    const key = part.substring(0, colonIndex).trim();
    const value = part.substring(colonIndex + 1).trim();
    if (!key || !value) continue;

    if (value.startsWith('"') && value.endsWith('"')) {
      const unquoted = value.slice(1, -1);
      if (key === 'options') {
        props[key] = unquoted
          .split(';')
          .map((option, index) => {
            const pieces = option.trim().split('=');
            const label = pieces[0].trim();
            const optionValue = pieces.length > 1 ? Number(pieces[1]) : index;
            return { label, value: optionValue };
          })
          .filter((option) => option.label && !Number.isNaN(option.value));
      } else {
        props[key] = unquoted;
      }
    } else if (
      key === 'range' ||
      key === 'range_x' ||
      key === 'range_y' ||
      /^-?\d+\.?\d*\s*-\s*-?\d+\.?\d*$/.test(value)
    ) {
      const match = value.match(/^(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)$/);
      if (!match) {
        invalidRanges.push(value);
      } else {
        const min = Number(match[1]);
        const max = Number(match[2]);
        if (key === 'range_x') {
          props.minX = min;
          props.maxX = max;
        } else if (key === 'range_y') {
          props.minY = min;
          props.maxY = max;
        } else {
          props.min = min;
          props.max = max;
        }
      }
    } else if (!Number.isNaN(Number(value))) {
      props[key] = Number(value);
    } else if (value === 'true') {
      props[key] = true;
    } else if (value === 'false') {
      props[key] = false;
    } else {
      props[key] = value;
    }
  }

  return { props, invalidFormat, invalidRanges };
}

/** True when `value` is a finite number (rejects NaN, non-numeric strings, objects). */
function finiteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Keep min/max/default numeric so a control can never receive a string. */
function coerceWidgetNumericProps(widget: WidgetDef): void {
  widget.min = finiteNumber(widget.min, 0);
  widget.max = finiteNumber(widget.max, 1);
  widget.default = finiteNumber(
    widget.default,
    widget.type === 'button' ? 0 : widget.min,
  );

  for (const key of OPTIONAL_NUMERIC_WIDGET_KEYS) {
    if (widget[key] === undefined) continue;
    const n = finiteNumber(widget[key], NaN);
    if (Number.isFinite(n)) {
      (widget as Record<string, unknown>)[key] = n;
    } else {
      delete (widget as Record<string, unknown>)[key];
    }
  }
}

function isNumericChannel(channel: string | undefined): boolean {
  if (channel === undefined) return false;
  const trimmed = channel.trim();
  return trimmed !== '' && Number.isFinite(Number(trimmed));
}

function toWidgetType(type: string): WidgetType {
  return (type === 'xy_pad' ? 'xypad' : type) as WidgetType;
}

function normalizeType(type: string): string {
  return type === 'xy_pad' ? 'xypad' : type;
}

/**
 * Parse `<@WIDGET …>` meta-opcodes from Csound code.
 *
 * Syntax: `; <@WIDGET type:{key: value; …}>`, optionally on a line that also
 * reads/writes a channel (`k_freq chnget "freq"`), in which case the channel is
 * inferred for widgets that do not declare one.
 */
export function parseWidgets(code: string): WidgetParseResult {
  const widgets: WidgetDef[] = [];
  const issues: MetaIssue[] = [];
  const lines = code.split('\n');

  // Traditional `chnget "x" ; <@WIDGET …>`
  const fullRegex = /chnget\s+["']([^"']+)["']\s*;.*<@WIDGET\s+(\w+)\s*:\s*\{(.*)\}>/;
  // Traditional `chnset value, "x" ; <@WIDGET …>`
  const chnsetRegex = /chnset\s+[^,]+,\s*["']([^"']+)["']\s*;.*<@WIDGET\s+(\w+)\s*:\s*\{(.*)\}>/;
  // Comment-based `; … <@WIDGET …>` (also functional chnget/chnset lines)
  const commentRegex = /;[^<]*<@WIDGET\s+(\w+)\s*:\s*\{(.*)\}>/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Instrument metadata is owned by the @INSTRUMENT parser.
    if (line.includes('<@INSTRUMENT')) continue;

    let channel: string | undefined;
    let type: string;
    let propsRaw: string;
    let recovered = false;

    const fullMatch = line.match(fullRegex);
    const chnsetMatch = line.match(chnsetRegex);
    const commentMatch = line.match(commentRegex);

    if (fullMatch) {
      channel = fullMatch[1];
      type = fullMatch[2];
      propsRaw = fullMatch[3];
    } else if (chnsetMatch) {
      channel = chnsetMatch[1];
      type = chnsetMatch[2];
      propsRaw = chnsetMatch[3];
    } else if (commentMatch) {
      type = commentMatch[1];
      propsRaw = commentMatch[2];
    } else if (line.includes('<@WIDGET')) {
      // Malformed meta-opcode: keep the raw payload so a supported type can
      // still be salvaged.
      const channelMatch = line.match(/(?:chnget|chnset).*?["']([^"']+)["']/);
      const typeMatch = line.match(/<@WIDGET\s+(\w+)/);
      const propsMatch =
        line.match(/\{(.*?)\}/) || line.match(/:\s*\{(.*)/) || line.match(/:\s*(.*)/);

      channel = channelMatch ? channelMatch[1] : undefined;
      type = typeMatch ? typeMatch[1] : 'knob';
      propsRaw = propsMatch ? propsMatch[propsMatch.length - 1] : '';
      recovered = true;

      issues.push({
        line: lineNum,
        severity: 'error',
        message: `Malformed meta-opcode. Attempting to recover using type "${type}"${channel ? ` for channel "${channel}"` : ''}.`,
        raw: line.trim(),
      });
    } else if (line.includes('<@')) {
      issues.push({
        line: lineNum,
        severity: 'warning',
        message: 'Unknown meta-opcode',
        raw: line.trim(),
      });
      continue;
    } else {
      continue;
    }

    // Functional `chnget("freq")` / `chnget:k("freq")` is not covered by the
    // traditional regexes; infer the channel from the opcode instead.
    const inferredChannel = extractLiteralChannelName(line);
    if (inferredChannel) {
      channel = inferredChannel;
    }

    type = normalizeType(type);

    if (!SUPPORTED_TYPES.has(type)) {
      if (!recovered) {
        issues.push({
          line: lineNum,
          severity: 'warning',
          message: `Widget type "${type}" is not supported by this player`,
          raw: line.trim(),
        });
      }
      continue;
    }

    const parsed = parseProperties(propsRaw);
    for (const value of parsed.invalidFormat) {
      issues.push({
        line: lineNum,
        severity: 'error',
        message: `Invalid property format "${value}". Expected "key: value"`,
        raw: line.trim(),
      });
    }
    for (const value of parsed.invalidRanges) {
      issues.push({
        line: lineNum,
        severity: 'error',
        message: `Invalid range "${value}". Expected format: min-max (e.g. 0-100 or -1-1)`,
        raw: line.trim(),
      });
    }

    const props = parsed.props;
    const widgetType = toWidgetType(type);

    if (
      widgetType === 'dropdown' &&
      (!Array.isArray(props.options) || props.options.length === 0)
    ) {
      issues.push({
        line: lineNum,
        severity: 'error',
        message: `Widget type "dropdown" requires an options property.`,
        raw: line.trim(),
      });
      continue;
    }

    const hadExplicitDefault =
      props.default !== undefined ||
      props.val !== undefined ||
      props.value !== undefined ||
      props.default_x !== undefined;

    let widget: WidgetDef;
    const existing = props.id ? widgets.find((w) => w.id === props.id) : undefined;

    if (existing) {
      widget = existing;
    } else {
      widget = {
        ...props,
        type: widgetType,
        id: props.id || `${widgetType}_${String(widgets.length + 1).padStart(3, '0')}`,
        line: lineNum,
        channel_name:
          props.channel_name || props.channel || props.param || props.paramId || channel,
        // A keyboard needs no caption; other widgets fall back to their channel or type.
        label: props.label !== undefined ? props.label : widgetType === 'midi_keyboard' ? undefined : channel || widgetType,
        min: props.min ?? 0,
        max: props.max ?? 1,
        default:
          props.default ??
          props.val ??
          props.value ??
          props.default_x ??
          (widgetType === 'button' ? 0 : props.min ?? 0),
      } as WidgetDef;

      if (hadExplicitDefault) explicitDefaults.add(widget);

      if (widgetType === 'midi_keyboard') {
        widget.midi_channel = props.midi_channel ?? 1;
        widget.start_note = props.start_note ?? 48;
        widget.end_note = props.end_note ?? 72;
        widget.show_labels = props.show_labels ?? true;
      }

      widgets.push(widget);
    }

    // Update the widget, also covering merged same-id definitions.
    if (props.label !== undefined) widget.label = props.label;
    if (props.min !== undefined) widget.min = props.min;
    if (props.max !== undefined) widget.max = props.max;
    if (props.default !== undefined) {
      widget.default = props.default;
      explicitDefaults.add(widget);
    }
    if (props.group !== undefined) widget.group = props.group;

    const newChannelName =
      props.channel_name || props.channel || props.param || props.paramId || channel;
    if (newChannelName && !widget.channel_name) {
      widget.channel_name = newChannelName;
    }

    if (widget.type === 'dropdown' && props.options) {
      widget.options = props.options;
    } else if (widget.type === 'xypad') {
      if (props.channel_x_name) widget.channel_x_name = props.channel_x_name;
      else if (props.channel_x) widget.channel_x_name = props.channel_x;

      if (props.channel_y_name) widget.channel_y_name = props.channel_y_name;
      else if (props.channel_y) widget.channel_y_name = props.channel_y;

      if (props.minX !== undefined) widget.minX = props.minX;
      if (props.maxX !== undefined) widget.maxX = props.maxX;
      if (props.minY !== undefined) widget.minY = props.minY;
      if (props.maxY !== undefined) widget.maxY = props.maxY;
      if (props.default_x !== undefined) widget.default_x = props.default_x;
      if (props.default_y !== undefined) widget.default_y = props.default_y;
    }

    coerceWidgetNumericProps(widget);
  }

  return { widgets, issues };
}

/** Clamp a value so a boolean control writes exactly 0 or 1. */
function binaryDefault(value: number): number {
  return Number.isFinite(value) && value > 0 ? 1 : 0;
}

/**
 * Initial channel values for the channels the board WRITES (controls).
 * Widgets without a channel are ignored.
 */
export function inputChannelDefaults(widgets: WidgetDef[]): Record<string, number> {
  const defaults: Record<string, number> = {};

  for (const widget of widgets) {
    switch (widget.type) {
      case 'knob':
      case 'slider':
        if (widget.channel_name) defaults[widget.channel_name] = widget.default;
        break;
      case 'checkbox':
      case 'toggle':
        if (widget.channel_name) {
          defaults[widget.channel_name] = binaryDefault(widget.default);
        }
        break;
      case 'dropdown': {
        if (!widget.channel_name) break;
        const firstOption = widget.options?.[0]?.value;
        defaults[widget.channel_name] =
          !explicitDefaults.has(widget) && firstOption !== undefined
            ? firstOption
            : widget.default;
        break;
      }
      case 'button':
        if (widget.channel_name) defaults[widget.channel_name] = 0;
        break;
      case 'xypad':
        if (widget.channel_x_name) {
          defaults[widget.channel_x_name] = widget.default_x ?? widget.minX ?? 0;
        }
        if (widget.channel_y_name) {
          defaults[widget.channel_y_name] = widget.default_y ?? widget.minY ?? 0;
        }
        break;
      default:
        break;
    }
  }

  return defaults;
}

/**
 * Unique channels the board READS (meters, and labels bound to a channel), in
 * order of first appearance. Numeric channel names are skipped.
 */
export function outputChannels(widgets: WidgetDef[]): string[] {
  const channels: string[] = [];
  const seen = new Set<string>();
  for (const widget of widgets) {
    if (widget.type !== 'meter' && widget.type !== 'label') continue;
    const channel = widget.channel_name;
    if (!channel || isNumericChannel(channel) || seen.has(channel)) continue;
    seen.add(channel);
    channels.push(channel);
  }
  return channels;
}
