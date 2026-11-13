import { useEffect, useRef } from 'react';
import type { LogLevel } from '../engine/csoundLog';

export interface ConsoleLine {
  id: number;
  text: string;
  level: LogLevel | 'system';
}

export interface ConsoleProps {
  lines: ConsoleLine[];
  suppressed: number;
  onClear: () => void;
}

/** Csound messages, newest at the bottom; follows new output unless the user scrolled up. */
export function Console({ lines, suppressed, onClear }: ConsoleProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="cp-console">
      <div className="cp-console__bar">
        <span className="cp-console__title">Csound output</span>
        {suppressed > 0 && <span className="cp-console__note">{suppressed} repeated messages hidden</span>}
        <button type="button" className="cp-btn cp-btn--ghost cp-btn--small" onClick={onClear}>
          Clear
        </button>
      </div>
      <div
        ref={scroller}
        className="cp-console__lines"
        role="log"
        aria-live="polite"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {lines.length === 0 ? (
          <div className="cp-console__line cp-console__line--system">Messages from Csound appear here.</div>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={`cp-console__line cp-console__line--${line.level}`}>
              {line.text || ' '}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
