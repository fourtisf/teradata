/**
 * When the poster fires, and what each firing is about.
 *
 * Pure and stateless. The ledger decides what has already gone out; this file
 * only answers "which occurrence is the current one, and is it still worth
 * publishing". Keeping it free of I/O is what makes a year of firings testable
 * in a loop — see `scripts/social-check.mts`.
 *
 * ## The daily post is not about yesterday
 *
 * §P5 asks for a daily card at 00:00 UTC, and the obvious reading is a recap of
 * the day that just ended. That reading publishes a number we would have to
 * correct.
 *
 * §3.3 watches each arrival for 24 hours. An arrival at 23:40 on the 5th has an
 * open window until 23:40 on the 6th, so at 00:05 on the 6th the held figure
 * for the 5th is provisional — and it can only move one way, down, as round
 * trips close. The site is allowed to show that: §3.4 makes rows mutable and
 * the feed restamps them in place, in front of the reader. A post cannot. It is
 * screenshotted, quoted and forwarded at the value it had when it was sent.
 *
 * So the daily post covers the most recent day whose windows have all closed.
 * At 00:05 on the 7th that is the 5th. The cost is that the date in the post is
 * a day further back than a reader might expect; the site carries today's
 * figure live for anyone who wants it sooner. The alternative was a headline
 * that gets revised after publication, which is the one thing §1 says is not
 * recoverable by fixing the data afterwards.
 */

import {
  DAILY_AT_MINUTE,
  enabledJobs,
  REEXPORT_WINDOW_HOURS,
  WEEKLY_AT_MINUTE,
  WEEKLY_WEEKDAY,
} from "@/lib/social/config";
import { dayStartMs, shiftDate, utcDate, utcWeekday } from "@/lib/social/time";
import type { JobSpec, Occurrence } from "@/lib/social/types";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Lateness bounds.
 *
 * Twelve hours for the daily: a recap posted at noon is still that morning's
 * post, and one posted the following evening is noise arriving under a date
 * nobody is thinking about any more. A day for the weekly, which is a slower
 * thing to be late with.
 */
export const JOB_SPECS: readonly JobSpec[] = [
  { kind: "daily", atMinuteUtc: DAILY_AT_MINUTE, weekday: null, maxLatenessMs: 12 * HOUR },
  {
    kind: "weekly",
    atMinuteUtc: WEEKLY_AT_MINUTE,
    weekday: WEEKLY_WEEKDAY,
    maxLatenessMs: 24 * HOUR,
  },
];

/** The specs actually switched on, in `SOCIAL_JOBS` order-independent form. */
export function activeSpecs(): JobSpec[] {
  return JOB_SPECS.filter((spec) => enabledJobs().includes(spec.kind));
}

/**
 * The latest instant this spec was due at or before `now`.
 *
 * Null only if the spec has a weekday and no matching day falls inside the last
 * week, which cannot happen for a valid weekday — the walk is bounded anyway
 * rather than trusting that.
 */
export function mostRecentDue(spec: JobSpec, now: number): number | null {
  for (let back = 0; back <= 7; back++) {
    const date = utcDate(now - back * DAY);
    const at = dayStartMs(date) + spec.atMinuteUtc * 60_000;
    if (at > now) continue;
    if (spec.weekday !== null && utcWeekday(at) !== spec.weekday) continue;
    return at;
  }
  return null;
}

/**
 * The next instant this spec is due after `now`.
 *
 * The mirror of `mostRecentDue`, and it exists for the status page rather than
 * the poster — the poster never needs to know, it just looks at the clock every
 * minute. Null on the same bounded walk, for the same reason.
 */
export function nextDue(spec: JobSpec, now: number): number | null {
  for (let ahead = 0; ahead <= 7; ahead++) {
    const at = dayStartMs(utcDate(now + ahead * DAY)) + spec.atMinuteUtc * 60_000;
    if (at <= now) continue;
    if (spec.weekday !== null && utcWeekday(at) !== spec.weekday) continue;
    return at;
  }
  return null;
}

/** `daily:2026-08-07`, `weekly:2026-08-03` — the firing, not the subject. */
export function occurrenceKey(spec: JobSpec, dueMs: number): string {
  return `${spec.kind}:${utcDate(dueMs)}`;
}

/**
 * Occurrences that are due and not yet stale.
 *
 * One per spec at most. A process that was down for three days comes back and
 * publishes today's post, not three days of backlog — the older firings are
 * simply gone, which is the correct outcome for a dated recap and the reason
 * `maxLatenessMs` exists at all.
 */
export function dueOccurrences(now: number, specs: readonly JobSpec[] = activeSpecs()): Occurrence[] {
  const out: Occurrence[] = [];
  for (const spec of specs) {
    const dueMs = mostRecentDue(spec, now);
    if (dueMs === null) continue;
    if (now - dueMs > spec.maxLatenessMs) continue;
    out.push({ spec, dueMs, key: occurrenceKey(spec, dueMs) });
  }
  return out;
}

/**
 * The most recent UTC date whose §3.3 windows have all closed.
 *
 * A date D is settled once every arrival it could contain has been watched for
 * the full window — the last of them lands at the close of D, so D is settled
 * at `end of D + window`.
 */
export function settledDate(now: number, windowHours: number = REEXPORT_WINDOW_HOURS): string {
  return shiftDate(utcDate(now - windowHours * HOUR), -1);
}

/** The seven settled days a weekly post covers, oldest first. */
export function settledWeek(now: number, windowHours: number = REEXPORT_WINDOW_HOURS): string[] {
  const end = settledDate(now, windowHours);
  return Array.from({ length: 7 }, (_, i) => shiftDate(end, i - 6));
}
