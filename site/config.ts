/** Types and loaders for the two JSON files the site reads. */
export interface PortfolioLink {
  label: string;
  url: string;
}

export interface PortfolioConfig {
  title?: string;
  author?: string;
  bio?: string;
  /** Profile photo: a path relative to portfolio.json (e.g. "profile.png") or an https:// URL. */
  avatar?: string;
  links?: PortfolioLink[];
  /** Page design: a key of LAYOUTS in site/layouts.ts (panel by default). */
  layout?: string;
  player?: { board?: 'right' | 'bottom' | 'hidden'; editor?: 'open' | 'collapsed' | 'hidden' };
}

export interface InstrumentEntry {
  slug: string;
  title: string;
  description?: string;
  tags: string[];
  author?: string;
  license?: string;
  type: 'synth' | 'effect';
  csd: string;
  preview?: string;
  widgets: number;
  midi: boolean;
  /** Release date: "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
  date?: string;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load ${url} (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

/** Only allow http(s) and relative links from the config. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url, location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
