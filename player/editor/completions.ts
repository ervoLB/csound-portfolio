/**
 * Autocomplete for the editor: Csound opcodes, and the two meta-opcodes
 * (<@WIDGET ...> and <@INSTRUMENT ...>) inside comments.
 */
import { snippet, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { allOpcodes } from './opcodeCatalog';
import { KEYWORDS } from './csoundLanguage';

// ---------------------------------------------------------------- opcodes

let opcodeOptions: Completion[] | null = null;

function opcodeCompletions(): Completion[] {
  opcodeOptions ??= [
    ...allOpcodes().map((entry) => ({
      label: entry.name,
      type: 'function',
      detail: entry.syntax?.[0],
      info: entry.purpose,
    })),
    ...[...KEYWORDS].map((k) => ({ label: k, type: 'keyword' })),
  ];
  return opcodeOptions;
}

/**
 * Scans the text before the cursor on one line. Returns where a line comment
 * starts (outside strings), or -1, and whether the cursor sits inside a string.
 */
export function scanLine(lineText: string): { commentStart: number; inString: boolean } {
  let inString = false;
  for (let i = 0; i < lineText.length; i++) {
    const c = lineText[i];
    if (c === '\\' && inString) {
      i++;
      continue;
    }
    if (c === '"') inString = !inString;
    else if (!inString && (c === ';' || (c === '/' && lineText[i + 1] === '/'))) return { commentStart: i, inString: false };
  }
  return { commentStart: -1, inString };
}

/** True when `pos` is inside an unclosed block comment. */
function inBlockComment(context: CompletionContext): boolean {
  const before = context.state.doc.sliceString(Math.max(0, context.pos - 20000), context.pos);
  return before.lastIndexOf('/*') > before.lastIndexOf('*/');
}

function inCommentOrString(lineText: string): boolean {
  const scan = scanLine(lineText);
  return scan.commentStart !== -1 || scan.inString;
}

export function opcodeCompletionSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  if (inCommentOrString(before) || inBlockComment(context)) return null;
  const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  if (word.to - word.from < 2 && !context.explicit) return null;
  return { from: word.from, options: opcodeCompletions(), validFor: /^[A-Za-z0-9_]*$/ };
}

// ----------------------------------------------------------- meta-opcodes

interface WidgetTemplate {
  type: string;
  detail: string;
  /** Snippet after `<@WIDGET `; `$CHANNEL`, `$ID`, `$LABEL` are filled from context. */
  body: string;
  /** Property that holds the channel, if the widget binds one. */
  channelProp?: string;
}

const WIDGET_TEMPLATES: WidgetTemplate[] = [
  { type: 'knob', detail: 'rotary control', channelProp: 'channel', body: 'knob:{id: "${1:$ID}"; label: "${2:$LABEL}"; channel: "${3:$CHANNEL}"; range: ${4:0-1}; default: ${5:0.5}}>' },
  { type: 'slider', detail: 'fader', channelProp: 'channel', body: 'slider:{id: "${1:$ID}"; label: "${2:$LABEL}"; channel: "${3:$CHANNEL}"; range: ${4:0-1}; default: ${5:0.5}}>' },
  { type: 'button', detail: 'momentary button (1 while pressed)', channelProp: 'channel', body: 'button:{id: "${1:$ID}"; label: "${2:$LABEL}"; channel: "${3:$CHANNEL}"}>' },
  { type: 'checkbox', detail: 'on/off checkbox', channelProp: 'channel', body: 'checkbox:{id: "${1:$ID}"; label: "${2:$LABEL}"; channel: "${3:$CHANNEL}"; default: ${4:0}}>' },
  { type: 'toggle', detail: 'on/off switch', channelProp: 'channel', body: 'toggle:{id: "${1:$ID}"; label: "${2:$LABEL}"; channel: "${3:$CHANNEL}"; default: ${4:0}}>' },
  { type: 'dropdown', detail: 'menu of numbered choices', channelProp: 'channel', body: 'dropdown:{id: "${1:$ID}"; label: "${2:$LABEL}"; channel: "${3:$CHANNEL}"; options: "${4:Sine=0; Saw=1; Square=2}"; default: ${5:0}}>' },
  { type: 'xypad', detail: 'two-axis pad', body: 'xypad:{id: "${1:xy_1}"; label: "${2:XY}"; channel_x: "${3:x}"; channel_y: "${4:y}"; range_x: ${5:0-1}; range_y: ${6:0-1}}>' },
  { type: 'meter', detail: 'level meter (reads a channel)', channelProp: 'channel', body: 'meter:{id: "${1:$ID}"; label: "${2:$LABEL}"; channel: "${3:$CHANNEL}"; range: ${4:0-1}}>' },
  { type: 'midi_keyboard', detail: 'on-screen MIDI keyboard', body: 'midi_keyboard:{id: "${1:keyboard_1}"; label: "${2:Keyboard}"; start_note: ${3:48}; end_note: ${4:72}}>' },
  { type: 'label', detail: 'text; on a chnset line, shows the value', body: 'label:{id: "${1:label_1}"; text: "${2:Text}"}>' },
];

const INSTRUMENT_SNIPPET =
  '<@INSTRUMENT: {name: "${1:Name}"; author: "${2:Author}"; description: "${3:One line about the sound}"; tags: "${4:synth, pad}"}>';

/** Literal channel name of a same-line chnget/chnset, for prefilling widget templates. */
export function channelBeforeComment(code: string): string | null {
  const get = code.match(/\bchnget\b(?::\w+)?\s*\(?\s*"([^"]+)"/);
  if (get) return get[1];
  const set = code.match(/\bchnset\b(?::\w+)?\s*\(?[^"]*"([^"]+)"\s*\)?\s*$/);
  return set ? set[1] : null;
}

export function humanize(channel: string): string {
  const words = channel
    .replace(/^[gikaS](?=[A-Z_])/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : channel;
}

function uniqueId(base: string, doc: string): string {
  const clean = base.replace(/[^A-Za-z0-9_]/g, '_') || 'widget';
  let id = clean;
  let n = 2;
  while (new RegExp(`id\\s*:\\s*"${id}"`).test(doc)) id = `${clean}_${n++}`;
  return id;
}

/** Fill $ID / $LABEL / $CHANNEL; exported for tests. */
export function fillTemplate(template: WidgetTemplate, channel: string | null, doc: string): string {
  const ch = channel ?? 'channel';
  const id = uniqueId(channel ? `${template.type}_${channel}` : `${template.type}_1`, doc);
  return template.body
    .replace('$ID', id)
    .replace('$LABEL', channel ? humanize(channel) : 'Label')
    .replace('$CHANNEL', ch);
}

export function metaCompletionSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const { commentStart } = scanLine(before);
  if (commentStart === -1 || inBlockComment(context)) return null;
  const inComment = before.slice(commentStart);

  const widgetType = inComment.match(/<@WIDGET\s+(\w*)$/i);
  if (widgetType) {
    const query = widgetType[1].toLowerCase();
    const channel = channelBeforeComment(before.slice(0, commentStart));
    const doc = context.state.doc.toString();
    return {
      from: context.pos - widgetType[1].length,
      options: WIDGET_TEMPLATES.filter((t) => t.type.startsWith(query)).map((t) => ({
        label: t.type,
        detail: t.detail,
        type: 'class',
        apply: snippet(fillTemplate(t, t.channelProp ? channel : null, doc)),
      })),
    };
  }

  const start = inComment.match(/<@?\w*$/);
  if (start && start[0].startsWith('<')) {
    return {
      from: context.pos - start[0].length,
      options: [
        { label: '<@WIDGET', detail: 'add a control to the widget board', type: 'keyword', apply: '<@WIDGET ', boost: 2 },
        { label: '<@INSTRUMENT', detail: 'name, description and tags for the portfolio', type: 'keyword', apply: snippet(INSTRUMENT_SNIPPET) },
      ],
    };
  }
  return null;
}
