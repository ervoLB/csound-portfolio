import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
  title?: string;
  disabled?: boolean;
}

/**
 * A small disclosure menu for secondary player actions (minimal chrome).
 * Closes on Escape anywhere on the page (focus returns to the button; the key is
 * not passed on), on a click outside, and after an action.
 */
export function MoreMenu({ items, children, label = 'More' }: { items: MoreMenuItem[]; children?: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    // Page-wide, in the capture phase: Safari doesn't focus buttons on click, so the
    // key may not come from inside the menu; and the player must not also see it
    // (Escape there stops the sound).
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div
      className="cp-more"
      ref={root}
      onBlur={(event) => {
        if (open && !root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="cp-btn cp-btn--ghost cp-more__button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      <div id={panelId} className="cp-more__panel" hidden={!open}>
        {children}
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className="cp-more__item"
            title={item.title}
            disabled={item.disabled}
            onClick={() => {
              setOpen(false);
              button.current?.focus();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
