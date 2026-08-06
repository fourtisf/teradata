/**
 * UTC date arithmetic for the scheduler.
 *
 * Everything Tare states is in UTC, and a poster that runs unattended for
 * months is the one place a local-time assumption would go unnoticed until a
 * daylight-saving boundary posted twice or not at all. Nothing here reads the
 * host timezone, and none of it takes a `Date` with a local component.
 */

/** `2026-08-05` from an instant. */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Midnight UTC opening the given date, in epoch ms. */
export function dayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

/** `2026-08-05` shifted by whole days, still UTC. */
export function shiftDate(date: string, days: number): string {
  return utcDate(dayStartMs(date) + days * 86_400_000);
}

/** `2026-08` — the ledger's file granularity and the X budget's period. */
export function utcMonth(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/** 0 = Sunday, matching `Date#getUTCDay`. */
export function utcWeekday(ms: number): number {
  return new Date(ms).getUTCDay();
}

/** `5 August 2026` — how a post names the day it is about. */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function spokenDate(date: string): string {
  const d = new Date(dayStartMs(date));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `5 August` — inside a sentence, where the year is already obvious. */
export function spokenDay(date: string): string {
  const d = new Date(dayStartMs(date));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
