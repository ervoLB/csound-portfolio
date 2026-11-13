import { stripComments } from '../engine/csdText';

function firstQuotedString(text: string): string | undefined {
  const match = text.match(/(["'])([^"']*)\1/);
  return match?.[2];
}

function lastQuotedString(text: string): string | undefined {
  let last: string | undefined;
  const re = /(["'])([^"']*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    last = match[2];
  }
  return last;
}

/**
 * Extract a literal software-bus channel from a same-line `chnget` / `chnset`.
 *
 * Supports traditional opcode syntax (`k_freq chnget "freq"`) and functional
 * syntax (`k_freq = chnget("freq")`, `k_freq = chnget:k("freq")`,
 * `chnset(k_val, "out")`). Comments are stripped first so quoted widget
 * properties cannot be mistaken for the channel name.
 */
export function extractLiteralChannelName(line: string): string | undefined {
  const code = stripComments(line).trim();
  if (!code) return undefined;

  const getMatch = code.match(/\bchnget\b(?::[^\s(]+)?\s*(?:\((.*)\)|(.*))\s*$/i);
  if (getMatch) {
    return firstQuotedString(getMatch[1] ?? getMatch[2] ?? '');
  }

  const setMatch = code.match(/\bchnset\b(?::[^\s(]+)?\s*(?:\((.*)\)|(.*))\s*$/i);
  if (setMatch) {
    return lastQuotedString(setMatch[1] ?? setMatch[2] ?? '');
  }

  return undefined;
}
