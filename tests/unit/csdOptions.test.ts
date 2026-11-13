import { describe, expect, it } from 'vitest';
import { filterAuthorOptions, forcedOptions, prepareCsd } from '../../player/engine/csdOptions';

const BASE_FORCED = ['-odac', '-d', '-+msg_color=false', '-+rtmidi=null'];
const lineCount = (text: string): number => text.split('\n').length;

describe('filterAuthorOptions', () => {
  it('returns empty lists for empty input', () => {
    expect(filterAuthorOptions('')).toEqual({ kept: [], removed: [] });
  });

  it('returns empty lists for whitespace-only input', () => {
    expect(filterAuthorOptions('   \n\t  \r\n')).toEqual({ kept: [], removed: [] });
  });

  it('ignores comments entirely', () => {
    expect(filterAuthorOptions('; -o dac\n# -d\n/* -b 512 */')).toEqual({ kept: [], removed: [] });
  });

  it('keeps unrelated flags', () => {
    expect(filterAuthorOptions('-m0 --omacro:X=1 -+max_str_len=10000')).toEqual({
      kept: ['-m0', '--omacro:X=1', '-+max_str_len=10000'],
      removed: [],
    });
  });

  it('drops options that are not on the allow-list, even unknown ones', () => {
    expect(filterAuthorOptions('--outputfoo=1')).toEqual({ kept: [], removed: ['--outputfoo=1'] });
  });

  it('is case-sensitive: -m0 is unrelated to -M0', () => {
    expect(filterAuthorOptions('-m0').kept).toEqual(['-m0']);
    expect(filterAuthorOptions('-M0').removed).toEqual(['-M0']);
  });

  const exactFlags = [
    '-n',
    '--nosound',
    '-d',
    '--nodisplays',
    '-W',
    '-A',
    '-J',
    '-h',
    '--noheader',
    '-T',
    '--terminate-on-midi',
    '-I',
    '--i-only',
    '-g',
    '--asciidisplay',
    '-G',
    '--postscriptdisplay',
  ];

  it.each(exactFlags)('removes the exact flag %s', (flag) => {
    expect(filterAuthorOptions(flag)).toEqual({ kept: [], removed: [flag] });
  });

  const attachedFlags = [
    '-odac',
    '-o/tmp/out.wav',
    '-iadc',
    '-b512',
    '-B1024',
    '-M0',
    '-r44100',
    '-k4410',
    '-Fout.wav',
    '-Llog.txt',
    '-Qqueue',
  ];

  it.each(attachedFlags)('removes the attached short form %s', (token) => {
    expect(filterAuthorOptions(token)).toEqual({ kept: [], removed: [token] });
  });

  const twoTokenFlags: Array<[string, string]> = [
    ['-o', 'dac'],
    ['-i', 'adc'],
    ['-b', '512'],
    ['-B', '1024'],
    ['-M', '0'],
    ['-r', '44100'],
    ['-k', '100'],
    ['-F', 'out.wav'],
    ['-L', 'log.txt'],
    ['-Q', 'queue'],
  ];

  it.each(twoTokenFlags)('removes the separate-value form %s %s with its value', (flag, value) => {
    expect(filterAuthorOptions(`${flag} ${value}`)).toEqual({ kept: [], removed: [`${flag} ${value}`] });
  });

  const longEqualsFlags = [
    '--output=dac',
    '--input=adc',
    '--iobufsamps=512',
    '--hardwarebufsamps=512',
    '--midi-device=1',
    '--sample-rate=44100',
    '--control-rate=100',
    '--midifile=in.mid',
    '--midioutfile=out.mid',
    '--wave=out.wav',
    '--aiff=out.aiff',
    '--ogg=out.ogg',
    '--format=wav',
    '--rtaudio=pa',
    '-+rtaudio=jack',
    '--rtmidi=alsa',
    '-+rtmidi=null',
    '--msg-color=false',
    '-+msg_color=false',
    '--sched=1',
    '-+server=1',
    '-+jack=1',
    '--port=1234',
  ];

  it.each(longEqualsFlags)('removes the long option %s', (token) => {
    expect(filterAuthorOptions(token)).toEqual({ kept: [], removed: [token] });
  });

  const bareLongFlags = ['--realtime', '--displays', '--udp-echo', '--udp-console'];

  it.each(bareLongFlags)('removes the bare long option %s', (token) => {
    expect(filterAuthorOptions(token)).toEqual({ kept: [], removed: [token] });
  });

  it('handles a realistic mixture and preserves order', () => {
    const input = '-m0 -o dac --omacro:X=1 -b512 -+max_str_len=10000 -M 0 -r 44100 -d';
    expect(filterAuthorOptions(input)).toEqual({
      kept: ['-m0', '--omacro:X=1', '-+max_str_len=10000'],
      removed: ['-o dac', '-b512', '-M 0', '-r 44100', '-d'],
    });
  });

  it('ignores semicolon, hash and block comments between flags', () => {
    const input = '; -o dac\n-m0 # hash comment\n/* -d\n-b 512 */ --omacro:X=1';
    expect(filterAuthorOptions(input)).toEqual({
      kept: ['-m0', '--omacro:X=1'],
      removed: [],
    });
  });

  it('ignores a comment that follows a kept flag on the same line', () => {
    expect(filterAuthorOptions('-m0 ; -d')).toEqual({ kept: ['-m0'], removed: [] });
  });

  it('removes a quoted output filename as one value', () => {
    expect(filterAuthorOptions('-o "my file.wav" -m0')).toEqual({
      kept: ['-m0'],
      removed: ['-o "my file.wav"'],
    });
  });

  it('handles tabs, repeated spaces and CRLF separators', () => {
    expect(filterAuthorOptions('  -m0\r\n\t-o dac\r\n')).toEqual({
      kept: ['-m0'],
      removed: ['-o dac'],
    });
  });

  it('removes a trailing flag that has no value', () => {
    expect(filterAuthorOptions('-m0 -o')).toEqual({ kept: ['-m0'], removed: ['-o'] });
  });

  it('keeps allow-listed flags and drops everything else', () => {
    expect(filterAuthorOptions('-m0 -qfoo')).toEqual({ kept: ['-m0'], removed: ['-qfoo'] });
  });

  it('allow-list: message level, macros, string length, sample-accurate, skip', () => {
    const allowed = '-m128 --messagelevel=7 --m-amps=0 --omacro:GAIN=0.5 --smacro:TEMPO=120 -+max_str_len=10000 --sample-accurate --keep-sorted-score -+skip_seconds=2.5';
    expect(filterAuthorOptions(allowed)).toEqual({ kept: allowed.split(' '), removed: [] });
  });

  it('drops options a CSD could use to change how the engine runs', () => {
    const { kept, removed } = filterAuthorOptions('--syntax-check-only -e --env:CSOUND_HOME=/x --0dbfs=1 -+rtaudio jack -z');
    expect(kept).toEqual([]);
    expect(removed).toEqual(['--syntax-check-only', '-e', '--env:CSOUND_HOME=/x', '--0dbfs=1', '-+rtaudio jack', '-z']);
  });

  it('removes the value of a long option written with a separate token', () => {
    const { kept } = filterAuthorOptions('--sample-rate 44100');
    expect(kept).toEqual([]);
  });
});

describe('forcedOptions', () => {
  it('returns the four always-forced options when no sample rate is forced', () => {
    expect(forcedOptions({ sampleRate: Number.NaN, midi: false })).toEqual(BASE_FORCED);
  });

  it('puts the always-forced options first and in order', () => {
    expect(forcedOptions({ sampleRate: 48000, midi: false })).toEqual([
      '-odac',
      '-d',
      '-+msg_color=false',
      '-+rtmidi=null',
      '--sample-rate=48000',
    ]);
  });

  it('adds the rounded sample rate', () => {
    expect(forcedOptions({ sampleRate: 44100, midi: false })).toEqual([
      ...BASE_FORCED,
      '--sample-rate=44100',
    ]);
  });

  it('rounds a fractional sample rate', () => {
    expect(forcedOptions({ sampleRate: 44100.4, midi: false })).toContain('--sample-rate=44100');
    expect(forcedOptions({ sampleRate: 44100.6, midi: false })).toContain('--sample-rate=44101');
    expect(forcedOptions({ sampleRate: 48000.5, midi: false })).toContain('--sample-rate=48001');
  });

  it('adds -M0 only when MIDI is enabled', () => {
    expect(forcedOptions({ sampleRate: 48000, midi: true })).toEqual([
      ...BASE_FORCED,
      '--sample-rate=48000',
      '-M0',
    ]);
    expect(forcedOptions({ sampleRate: 48000, midi: false })).not.toContain('-M0');
  });

  it.each([0, -1, -44100, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'omits the sample-rate option for the invalid rate %s',
    (sampleRate) => {
      const options = forcedOptions({ sampleRate, midi: false });
      expect(options).toEqual(BASE_FORCED);
      expect(options.some((option) => option.startsWith('--sample-rate'))).toBe(false);
    },
  );

  it('keeps a positive sample rate of 1', () => {
    expect(forcedOptions({ sampleRate: 1, midi: false })).toContain('--sample-rate=1');
  });

  it('returns a fresh array on every call', () => {
    const first = forcedOptions({ sampleRate: 48000, midi: false });
    first.push('mutated');
    expect(forcedOptions({ sampleRate: 48000, midi: false })).not.toContain('mutated');
  });
});

describe('prepareCsd', () => {
  const standardCsd = [
    '<CsoundSynthesizer>',
    '<CsOptions>',
    '-odac -m0',
    '--sample-rate=44100',
    '</CsOptions>',
    '<CsInstruments>',
    'instr 1',
    'endin',
    '</CsInstruments>',
    '<CsScore>',
    'i1 0 1',
    '</CsScore>',
    '</CsoundSynthesizer>',
  ].join('\n');

  const blankedStandardCsd = [
    '<CsoundSynthesizer>',
    '<CsOptions>',
    '',
    '',
    '</CsOptions>',
    '<CsInstruments>',
    'instr 1',
    'endin',
    '</CsInstruments>',
    '<CsScore>',
    'i1 0 1',
    '</CsScore>',
    '</CsoundSynthesizer>',
  ].join('\n');

  it('blanks the option text, keeps every line and returns the final options', () => {
    const result = prepareCsd(standardCsd, { sampleRate: 48000, midi: false });
    expect(result.csd).toBe(blankedStandardCsd);
    expect(lineCount(result.csd)).toBe(lineCount(standardCsd));
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000', '-m0']);
    expect(result.removed).toEqual(['-odac', '--sample-rate=44100']);
  });

  it('adds -M0 when MIDI is enabled', () => {
    const result = prepareCsd(standardCsd, { sampleRate: 48000, midi: true });
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000', '-M0', '-m0']);
  });

  it('omits the sample-rate option when the rate is not finite', () => {
    const result = prepareCsd(standardCsd, { sampleRate: Number.NaN, midi: false });
    expect(result.options).toEqual([...BASE_FORCED, '-m0']);
    expect(result.csd).toBe(blankedStandardCsd);
  });

  it('works when there is no CsOptions block', () => {
    const csd = [
      '<CsoundSynthesizer>',
      '<CsInstruments>',
      'instr 1',
      'endin',
      '</CsInstruments>',
      '</CsoundSynthesizer>',
    ].join('\n');
    const result = prepareCsd(csd, { sampleRate: 44100, midi: true });
    expect(result.csd).toBe(csd);
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=44100', '-M0']);
    expect(result.removed).toEqual([]);
  });

  it('leaves an empty CsOptions block unchanged', () => {
    const csd = '<CsoundSynthesizer>\n<CsOptions></CsOptions>\n</CsoundSynthesizer>';
    const result = prepareCsd(csd, { sampleRate: 48000, midi: false });
    expect(result.csd).toBe(csd);
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000']);
    expect(result.removed).toEqual([]);
  });

  it('blanks an inline CsOptions block without changing the line count', () => {
    const csd = '<CsoundSynthesizer>\n<CsOptions>-odac -m0</CsOptions>\n</CsoundSynthesizer>';
    const result = prepareCsd(csd, { sampleRate: 48000, midi: false });
    expect(result.csd).toBe('<CsoundSynthesizer>\n<CsOptions></CsOptions>\n</CsoundSynthesizer>');
    expect(lineCount(result.csd)).toBe(lineCount(csd));
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000', '-m0']);
    expect(result.removed).toEqual(['-odac']);
  });

  it('handles multiple CsOptions blocks and combines their options', () => {
    const csd = [
      '<CsoundSynthesizer>',
      '<CsOptions>',
      '-m0',
      '</CsOptions>',
      '<CsInstruments>',
      'instr 1',
      'endin',
      '</CsInstruments>',
      '<CsOptions>',
      '--omacro:X=1 -o dac',
      '</CsOptions>',
      '</CsoundSynthesizer>',
    ].join('\n');
    const expected = [
      '<CsoundSynthesizer>',
      '<CsOptions>',
      '',
      '</CsOptions>',
      '<CsInstruments>',
      'instr 1',
      'endin',
      '</CsInstruments>',
      '<CsOptions>',
      '',
      '</CsOptions>',
      '</CsoundSynthesizer>',
    ].join('\n');
    const result = prepareCsd(csd, { sampleRate: 48000, midi: false });
    expect(result.csd).toBe(expected);
    expect(lineCount(result.csd)).toBe(lineCount(csd));
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000', '-m0', '--omacro:X=1']);
    expect(result.removed).toEqual(['-o dac']);
  });

  it('blanks uppercase CsOptions tags', () => {
    const csd = [
      '<CsoundSynthesizer>',
      '<CSOPTIONS>',
      '-odac',
      '-+max_str_len=10000',
      '</CSOPTIONS>',
      '</CsoundSynthesizer>',
    ].join('\n');
    const result = prepareCsd(csd, { sampleRate: 48000, midi: false });
    expect(lineCount(result.csd)).toBe(lineCount(csd));
    expect(result.csd).not.toContain('-odac');
    expect(result.csd).not.toContain('-+max_str_len=10000');
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000', '-+max_str_len=10000']);
    expect(result.removed).toEqual(['-odac']);
  });

  it('preserves the original tag casing when blanking uppercase CsOptions tags', () => {
    const csd = [
      '<CsoundSynthesizer>',
      '<CSOPTIONS>',
      '-odac',
      '</CSOPTIONS>',
      '</CsoundSynthesizer>',
    ].join('\n');
    const result = prepareCsd(csd, { sampleRate: 48000, midi: false });
    expect(result.csd).toContain('<CSOPTIONS>');
    expect(result.csd).toContain('</CSOPTIONS>');
  });

  it('ignores comments inside CsOptions', () => {
    const csd = [
      '<CsoundSynthesizer>',
      '<CsOptions>',
      '; -o dac',
      '-m0',
      '</CsOptions>',
      '</CsoundSynthesizer>',
    ].join('\n');
    const result = prepareCsd(csd, { sampleRate: 48000, midi: false });
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000', '-m0']);
    expect(result.removed).toEqual([]);
    expect(result.csd).not.toContain('-o dac');
    expect(result.csd).not.toContain('-m0');
  });

  it('preserves the line count and unrelated lines with CRLF input', () => {
    const csd = [
      '<CsoundSynthesizer>',
      '<CsOptions>',
      '-odac -m0',
      '--sample-rate=44100',
      '</CsOptions>',
      '<CsInstruments>',
      'instr 1',
      'endin',
      '</CsInstruments>',
      '<CsScore>',
      'i1 0 1',
      '</CsScore>',
      '</CsoundSynthesizer>',
      '',
    ].join('\r\n');
    const result = prepareCsd(csd, { sampleRate: 48000, midi: false });
    expect(lineCount(result.csd)).toBe(lineCount(csd));
    const originalLines = csd.split('\n');
    const resultLines = result.csd.split('\n');
    expect(resultLines.length).toBe(originalLines.length);
    for (const index of [0, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(resultLines[index]).toBe(originalLines[index]);
    }
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000', '-m0']);
    expect(result.removed).toEqual(['-odac', '--sample-rate=44100']);
  });

  it('removes two-token author options from the returned option list', () => {
    const csd = [
      '<CsoundSynthesizer>',
      '<CsOptions>',
      '-o dac -b 512 -r 44100 -M 0 -m0',
      '</CsOptions>',
      '</CsoundSynthesizer>',
    ].join('\n');
    const result = prepareCsd(csd, { sampleRate: 48000, midi: true });
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000', '-M0', '-m0']);
    expect(result.removed).toEqual(['-o dac', '-b 512', '-r 44100', '-M 0']);
  });

  it('keeps only the newlines when the closing tag is on the same line as the options', () => {
    const csd = '<CsoundSynthesizer>\n<CsOptions>\n-odac -m0</CsOptions>\n</CsoundSynthesizer>';
    const result = prepareCsd(csd, { sampleRate: 48000, midi: false });
    expect(result.csd).toBe('<CsoundSynthesizer>\n<CsOptions>\n</CsOptions>\n</CsoundSynthesizer>');
    expect(lineCount(result.csd)).toBe(lineCount(csd));
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000', '-m0']);
  });

  it('returns forced options only when CsOptions contains no author options', () => {
    const csd = '<CsoundSynthesizer>\n<CsOptions>\n</CsOptions>\n</CsoundSynthesizer>';
    const result = prepareCsd(csd, { sampleRate: 96000, midi: false });
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=96000']);
    expect(result.removed).toEqual([]);
    expect(result.csd).toBe(csd);
  });

  it('removes author duplicates of forced flags but keeps the forced copies', () => {
    const csd = '<CsoundSynthesizer>\n<CsOptions>\n-d -+rtmidi=null -m0\n</CsOptions>\n</CsoundSynthesizer>';
    const result = prepareCsd(csd, { sampleRate: 48000, midi: false });
    expect(result.options).toEqual([...BASE_FORCED, '--sample-rate=48000', '-m0']);
    expect(result.removed).toEqual(['-d', '-+rtmidi=null']);
  });
});
