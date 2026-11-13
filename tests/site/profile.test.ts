import { describe, expect, it } from 'vitest';
import { initials } from '../../site/profile';

describe('initials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['björk', 'B'],
    ['  Jean  Claude Risset ', 'JC'],
    ['', ''],
    ['émile ✓', 'É✓'],
  ])('%j → %j', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it('uses at most the first two words and the first code point of each', () => {
    expect(initials('Ada Byron King Lovelace')).toBe('AB');
    expect(initials('  \t  ')).toBe('');
  });
});
