/**
 * Every number the product renders passes through here.
 *
 * These are pure and timezone-free on purpose: the server and the client have
 * to produce byte-identical output or hydration tears the page.
 */

/** `$268.4M`, `$9.84B`, `$412K`. Matches the prototype's rounding exactly. */
export function money(usd: number): string {
  const n = Math.abs(usd);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n / 1e3)}K`;
}

/** Same, with a true minus sign for outflow. */
export function signedMoney(usd: number): string {
  return `${usd < 0 ? "−" : ""}${money(usd)}`;
}

/** `$41,200,000` — the ledger in the method section. */
export function exactMoney(usd: number): string {
  const sign = usd < 0 ? "−" : "";
  return `${sign}$${Math.round(Math.abs(usd)).toLocaleString("en-US")}`;
}

export function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** `11.0%`. */
export function percent(share: number, digits = 1): string {
  return `${(share * 100).toFixed(digits)}%`;
}

/** `+18.2%` / `−4.1%`, for the origin cards. */
export function signedPercent(pct: number): string {
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}

/** `8.2s` — settlement lag. */
export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Dwell, as the feed shows it: an em dash before the first move, then minutes,
 * then hours, then `idle` once it is past the interesting part of the window.
 */
export function dwell(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = ms / 60_000;
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 12) return `${Math.round(hours)}h`;
  return "idle";
}

/** `14:22` in UTC. Never local time — the whole product is stated in UTC. */
export function utcTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** `4 Aug` — chart tooltips. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** `04 Aug 2026` — the daily card. */
export function longDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `2026-08-04` — the daily card filename and, in P6, `/day/[date]`. */
export function isoDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** `AB12…9F0C`. Addresses are shown truncated on every public surface. */
export function shortAddress(address: string): string {
  if (address.length <= 9) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
