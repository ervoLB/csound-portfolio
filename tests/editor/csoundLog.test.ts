import { describe, expect, it } from 'vitest';
import { classifyLine, diagnosticsFromLog } from '../../player/engine/csoundLog';

/** Real Csound 7 console lines; line numbers are CSD-file line numbers. */
const SYNTAX_OPCODE =
  'syntax error, unable to find opcode with name: oscilllli, line 12, columns 10-19';
const DEPRECATED_WARNING = 'warning: opcode outs is deprecated; use out instead, line 13';
const PARSING_FAILED = 'Parsing failed due to syntax errors';
const UNEXPECTED_TOKEN = 'error: syntax error, unexpected T_IDENT (token "kAmp") line 9:';
const INIT_ERROR = 'INIT ERROR in instr 1 (opcode oscili) line 20: ...';
const VERSION_BANNER = '--Csound version 7.0 (double samples) 2026-10-22';
const NO_ERRORS = '0 errors in performance';
const SECTION = 'SECTION 1:';

describe('classifyLine', () => {
  it('classifies syntax errors reported by the parser as errors', () => {
    expect(classifyLine(SYNTAX_OPCODE)).toBe('error');
  });

  it('classifies unexpected-token messages as errors', () => {
    expect(classifyLine(UNEXPECTED_TOKEN)).toBe('error');
  });

  it('classifies INIT ERROR messages as errors', () => {
    expect(classifyLine(INIT_ERROR)).toBe('error');
  });

  it('classifies a parser-failure summary as an error', () => {
    expect(classifyLine(PARSING_FAILED)).toBe('error');
  });

  it('classifies a stopping-on-parser-failure line as an error', () => {
    expect(classifyLine('Stopping on parser failure')).toBe('error');
  });

  it('classifies deprecated-opcode messages as warnings', () => {
    expect(classifyLine(DEPRECATED_WARNING)).toBe('warning');
  });

  it('classifies the version banner, the error count and section headings as info', () => {
    expect(classifyLine(VERSION_BANNER)).toBe('info');
    expect(classifyLine(NO_ERRORS)).toBe('info');
    expect(classifyLine(SECTION)).toBe('info');
  });
});

describe('diagnosticsFromLog', () => {
  it('extracts an error with its CSD line and column range', () => {
    expect(diagnosticsFromLog([SYNTAX_OPCODE])).toEqual([
      {
        line: 12,
        severity: 'error',
        message: SYNTAX_OPCODE,
        columns: [10, 19],
      },
    ]);
  });

  it('extracts a warning and strips the "warning:" prefix', () => {
    expect(diagnosticsFromLog([DEPRECATED_WARNING])).toEqual([
      {
        line: 13,
        severity: 'warning',
        message: 'opcode outs is deprecated; use out instead, line 13',
      },
    ]);
  });

  it('does not produce a diagnostic for "Parsing failed" because it has no line', () => {
    expect(classifyLine(PARSING_FAILED)).toBe('error');
    expect(diagnosticsFromLog([PARSING_FAILED])).toEqual([]);
  });

  it('extracts an error and strips the "error:" prefix', () => {
    expect(diagnosticsFromLog([UNEXPECTED_TOKEN])).toEqual([
      {
        line: 9,
        severity: 'error',
        message: 'syntax error, unexpected T_IDENT (token "kAmp") line 9:',
      },
    ]);
  });

  it('extracts an INIT ERROR with its line and leaves the message intact', () => {
    expect(diagnosticsFromLog([INIT_ERROR])).toEqual([
      { line: 20, severity: 'error', message: INIT_ERROR },
    ]);
  });

  it('ignores informational Csound output', () => {
    expect(diagnosticsFromLog([VERSION_BANNER, NO_ERRORS, SECTION])).toEqual([]);
  });

  it('ignores blank lines and whitespace-only lines', () => {
    expect(diagnosticsFromLog(['', '   ', '\t'])).toEqual([]);
  });

  it('collapses duplicate messages for the same line and severity', () => {
    const diagnostics = diagnosticsFromLog([DEPRECATED_WARNING, DEPRECATED_WARNING]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].line).toBe(13);
  });

  it('collapses duplicates even when their whitespace differs', () => {
    const tidy = 'warning: opcode outs is deprecated, line 13';
    const messy = '  warning:   opcode   outs\tis deprecated, line 13  ';
    expect(diagnosticsFromLog([tidy, messy])).toEqual([
      { line: 13, severity: 'warning', message: 'opcode outs is deprecated, line 13' },
    ]);
  });

  it('normalises whitespace and parses a single-column range', () => {
    expect(diagnosticsFromLog(['error: something   wrong\there, line 4, column 3'])).toEqual([
      {
        line: 4,
        severity: 'error',
        message: 'something wrong here, line 4, column 3',
        columns: [3, 3],
      },
    ]);
  });

  it('supports the "at line N" / "(line N)" / "line: N" forms', () => {
    expect(diagnosticsFromLog([
      'error: problem one at line 3',
      'error: problem two (line 5)',
      'warning: problem three line: 7',
    ])).toEqual([
      { line: 3, severity: 'error', message: 'problem one at line 3' },
      { line: 5, severity: 'error', message: 'problem two (line 5)' },
      { line: 7, severity: 'warning', message: 'problem three line: 7' },
    ]);
  });

  it('keeps the input order of the diagnostics', () => {
    const diagnostics = diagnosticsFromLog([
      SYNTAX_OPCODE,
      DEPRECATED_WARNING,
      UNEXPECTED_TOKEN,
    ]);
    expect(diagnostics.map((d) => d.line)).toEqual([12, 13, 9]);
    expect(diagnostics.map((d) => d.severity)).toEqual(['error', 'warning', 'error']);
  });
});
