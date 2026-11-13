// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { levelPercent, levelText } from '../../player/ui/OutputLevel';

describe('levelPercent', () => {
  it('maps -60..0 dBFS to 0..100 percent', () => {
    expect(levelPercent(1)).toBe(100);
    expect(levelPercent(0.5)).toBeCloseTo(89.97, 2); // -6.02 dBFS
    expect(levelPercent(0.1)).toBeCloseTo(66.67, 2); // -20 dBFS
  });

  it('is zero at or below the noise floor (v <= 0.001)', () => {
    expect(levelPercent(0.001)).toBe(0);
    expect(levelPercent(0.0005)).toBe(0);
    expect(levelPercent(0)).toBe(0);
    expect(levelPercent(-1)).toBe(0);
  });

  it('clamps to 0..100', () => {
    expect(levelPercent(2)).toBe(100);
    expect(levelPercent(1e-9)).toBe(0);
  });
});

describe('levelText', () => {
  it('shows -inf at or below the noise floor', () => {
    expect(levelText(0.001)).toBe('-inf');
    expect(levelText(0.0001)).toBe('-inf');
    expect(levelText(0)).toBe('-inf');
    expect(levelText(-0.5)).toBe('-inf');
  });

  it('shows rounded dBFS otherwise', () => {
    expect(levelText(1)).toBe('0 dB');
    expect(levelText(0.5)).toBe('-6 dB');
    expect(levelText(0.25)).toBe('-12 dB');
    expect(levelText(0.1)).toBe('-20 dB');
  });
});
