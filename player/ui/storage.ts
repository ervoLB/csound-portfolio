/** localStorage wrappers that never throw (private mode, blocked storage, previews). */
const PREFIX = 'cp:';

export function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = globalThis.localStorage?.getItem(PREFIX + key);
    return value !== null && value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readNumberPref(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    if (raw === null || raw === undefined || raw.trim() === '') return fallback; // Number(null) would be 0
    const n = Number(raw);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  } catch {
    return fallback;
  }
}

export function hasPref(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(PREFIX + key) != null;
  } catch {
    return false;
  }
}

export function writePref(key: string, value: string | number): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, String(value));
  } catch {
    /* storage unavailable: the preference just isn't remembered */
  }
}
