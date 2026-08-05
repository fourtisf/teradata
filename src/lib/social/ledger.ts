/**
 * The post ledger — what has already been published, on disk.
 *
 * ## Why it exists
 *
 * A scheduler restarted at 00:06 must not repost the recap that went out at
 * 00:05, and a redeploy in the middle of the month must not reset the X post
 * count to zero. The in-process `Map` in `alerts/dispatch.ts` cannot do either;
 * it forgets on restart, which is survivable for an alert and not for a clock.
 *
 * ## Why a file and not Postgres
 *
 * §11 already recorded the shape of this judgement once: the column store was
 * dropped because it bought nothing at our volume and cost an install. Same
 * arithmetic here. This is roughly forty rows a day, read by two processes that
 * share a filesystem by construction, and adding `pg` would make the poster
 * unable to start when the database is down — for bookkeeping the database is
 * not otherwise part of. `PostLedger` in types.ts is the seam for the day the
 * app and the worker stop sharing a disk, which is the same day the in-process
 * alert dedupe has to move to Redis.
 *
 * ## Why append-only
 *
 * Two processes write this: the worker for scheduled posts, the Next app for
 * alerts. Read-modify-write on a JSON file loses one of them under a race. A
 * single `appendFile` of one short line is atomic on POSIX with `O_APPEND`, so
 * the writers never need to coordinate and the file cannot be half-written.
 *
 * One file per UTC month keeps both reads bounded — the budget is a
 * calendar-month count, and a dedupe key is never more than a few days old.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { utcMonth } from "@/lib/social/time";
import type { Channel, PostLedger, PostRecord } from "@/lib/social/types";

/**
 * Where the ledger lives.
 *
 * Default is under the working directory so `npm run` works with no setup. On
 * the VPS it is `/var/lib/tare/social`, set in `ecosystem.config.cjs`: the
 * deploy does `git pull` in the app directory, and the record of what has been
 * published should not sit inside a checkout that gets pulled over.
 */
export const LEDGER_DIR =
  process.env.SOCIAL_LEDGER_DIR?.trim() || join(process.cwd(), ".tare", "social");

function fileFor(dir: string, ms: number): string {
  return join(dir, `posts-${utcMonth(ms)}.ndjson`);
}

async function readRecords(path: string): Promise<PostRecord[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    // A month with no posts yet is the normal case on the first of the month,
    // not a fault.
    return [];
  }
  const out: PostRecord[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as PostRecord);
    } catch {
      // A torn last line can only come from a crash mid-write. Skipping it
      // costs one record; throwing would take the whole month's count with it.
    }
  }
  return out;
}

export class FileLedger implements PostLedger {
  constructor(private readonly dir: string = LEDGER_DIR) {}

  /**
   * The two months either side of `at`.
   *
   * A dedupe key is at most days old, so the month containing `at` plus the one
   * before it covers every case including a post due at 00:05 on the 1st. It is
   * `at` and not `Date.now()` on purpose: `record` files by the instant the
   * caller gave it, and a reader working from wall-clock time would miss its
   * own write the moment the two fell in different months.
   */
  private async recent(at: number): Promise<PostRecord[]> {
    const previous = Date.parse(`${utcMonth(at)}-01T00:00:00.000Z`) - 1;
    const [thisMonth, lastMonth] = await Promise.all([
      readRecords(fileFor(this.dir, at)),
      readRecords(fileFor(this.dir, previous)),
    ]);
    return [...lastMonth, ...thisMonth];
  }

  async has(key: string, channel: Channel, at: number): Promise<boolean> {
    const records = await this.recent(at);
    return records.some((r) => r.ok && r.key === key && r.channel === channel);
  }

  async attempts(key: string, channel: Channel, at: number): Promise<number> {
    const records = await this.recent(at);
    return records.filter((r) => r.key === key && r.channel === channel).length;
  }

  async countMonth(channel: Channel, at: number): Promise<number> {
    const records = await readRecords(fileFor(this.dir, at));
    return records.filter((r) => r.ok && r.channel === channel).length;
  }

  async record(record: PostRecord): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await appendFile(fileFor(this.dir, Date.parse(record.at)), `${JSON.stringify(record)}\n`, "utf8");
  }
}

/**
 * A ledger that never refuses and never breaks a delivery.
 *
 * The alert path runs inside a request handler that may be on a read-only
 * filesystem. Losing the bookkeeping there is a degraded budget count; throwing
 * would be a lost alert. So writes are swallowed and reads answer "nothing
 * recorded", which fails open on the budget — X returns 429 at its own cap, and
 * `x.ts` already reads that as the monthly limit rather than a burst.
 */
export function softLedger(ledger: PostLedger, onError?: (error: Error) => void): PostLedger {
  const soften = async <T>(work: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      onError?.(error as Error);
      return fallback;
    }
  };
  return {
    has: (key, channel, at) => soften(() => ledger.has(key, channel, at), false),
    // Zero, not a large number: a read fault must not look like exhausted
    // retries and suppress a post. The runner keeps its own in-process count as
    // the backstop, so a broken ledger still cannot retry forever.
    attempts: (key, channel, at) => soften(() => ledger.attempts(key, channel, at), 0),
    countMonth: (channel, at) => soften(() => ledger.countMonth(channel, at), 0),
    record: (record) => soften(() => ledger.record(record), undefined),
  };
}

/** An in-memory ledger, for previews and the check script. Nothing is written. */
export function memoryLedger(): PostLedger {
  const records: PostRecord[] = [];
  return {
    // No `at` needed: everything ever recorded is still in the array.
    async has(key, channel) {
      return records.some((r) => r.ok && r.key === key && r.channel === channel);
    },
    async attempts(key, channel) {
      return records.filter((r) => r.key === key && r.channel === channel).length;
    },
    async countMonth(channel, at) {
      const month = utcMonth(at);
      return records.filter((r) => r.ok && r.channel === channel && utcMonth(Date.parse(r.at)) === month)
        .length;
    },
    async record(record) {
      records.push(record);
    },
  };
}

let cached: PostLedger | undefined;

/** The process-wide ledger. File-backed, and never allowed to break a send. */
export function getLedger(): PostLedger {
  if (!cached) {
    cached = softLedger(new FileLedger(), (error) => {
      console.error(`[social] ledger unavailable: ${error.message}`);
    });
  }
  return cached;
}
