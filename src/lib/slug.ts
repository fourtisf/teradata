/**
 * URL slugs for the public pages in §8.
 *
 * These end up in `/origin/[chain]` and `/route/[bridge]`, which are the
 * organic-traffic surface. Once a slug is published a crawler remembers it, so
 * the mapping is deliberately dumb and stable rather than clever.
 */

export function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Finds the display name a slug came from. Returns null rather than guessing. */
export function fromSlug<T extends { name: string }>(slug: string, items: readonly T[]): T | null {
  const wanted = toSlug(slug);
  return items.find((item) => toSlug(item.name) === wanted) ?? null;
}

/** `2026-08-04`. Rejects anything that is not a real calendar date. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** UTC midnight for a `YYYY-MM-DD` string. */
export function dayStartMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

export function shiftDay(isoDate: string, days: number): string {
  return new Date(dayStartMs(isoDate) + days * 864e5).toISOString().slice(0, 10);
}
