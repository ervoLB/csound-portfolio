import { describe, expect, it } from 'vitest';
import { localAvatarPath } from '../../scripts/vitePortfolio';

describe('profile photo path (portfolio.json → avatar)', () => {
  it('accepts a file in the repository', () => {
    expect(localAvatarPath('profile.png')).toBe('profile.png');
    expect(localAvatarPath('./profile.png')).toBe('profile.png');
    expect(localAvatarPath('images/me.jpg')).toBe('images/me.jpg');
    expect(localAvatarPath(' images\\me.jpg ')).toBe('images/me.jpg');
  });

  it('leaves web addresses to the browser', () => {
    expect(localAvatarPath('https://example.com/me.jpg')).toBeNull();
    expect(localAvatarPath('//example.com/me.jpg')).toBeNull();
    expect(localAvatarPath('data:image/png;base64,AAAA')).toBeNull();
  });

  it('never reaches outside the project', () => {
    expect(localAvatarPath('../secret.png')).toBeNull();
    expect(localAvatarPath('images/../../x.png')).toBeNull();
    expect(localAvatarPath('/etc/passwd')).toBeNull();
    expect(localAvatarPath('C:\\me.png')).toBeNull();
  });

  it('ignores empty and non-text values', () => {
    for (const v of ['', '   ', undefined, null, 3, {}]) expect(localAvatarPath(v)).toBeNull();
  });
});
