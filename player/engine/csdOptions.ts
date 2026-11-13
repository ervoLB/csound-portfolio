/**
 * Prepares a CSD for the browser engine: rewrites <CsOptions> so the instrument
 * renders through the AudioWorklet regardless of how the author configured it
 * for their own machine.
 */

export interface PrepareCsdOptions {
  /** AudioContext sample rate; forced so pitch is right whatever `sr` the CSD declares. */
  sampleRate: number;
  /** Enable MIDI input for this instrument (see midiDetect.ts). */
  midi: boolean;
}

export interface PreparedCsd {
  /** The CSD with its <CsOptions> contents blanked (line count preserved). */
  csd: string;
  /** Final option list, passed to Csound with csoundSetOption before compiling. */
  options: string[];
  /** Author options that were dropped because they don't apply in the browser. */
  removed: string[];
}

/**
 * Author options that are safe and useful in the browser; everything else in a
 * CSD's <CsOptions> is dropped (and reported), so a CSD from anywhere can't change
 * how the engine runs.
 */
const ALLOWED_OPTIONS: RegExp[] = [
  /^-m\d+$/, // message level
  /^--messagelevel=\d+$/,
  /^--m-(amps|range|warnings|dB|colours|benchmarks)=\d+$/,
  /^--[os]macro:[A-Za-z_][A-Za-z0-9_]*=.*$/, // orchestra / score macros
  /^-\+max_str_len=\d+$/,
  /^--sample-accurate$/,
  /^--keep-sorted-score$/,
  /^-\+skip_seconds=[\d.]+$/,
];

function tokenizeOptions(text: string): string[] {
  // Strip ; and /* */ comments, then split on whitespace (quotes are kept together).
  const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/;[^\n]*/g, ' ').replace(/#[^\n]*/g, ' ');
  const tokens: string[] = [];
  const re = /"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) tokens.push(m[0]);
  return tokens;
}

/**
 * Splits author options into kept (allow-listed) and removed. A removed flag that
 * is followed by a value token (`-o dac`, `-+rtaudio jack`, `--sample-rate 44100`)
 * is reported together with that value. Exported for tests.
 */
export function filterAuthorOptions(optionsText: string): { kept: string[]; removed: string[] } {
  const tokens = tokenizeOptions(optionsText);
  const kept: string[] = [];
  const removed: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (ALLOWED_OPTIONS.some((re) => re.test(token))) {
      kept.push(token);
      continue;
    }
    const next = tokens[i + 1];
    const takesValue = /^-[A-Za-z+]/.test(token) && !token.includes('=') && next !== undefined && !next.startsWith('-');
    if (takesValue && /^(-[A-Za-z]|--[a-z-]+|-\+[a-z_]+)$/.test(token)) {
      removed.push(`${token} ${next}`);
      i++;
    } else {
      removed.push(token);
    }
  }
  return { kept, removed };
}

export function forcedOptions({ sampleRate, midi }: PrepareCsdOptions): string[] {
  const options = ['-odac', '-d', '-+msg_color=false', '-+rtmidi=null'];
  if (Number.isFinite(sampleRate) && sampleRate > 0) options.push(`--sample-rate=${Math.round(sampleRate)}`);
  if (midi) options.push('-M0');
  return options;
}

/**
 * Splits a CSD into the text Csound compiles and the option list the engine sets
 * through the API.
 *
 * The <CsOptions> contents are blanked rather than rewritten: Csound ignores text
 * on the `<CsOptions>` tag line, and keeping every line in place means Csound's
 * error line numbers still match what the user sees in the editor.
 */
export function prepareCsd(csd: string, opts: PrepareCsdOptions): PreparedCsd {
  const optionsRe = /(<CsOptions(?:\s[^>]*)?>)([\s\S]*?)(<\/CsOptions>)/gi;
  let authorOptions = '';
  const out = csd.replace(optionsRe, (_block, open: string, inner: string, close: string) => {
    authorOptions += ` ${inner}`;
    return `${open}${inner.replace(/[^\n]/g, '')}${close}`;
  });
  const { kept, removed } = filterAuthorOptions(authorOptions);
  const options = [...forcedOptions(opts), ...kept];
  return { csd: out, options, removed };
}
