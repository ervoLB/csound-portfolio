import { describe, expect, it } from 'vitest';
import { extractLiteralChannelName } from '../../player/meta/chnChannel';

describe('extractLiteralChannelName', () => {
  it('extracts a traditional chnget channel', () => {
    expect(extractLiteralChannelName('k_freq chnget "freq"')).toBe('freq');
  });

  it('extracts a functional chnget channel', () => {
    expect(extractLiteralChannelName('kfreq = chnget("freq")')).toBe('freq');
  });

  it('extracts a functional chnget channel with a rate specifier', () => {
    expect(extractLiteralChannelName('kfreq = chnget:k("freq")')).toBe('freq');
  });

  it('ignores @WIDGET quoted properties when inferring the channel', () => {
    const line =
      'kfreq = chnget("freq") ; <@WIDGET knob:{id: "knob_001"; label: "Frequency [Hz]"; range: 100-1000; default: 440; scale: "logarithmic"}>';
    expect(extractLiteralChannelName(line)).toBe('freq');
  });

  it('extracts a traditional chnset destination even when the value contains a comma', () => {
    expect(extractLiteralChannelName('chnset max(a_left, a_right), "output_level"')).toBe(
      'output_level',
    );
  });

  it('extracts a functional chnset destination', () => {
    expect(extractLiteralChannelName('chnset(k_rms, "rms")')).toBe('rms');
  });

  it('extracts a functional chnset destination with a rate specifier', () => {
    expect(extractLiteralChannelName('chnset:k(k_rms, "rms")')).toBe('rms');
  });

  it('accepts single quotes around the channel', () => {
    expect(extractLiteralChannelName("k_freq chnget 'freq'")).toBe('freq');
  });

  it('returns undefined for a comment-only widget with no chnget/chnset', () => {
    expect(
      extractLiteralChannelName('; <@WIDGET label:{id: "title_1"; text: "Filter Section"}>'),
    ).toBeUndefined();
  });

  it('returns undefined for a plain line', () => {
    expect(extractLiteralChannelName('a_out poscil 0.5, 440')).toBeUndefined();
  });

  it('returns undefined for an empty line', () => {
    expect(extractLiteralChannelName('   ')).toBeUndefined();
  });

  it('does not mistake a quoted chnget comment for a channel', () => {
    expect(extractLiteralChannelName('; chnget "nope"')).toBeUndefined();
  });
});
