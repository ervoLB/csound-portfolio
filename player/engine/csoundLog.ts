/**
 * Turns Csound console messages into line-numbered diagnostics for the editor.
 * Csound reports line numbers relative to the CSD file (verified with 7.0.0), so
 * they map directly onto editor lines.
 */

export interface LogDiagnostic {
  line: number;
  severity: 'error' | 'warning';
  message: string;
  /** 1-based column range when Csound reports one. */
  columns?: [number, number];
}

export type LogLevel = 'error' | 'warning' | 'info';

export function classifyLine(text: string): LogLevel {
  const t = text.trim();
  if (/^(error|syntax error|ERROR|INIT ERROR|PERF ERROR|Parsing failed|Stopping on parser failure)/i.test(t)) return 'error';
  if (/\berror\b/i.test(t) && !/0 errors/i.test(t)) return 'error';
  if (/^warning|^WARNING|\bwarning\b/i.test(t)) return 'warning';
  return 'info';
}

const LINE_RE = /\bline\s+(\d+)(?:,\s*columns?\s+(\d+)(?:\s*-\s*(\d+))?)?/i;
const LINE_AT_RE = /\bat line\s+(\d+)|\(line\s+(\d+)\)|line:\s*(\d+)/i;

/** Extract diagnostics from a batch of Csound message lines. */
export function diagnosticsFromLog(lines: string[]): LogDiagnostic[] {
  const out: LogDiagnostic[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const text = raw.trim();
    if (!text) continue;
    const level = classifyLine(text);
    if (level === 'info') continue;
    const m = text.match(LINE_RE) ?? text.match(LINE_AT_RE);
    if (!m) continue;
    const line = Number(m[1] ?? m[2] ?? m[3]);
    if (!Number.isFinite(line) || line < 1) continue;
    const message = text.replace(/^(error|warning)\s*:\s*/i, '').replace(/\s+/g, ' ');
    const key = `${line}:${level}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const diag: LogDiagnostic = { line, severity: level, message };
    if (LINE_RE.test(text)) {
      const c = text.match(LINE_RE)!;
      if (c[2]) diag.columns = [Number(c[2]), Number(c[3] ?? c[2])];
    }
    out.push(diag);
  }
  return out;
}
