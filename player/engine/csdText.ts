/**
 * Small helpers for reading CSD text without a full Csound parser.
 */

/** Matches one CSD section, e.g. section(csd, 'CsInstruments'). */
export function getSection(csd: string, tag: string): string | null {
  const match = csd.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1] : null;
}

export function isCsd(text: string): boolean {
  return /<CsoundSynthesizer>/i.test(text) && /<CsInstruments>/i.test(text);
}

/**
 * Remove Csound comments (`;`, `//`, and block comments) while keeping string
 * literals intact, so that `"a;b"` is not treated as a comment.
 * Line breaks are preserved so line numbers stay valid.
 */
export function stripComments(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const next = code[i + 1];
    if (c === '"') {
      const start = i;
      i++;
      while (i < n && code[i] !== '"' && code[i] !== '\n') {
        if (code[i] === '\\') i++;
        i++;
      }
      i++;
      out += code.slice(start, Math.min(i, n));
      continue;
    }
    if (c === '{' && next === '{') {
      const end = code.indexOf('}}', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += code.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === ';' || (c === '/' && next === '/')) {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Replace the contents of string literals ("..." and {{...}}) with spaces, keeping
 * the quotes and line breaks. Used after stripComments when scanning for opcodes,
 * so names inside strings (e.g. S "notnum") are not mistaken for code.
 */
export function blankStrings(code: string): string {
  return code
    .replace(/\{\{[\s\S]*?\}\}/g, (m) => '{{' + m.slice(2, -2).replace(/[^\n]/g, ' ') + '}}')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');
}
