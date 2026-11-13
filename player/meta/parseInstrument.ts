import type {
  InstrumentMeta,
  InstrumentParseResult,
  MetaIssue,
} from './types';

/** Properties understood inside `@INSTRUMENT`. Anything else is a warning. */
const KNOWN_KEYS = new Set([
  'name',
  'type',
  'author',
  'vendor',
  'description',
  'tags',
  'license',
  'midi',
  'order',
  'draft',
  'date',
]);

const TAG_WARNING = 'Put tags in quotes: tags: "a, b"';

interface FieldToken {
  kind: 'field';
  key: string;
  value: string;
}

interface StrayToken {
  kind: 'stray';
  value: string;
}

type Token = FieldToken | StrayToken;

/**
 * Split a `key: value; key: value` payload on `;` or `,` outside double quotes,
 * keeping malformed (colon-less) fragments so they can be reported.
 */
function tokenize(raw: string): Token[] {
  const tokens: Token[] = [];
  let current = '';
  let inQuotes = false;

  const flush = () => {
    const part = current.trim();
    current = '';
    if (!part) return;

    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) {
      tokens.push({ kind: 'stray', value: part });
      return;
    }

    const key = part.substring(0, colonIndex).trim();
    const value = part.substring(colonIndex + 1).trim();
    if (!key || !value) return;

    const quoted = value.startsWith('"') && value.endsWith('"');
    tokens.push({
      kind: 'field',
      key,
      value: quoted ? value.slice(1, -1) : value,
    });
  };

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === ';' || char === ',') && !inQuotes) {
      flush();
    } else {
      current += char;
    }
  }
  flush();

  return tokens;
}

/**
 * A release date as YYYY, YYYY-MM or YYYY-MM-DD (a real calendar date).
 * Returns the normalised string or null.
 */
export function parseReleaseDate(value: string): string | null {
  const m = value.trim().match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (!m) return null;
  const year = Number(m[1]);
  if (m[2] === undefined) return m[1];
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, '0');
  if (m[3] === undefined) return `${m[1]}-${mm}`;
  const day = Number(m[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${m[1]}-${mm}-${String(day).padStart(2, '0')}`;
}

/** Split a quoted tag list, trimming, dropping empties and case-insensitive duplicates. */
function splitTags(value: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const part of value.split(',')) {
    const tag = part.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

/**
 * Parse the `<@INSTRUMENT …>` meta-opcode.
 *
 * Syntax: `;<@INSTRUMENT: {name: "Sub Synth"; type: "synth"; …}>`.
 * When several lines are present the first one is used and every extra line is
 * reported as an error.
 */
export function parseInstrument(code: string): InstrumentParseResult {
  const issues: MetaIssue[] = [];
  const lines = code.split('\n');
  const instrumentRegex = /;\s*<@INSTRUMENT\s*:\s*\{(.*)\}>/;

  const matches: { lineNum: number; propsRaw: string; raw: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(instrumentRegex);
    if (match) {
      matches.push({ lineNum: i + 1, propsRaw: match[1], raw: line.trim() });
    }
  }

  if (matches.length === 0) {
    return { meta: null, issues: [] };
  }

  for (const extra of matches.slice(1)) {
    issues.push({
      line: extra.lineNum,
      severity: 'error',
      message: 'Multiple @INSTRUMENT meta-opcodes found. Only the first one is used.',
      raw: extra.raw,
    });
  }

  const used = matches[0];
  const values = new Map<string, FieldToken>();
  let previousKey: string | null = null;
  let tagsWarningEmitted = false;

  for (const token of tokenize(used.propsRaw)) {
    if (token.kind === 'stray') {
      if (previousKey === 'tags') {
        if (!tagsWarningEmitted) {
          tagsWarningEmitted = true;
          issues.push({
            line: used.lineNum,
            severity: 'warning',
            message: TAG_WARNING,
            raw: used.raw,
          });
        }
      } else {
        issues.push({
          line: used.lineNum,
          severity: 'warning',
          message: `Invalid property format "${token.value}". Expected "key: value"`,
          raw: used.raw,
        });
      }
      continue;
    }

    previousKey = token.key;

    if (!KNOWN_KEYS.has(token.key)) {
      issues.push({
        line: used.lineNum,
        severity: 'warning',
        message: `Unknown @INSTRUMENT property "${token.key}"`,
        raw: used.raw,
      });
      continue;
    }

    values.set(token.key, token);
  }

  const meta: InstrumentMeta = {
    type: 'synth',
    tags: [],
    draft: false,
  };

  const name = values.get('name');
  if (name) {
    meta.name = name.value;
  } else {
    issues.push({
      line: used.lineNum,
      severity: 'warning',
      message: '@INSTRUMENT has no name; the file name will be used',
      raw: used.raw,
    });
  }

  const type = values.get('type');
  if (type) {
    if (type.value === 'synth' || type.value === 'effect') {
      meta.type = type.value;
    } else {
      issues.push({
        line: used.lineNum,
        severity: 'warning',
        message: `@INSTRUMENT type must be "synth" or "effect", got "${type.value}"`,
        raw: used.raw,
      });
    }
  }

  const author = values.get('author') ?? values.get('vendor');
  if (author) meta.author = author.value;

  const description = values.get('description');
  if (description) meta.description = description.value;

  const tags = values.get('tags');
  if (tags) meta.tags = splitTags(tags.value);

  const license = values.get('license');
  if (license) meta.license = license.value;

  const midi = values.get('midi');
  if (midi) {
    const value = midi.value.toLowerCase();
    if (value === 'on' || value === 'true') {
      meta.midi = 'on';
    } else if (value === 'off' || value === 'false') {
      meta.midi = 'off';
    } else {
      issues.push({
        line: used.lineNum,
        severity: 'warning',
        message: `@INSTRUMENT midi must be "on" or "off", got "${midi.value}"`,
        raw: used.raw,
      });
    }
  }

  const order = values.get('order');
  if (order) {
    const value = Number(order.value);
    if (Number.isFinite(value)) {
      meta.order = value;
    } else {
      issues.push({
        line: used.lineNum,
        severity: 'warning',
        message: `@INSTRUMENT order must be a number, got "${order.value}"`,
        raw: used.raw,
      });
    }
  }

  const draft = values.get('draft');
  if (draft) {
    const value = draft.value.toLowerCase();
    if (value === 'true') {
      meta.draft = true;
    } else if (value === 'false') {
      meta.draft = false;
    } else {
      issues.push({
        line: used.lineNum,
        severity: 'warning',
        message: `@INSTRUMENT draft must be true or false, got "${draft.value}"`,
        raw: used.raw,
      });
    }
  }

  const date = values.get('date');
  if (date) {
    const value = parseReleaseDate(date.value);
    if (value) {
      meta.date = value;
    } else {
      issues.push({
        line: used.lineNum,
        severity: 'warning',
        message: `@INSTRUMENT date must look like "2026-03-14", "2026-03" or "2026", got "${date.value}"`,
        raw: used.raw,
      });
    }
  }

  return { meta, line: used.lineNum, issues };
}
