/**
 * §P5 — the scheduled half of the social layer.
 *
 * `src/lib/alerts/` is reactive: something moves, the ingest worker hands it
 * over, a message goes out. That path publishes nothing on a quiet day and
 * nothing at all until P1 exists. This half is the opposite — it fires on a
 * clock, from figures the site already holds, and it is what makes the two
 * accounts a feed rather than a pair of empty profiles.
 *
 * Both halves share the same transports, the same simulated-data guard and,
 * from here on, the same durable ledger and the same X post budget.
 */

import type { Channel } from "@/lib/alerts/types";

export type { Channel };

/** What a scheduled post is about. One per clock trigger, not per figure. */
export type JobKind = "daily" | "weekly";

/** Why a post exists. The X budget treats the two differently — see budget.ts. */
export type Purpose = "scheduled" | "alert";

/**
 * A clock trigger, as data.
 *
 * Deliberately not a cron string: there are two of these, the parser would be
 * more code than the schedule, and `atMinuteUtc` cannot be misread as local
 * time the way `0 5 * * *` in a config file can.
 */
export interface JobSpec {
  kind: JobKind;
  /** Minutes past midnight UTC. */
  atMinuteUtc: number;
  /** 0 = Sunday. Null fires every day. */
  weekday: number | null;
  /**
   * How late an occurrence may still be published.
   *
   * The bound is the whole point. If the box is down for a day, the fix is not
   * to wake up and post yesterday's recap at 19:00 — it is to skip that one and
   * say so in the log. An unbounded catch-up is how a restart turns into four
   * posts in four seconds.
   */
  maxLatenessMs: number;
}

/** A specific firing of a spec: the spec plus the instant it was due. */
export interface Occurrence {
  spec: JobSpec;
  /** Epoch ms of the scheduled instant, not of the run. */
  dueMs: number;
  /**
   * Stable across restarts and identical for every retry of the same firing.
   * `daily:2026-08-05`, `weekly:2026-08-03`.
   */
  key: string;
}

/** One composed post, before a transport sees it. */
export interface ComposedPost {
  /** Ledger key: the occurrence key, so a retry cannot double-post. */
  key: string;
  kind: JobKind;
  /** Telegram, HTML parse mode. */
  telegram: string;
  /** X, already inside 280 once a t.co link is counted. */
  x: string;
  /** Canonical URL the post points at. Also what X unfurls into a card. */
  link: string;
  /**
   * The day the figures describe, for the card image. Null for a post that is
   * not about one specific day.
   */
  cardDate: string | null;
}

/**
 * One line of the ledger.
 *
 * Failures are recorded too. They do not dedupe and they do not count against
 * the budget, but "we tried at 00:05 and Telegram returned 502" is the only
 * thing that distinguishes a broken transport from a schedule that never fired,
 * and an unattended process needs that distinction written down somewhere.
 */
export interface PostRecord {
  key: string;
  channel: Channel;
  purpose: Purpose;
  ok: boolean;
  /** Provider message id, when it went out. */
  id?: string;
  reason?: string;
  /** ISO 8601, UTC. */
  at: string;
}

/**
 * Durable memory for everything that has been published.
 *
 * The in-process dedupe in `alerts/dispatch.ts` is correct for one PM2 instance
 * and forgets everything on restart — which is survivable for an alert that
 * fires once and is gone, and not survivable for a scheduler, where a restart
 * at 00:06 would repost the recap that went out at 00:05.
 */
export interface PostLedger {
  /**
   * True only if this key was *successfully* delivered on this channel.
   *
   * `at` is the instant the caller is reasoning about, not necessarily now. A
   * file-backed implementation files a record under the month of its `at`, so
   * a reader that assumed wall-clock time would look in the wrong month the
   * moment anything moved the clock — and a write the dedupe cannot see is a
   * second post.
   */
  has(key: string, channel: Channel, at: number): Promise<boolean>;
  /** Every attempt at this key on this channel, successful or not. */
  attempts(key: string, channel: Channel, at: number): Promise<number>;
  /** Successful posts on a channel in the UTC month containing `at`. */
  countMonth(channel: Channel, at: number): Promise<number>;
  record(record: PostRecord): Promise<void>;
}

/** What the runner reports back, per channel, per job. */
export interface PostOutcome {
  key: string;
  kind: JobKind;
  channel: Channel;
  ok: boolean;
  id?: string;
  reason?: string;
}
