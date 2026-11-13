/**
 * Opcode catalogue built from the Csound reference manual (name, purpose, syntax,
 * manual page). Only loaded with the editor chunk.
 */
import data from './opcodes.json';

export interface OpcodeEntry {
  name: string;
  purpose?: string;
  syntax?: string[];
  file?: string;
}

/** Compact form: name → [purpose, syntax lines, manual file if not "<name>.html"]. */
type CompactEntry = [string, string[], string?];

const RAW = data as unknown as Record<string, CompactEntry>;
const BY_LOWER = new Map<string, OpcodeEntry>();
for (const [name, [purpose, syntax, file]] of Object.entries(RAW)) {
  BY_LOWER.set(name.toLowerCase(), { name, purpose: purpose || undefined, syntax, file: file ?? `${name}.html` });
}

export const MANUAL_BASE_URL = 'https://csound.com/docs/manual/';

/** All orchestra opcode names (original case). */
export const OPCODE_NAMES: ReadonlySet<string> = new Set([...BY_LOWER.values()].map((e) => e.name));

/** Look up an opcode; `name_i` packed forms fall back to their parent page. */
export function lookupOpcode(name: string): OpcodeEntry | undefined {
  const key = name.toLowerCase();
  const direct = BY_LOWER.get(key);
  if (direct) return direct;
  if (key.endsWith('_i')) return BY_LOWER.get(key.slice(0, -2));
  return undefined;
}

export function manualUrl(entry: OpcodeEntry): string | undefined {
  return entry.file ? MANUAL_BASE_URL + entry.file : undefined;
}

export function allOpcodes(): OpcodeEntry[] {
  return [...BY_LOWER.values()];
}
