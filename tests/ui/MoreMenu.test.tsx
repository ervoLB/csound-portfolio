// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MoreMenu, type MoreMenuItem } from '../../player/ui/MoreMenu';

function setup(items: MoreMenuItem[] = [{ label: 'Download .csd', onSelect: vi.fn() }]) {
  const view = render(<MoreMenu items={items} />);
  const trigger = screen.getByRole('button', { name: 'More' }) as HTMLButtonElement;
  const panel = document.getElementById(trigger.getAttribute('aria-controls')!) as HTMLElement;
  return { ...view, trigger, panel, items };
}

describe('MoreMenu', () => {
  it('is a disclosure that toggles its panel and aria-expanded', () => {
    const { trigger, panel } = setup();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });

  it('selects an item, closes and returns focus to its button', () => {
    const onSelect = vi.fn();
    const { trigger, panel } = setup([{ label: 'Download .csd', onSelect }]);
    fireEvent.click(trigger);

    const item = screen.getByRole('button', { name: 'Download .csd' });
    fireEvent.click(item);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape inside and does not let Escape reach an ancestor', () => {
    const onAncestorKeyDown = vi.fn();
    render(
      <div onKeyDown={onAncestorKeyDown}>
        <MoreMenu items={[{ label: 'Download .csd', onSelect: vi.fn() }]} />
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'More' }) as HTMLButtonElement;
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!) as HTMLElement;

    fireEvent.click(trigger);
    const item = screen.getByRole('button', { name: 'Download .csd' });
    fireEvent.keyDown(item, { key: 'Escape' });

    expect(onAncestorKeyDown).not.toHaveBeenCalled();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape pressed elsewhere on the page (Safari does not focus buttons on click)', () => {
    render(<MoreMenu items={[{ label: 'Download .csd', onSelect: vi.fn() }]} />);
    const trigger = screen.getByRole('button', { name: 'More' });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('lets Escape through when the menu is already closed', () => {
    const onAncestorKeyDown = vi.fn();
    render(
      <div onKeyDown={onAncestorKeyDown}>
        <MoreMenu items={[]} />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), { key: 'Escape' });
    expect(onAncestorKeyDown).toHaveBeenCalledTimes(1);
  });

  it('closes on a pointer-down outside, but not inside', () => {
    const { trigger, panel } = setup();
    fireEvent.click(trigger);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Download .csd' }));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });

  it('renders children at the top of the panel, before the items', () => {
    const view = render(
      <MoreMenu items={[{ label: 'Download .csd', onSelect: vi.fn() }]}>
        <span data-testid="volume">Volume</span>
      </MoreMenu>,
    );
    const trigger = screen.getByRole('button', { name: 'More' });
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!) as HTMLElement;
    fireEvent.click(trigger);

    expect(panel.firstElementChild).toBe(view.getByTestId('volume'));
    expect(panel.querySelectorAll('.cp-more__item')).toHaveLength(1);
  });

  it('renders disabled items as disabled buttons that do nothing', () => {
    const onSelect = vi.fn();
    const { trigger, panel } = setup([{ label: 'Download .csd', onSelect, disabled: true }]);
    fireEvent.click(trigger);

    const item = screen.getByRole('button', { name: 'Download .csd' }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    fireEvent.click(item);

    expect(onSelect).not.toHaveBeenCalled();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
  });
});
