/** Initials shown in place of a profile photo: "Ada Lovelace" → "AL", "björk" → "B". */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? '')
    .join('');
}
