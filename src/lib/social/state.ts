/**
 * What the poster has done, for the status page.
 *
 * §7 already puts the unattributed share on a public page rather than burying
 * it, and the reasoning carries over: the two accounts are a surface of this
 * product, so when they last published and why one of them is quieter than the
 * other is the reader's business too. Someone who follows @TareData_ and sees
 * three posts a week where Telegram had twenty should be able to find out that
 * the free tier allows 500 a month, rather than conclude the feed is broken.
 *
 * Read-only, and it never throws. A status page that 500s because a bookkeeping
 * file is missing is worse than one that says the bookkeeping is not readable
 * from here — which is the honest answer on a deploy that does not share a disk
 * with the worker.
 */

import { capFor } from "@/lib/social/budget";
import { FileLedger } from "@/lib/social/ledger";
import { activeSpecs, nextDue, settledDate, settledWeek } from "@/lib/social/schedule";
import type { Channel, JobKind, PostRecord } from "@/lib/social/types";

export interface PublishedRecap {
  kind: JobKind;
  /**
   * The period the post was about — not the day it fired, which is later. Both
   * ends inclusive, and equal for a daily. Kept as dates rather than a rendered
   * string so the page decides how a date reads; §5 already puts that decision
   * in one place and it is not this one.
   */
  from: string;
  to: string;
  /** Where it went. Both channels when both took it. */
  channels: Channel[];
  /** ISO 8601 of the firing. */
  at: string;
}

export interface PosterState {
  /**
   * False when the ledger could not be read at all. Distinct from "nothing
   * published yet", which is a true statement about a readable empty ledger and
   * the expected state while the figures are simulated.
   */
  available: boolean;
  lastDaily: PublishedRecap | null;
  lastWeekly: PublishedRecap | null;
  xUsedThisMonth: number;
  /** What scheduled posts may spend, out of the monthly allowance. */
  xCap: number;
  /** Epoch ms of the next firing per job, soonest first. */
  next: Array<{ kind: JobKind; atMs: number }>;
}

/** The period a firing was about, reconstructed from when it fired. */
function subjectOf(kind: JobKind, at: number): { from: string; to: string } {
  if (kind === "daily") {
    const date = settledDate(at);
    return { from: date, to: date };
  }
  const week = settledWeek(at);
  return { from: week[0]!, to: week[6]! };
}

function latest(records: PostRecord[], kind: JobKind): PublishedRecap | null {
  const mine = records.filter((r) => r.ok && r.key.startsWith(`${kind}:`));
  if (!mine.length) return null;

  // The most recent firing, then every channel that took it — a post that
  // reached Telegram and failed on X is still a published recap, and saying
  // "Telegram" is more accurate than saying "both".
  const newest = mine.reduce((best, r) => (r.at > best.at ? r : best));
  const at = Date.parse(newest.at);
  return {
    kind,
    ...subjectOf(kind, at),
    channels: [...new Set(mine.filter((r) => r.key === newest.key).map((r) => r.channel))].sort(),
    at: newest.at,
  };
}

/**
 * `ledger` is injectable for the same reason `runDue`'s is: the check script
 * points it at a temporary directory rather than at whatever the environment
 * happens to have.
 */
export async function getPosterState(
  now: number = Date.now(),
  ledger: FileLedger = new FileLedger(),
): Promise<PosterState> {
  const empty: PosterState = {
    available: false,
    lastDaily: null,
    lastWeekly: null,
    xUsedThisMonth: 0,
    xCap: capFor("scheduled"),
    next: [],
  };

  // The schedule is pure and cannot fail on a readable env, so it is computed
  // whether or not the ledger answers — "the next recap is due at 00:05" is
  // true even where the record of the last one is not reachable.
  const next = activeSpecs()
    .flatMap((spec) => {
      const atMs = nextDue(spec, now);
      return atMs === null ? [] : [{ kind: spec.kind, atMs }];
    })
    .sort((a, b) => a.atMs - b.atMs);

  try {
    const records = await ledger.history();
    return {
      available: true,
      lastDaily: latest(records, "daily"),
      lastWeekly: latest(records, "weekly"),
      xUsedThisMonth: await ledger.countMonth("x", now),
      xCap: capFor("scheduled"),
      next,
    };
  } catch {
    return { ...empty, next };
  }
}
