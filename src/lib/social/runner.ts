/**
 * The poster.
 *
 * One entry point, `runDue`, called on a timer by `scripts/social-bot.mts`. It
 * answers a single question — is there a post owed right now, and if so has it
 * already gone out — and everything that could embarrass the product sits
 * between that question and the transport: the simulated-data guard, the
 * indexer check, the empty-day refusal, the durable dedupe, the X budget and
 * the attempt cap.
 *
 * Deliberately the same shape as `alerts/dispatch.ts`. Two paths publish under
 * the same two accounts, and a reader who has understood one should not have to
 * learn a second vocabulary to audit the other.
 */

import { ALLOW_SIMULATED } from "@/lib/alerts/config";
import { CAPTION_LIMIT, sendTelegram, sendTelegramPhoto, telegramConfigured } from "@/lib/alerts/telegram";
import { sendX, xConfigured } from "@/lib/alerts/x";
import { getDataProvider } from "@/lib/data";
import { checkBudget } from "@/lib/social/budget";
import { fetchDayCard } from "@/lib/social/card";
import { composeDaily, composeWeekly } from "@/lib/social/compose";
import { ENABLED_CHANNELS } from "@/lib/social/config";
import { dailyFigures, weeklyFigures } from "@/lib/social/figures";
import { getLedger } from "@/lib/social/ledger";
import { dueOccurrences, settledDate, settledWeek } from "@/lib/social/schedule";
import type { DataProvider } from "@/lib/data/types";
import type {
  Channel,
  ComposedPost,
  JobSpec,
  Occurrence,
  PostLedger,
  PostOutcome,
} from "@/lib/social/types";

/**
 * How many times one occurrence may be tried on one channel.
 *
 * A tick every minute against an occurrence that stays due for twelve hours is
 * 720 attempts at a transport that is not coming back, so the cap is not
 * optional. Three is enough to cross a restart or a brief outage and small
 * enough to bound the duplicate risk: delivery is at-least-once, because a lost
 * response is indistinguishable from a refusal and only a confirmed success is
 * written to the ledger.
 */
const MAX_ATTEMPTS = 3;

/** Backstop for the durable count, so a broken ledger cannot retry forever. */
const localAttempts = new Map<string, number>();

export interface RunOptions {
  provider?: DataProvider;
  ledger?: PostLedger;
  now?: number;
  /** Compose and decide, deliver nothing. */
  dryRun?: boolean;
  /** Narrow the channels further than `SOCIAL_CHANNELS` does. */
  only?: Channel[];
  /**
   * Publish simulated figures to X. Ignored once the data is real.
   *
   * `ALERTS_ALLOW_SIMULATED` exists so the delivery path can be tested into a
   * *private* Telegram channel, where a mistake is recoverable. X has no
   * private target — @TareData_ is public, and an invented dollar amount
   * published under the brand is precisely what §1 says cannot be undone by
   * fixing the data afterwards. Deleting it does not help: it was live, and it
   * was screenshottable.
   *
   * So the one env var does not unlock both channels. `alert-test.mts` makes a
   * person type `--public` for the same reason; this is that refusal, in the
   * path that runs unattended.
   */
  allowSimulatedPublic?: boolean;
  /** Override the schedule. The check script drives a year through this. */
  specs?: JobSpec[];
}

function outcome(
  occurrence: Occurrence,
  channel: Channel,
  ok: boolean,
  extra: { id?: string; reason?: string } = {},
): PostOutcome {
  return { key: occurrence.key, kind: occurrence.spec.kind, channel, ok, ...extra };
}

/**
 * The figures for one occurrence, composed.
 *
 * Null is a normal answer, not a failure: a day the provider has no page for, a
 * day nothing arrived, a week missing one of its seven days. Each of those is a
 * post that should not exist, and inventing a `$0` for it would put a figure
 * under the brand that reads as complete and is not.
 */
export async function buildPost(
  provider: DataProvider,
  occurrence: Occurrence,
  now: number,
): Promise<ComposedPost | null> {
  if (occurrence.spec.kind === "daily") {
    const figures = await dailyFigures(provider, settledDate(now));
    return figures ? composeDaily(occurrence.key, figures, provider.source) : null;
  }
  const figures = await weeklyFigures(provider, settledWeek(now));
  return figures ? composeWeekly(occurrence.key, figures, provider.source) : null;
}

async function deliver(post: ComposedPost, channel: Channel) {
  if (channel === "x") return sendX(post.x);

  // The card is worth uploading on Telegram and only on Telegram — the text
  // message disables link previews, so nothing unfurls. On a transport failure
  // there is no fall back to a plain message: a timeout after Telegram accepted
  // the photo is indistinguishable from a rejection, and falling back would
  // turn that into a guaranteed second copy. The retry handles it instead.
  if (post.cardDate && post.telegram.length <= CAPTION_LIMIT) {
    const image = await fetchDayCard(post.cardDate);
    if (image) return sendTelegramPhoto(post.telegram, image);
  }
  return sendTelegram(post.telegram);
}

export async function runDue(options: RunOptions = {}): Promise<PostOutcome[]> {
  const now = options.now ?? Date.now();
  const provider = options.provider ?? getDataProvider();
  const ledger = options.ledger ?? getLedger();
  const channels = ENABLED_CHANNELS.filter((c) => !options.only || options.only.includes(c));
  const occurrences = dueOccurrences(now, options.specs);
  const results: PostOutcome[] = [];

  if (!occurrences.length) return results;

  // The guard, first and unconditional. Simulated figures are not pushed to
  // anyone's phone or timeline: a page can carry a label a reader sees, a
  // forwarded message cannot.
  if (provider.source === "sim" && !ALLOW_SIMULATED) {
    for (const occurrence of occurrences) {
      for (const channel of channels) {
        results.push(
          outcome(occurrence, channel, false, {
            reason: "refused: figures are simulated (set ALERTS_ALLOW_SIMULATED=true to test)",
          }),
        );
      }
    }
    return results;
  }

  // Nothing left to do is the answer on almost every tick — an occurrence stays
  // due for hours after it has been published — so settle that against the
  // ledger before asking the provider for anything.
  const pending: Array<{ occurrence: Occurrence; channels: Channel[] }> = [];
  for (const occurrence of occurrences) {
    const remaining: Channel[] = [];
    for (const channel of channels) {
      if (await ledger.has(occurrence.key, channel, now)) {
        results.push(outcome(occurrence, channel, false, { reason: "already posted" }));
      } else {
        remaining.push(channel);
      }
    }
    if (remaining.length) pending.push({ occurrence, channels: remaining });
  }
  if (!pending.length) return results;

  // A recap is about settled days, so a momentary wobble is not a reason to
  // skip — but an indexer that is down may be down because it has a gap, and a
  // total drawn across a gap is wrong in the direction that flatters us.
  const status = await provider.getStatus();
  if (status.state === "down") {
    for (const { occurrence, channels: remaining } of pending) {
      for (const channel of remaining) {
        results.push(outcome(occurrence, channel, false, { reason: "refused: indexer is down" }));
      }
    }
    return results;
  }

  for (const { occurrence, channels: remaining } of pending) {
    let post: ComposedPost | null = null;
    let built = false;

    for (const channel of remaining) {
      // The second half of the guard. The first refused everything unless
      // ALERTS_ALLOW_SIMULATED was set; this one holds X back even then,
      // because that switch was written for a private Telegram channel and X
      // does not have one.
      if (provider.source === "sim" && channel === "x" && !options.allowSimulatedPublic) {
        results.push(
          outcome(occurrence, channel, false, {
            reason: "refused: X is public and these figures are simulated (--public to override)",
          }),
        );
        continue;
      }

      const attemptKey = `${occurrence.key}:${channel}`;
      const tried = Math.max(
        await ledger.attempts(occurrence.key, channel, now),
        localAttempts.get(attemptKey) ?? 0,
      );
      if (tried >= MAX_ATTEMPTS) {
        results.push(outcome(occurrence, channel, false, { reason: `gave up after ${tried} attempts` }));
        continue;
      }

      const configured = channel === "telegram" ? telegramConfigured() : xConfigured();
      if (!configured) {
        results.push(outcome(occurrence, channel, false, { reason: "not configured" }));
        continue;
      }

      const budget = await checkBudget(ledger, channel, "scheduled", now);
      if (!budget.ok) {
        results.push(outcome(occurrence, channel, false, { reason: budget.reason }));
        continue;
      }

      // Built once per occurrence, and only once a channel actually wants it —
      // the weekly reads seven day pages and there is no point paying for that
      // to discover both channels were switched off.
      if (!built) {
        post = await buildPost(provider, occurrence, now);
        built = true;
      }
      if (!post) {
        results.push(outcome(occurrence, channel, false, { reason: "no figures for that period" }));
        continue;
      }

      if (options.dryRun) {
        const text = channel === "telegram" ? post.telegram : post.x;
        results.push(outcome(occurrence, channel, false, { reason: `dry run: ${text.length} chars` }));
        continue;
      }

      localAttempts.set(attemptKey, tried + 1);
      const sent = await deliver(post, channel);
      await ledger.record({
        key: occurrence.key,
        channel,
        purpose: "scheduled",
        ok: sent.ok,
        id: sent.id,
        reason: sent.reason,
        at: new Date(now).toISOString(),
      });
      results.push(outcome(occurrence, channel, sent.ok, { id: sent.id, reason: sent.reason }));
    }
  }

  return results;
}

/** Exposed for the check script, which drives many runs through one process. */
export function resetAttempts(): void {
  localAttempts.clear();
}
