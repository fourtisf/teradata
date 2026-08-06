/**
 * What the scheduled poster reads from the environment.
 *
 * Every value here has a working default, because the failure mode of a missing
 * one is an unattended process that posts at the wrong hour or not at all —
 * neither of which announces itself.
 *
 * `SOCIAL_LEDGER_DIR` is deliberately not here; it lives in `ledger.ts`.
 *
 * The two list settings are parsed lazily, and that is not a micro-optimisation.
 * A malformed one throws — silently falling back to "everything" is how a typo
 * becomes a post on a channel someone meant to switch off — and the status page
 * imports this module to say when the next recap is due. Parsing at module load
 * would let `SOCIAL_CHANNELS=telegramm` take down a public page that never reads
 * it. Parsing on the first call means the throw lands in the process that would
 * have acted on the value.
 */

import type { Channel, JobKind } from "@/lib/social/types";

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function list<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T[]): T[] {
  const raw = value?.trim();
  if (!raw) return fallback;
  const picked = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is T => (allowed as readonly string[]).includes(part));
  // An unparseable list is a typo, and silently falling back to "everything" is
  // how a typo becomes a post on a channel someone meant to switch off.
  if (!picked.length) {
    throw new Error(`Expected a comma-separated subset of ${allowed.join(", ")}, got "${raw}".`);
  }
  return picked;
}

/** Memoised so the parse, and any throw, happens once per process. */
function once<T>(read: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= read());
}

/** Which clock triggers run. Both by default. */
export const enabledJobs = once(() =>
  list<JobKind>(process.env.SOCIAL_JOBS, ["daily", "weekly"], ["daily", "weekly"]),
);

/**
 * Which accounts scheduled posts go to.
 *
 * Separate from the alert path's `only` for the same reason that one exists:
 * the two channels are not equally recoverable, so bringing the feed up on
 * Telegram first and adding X once the copy has been read on a real screen has
 * to be one env var rather than a code change.
 */
export const enabledChannels = once(() =>
  list<Channel>(process.env.SOCIAL_CHANNELS, ["telegram", "x"], ["telegram", "x"]),
);

/** Minutes past midnight UTC. */
export const DAILY_AT_MINUTE = num(process.env.SOCIAL_DAILY_AT_MINUTE, 5);
export const WEEKLY_AT_MINUTE = num(process.env.SOCIAL_WEEKLY_AT_MINUTE, 20);
/** 1 = Monday. The week being summarised has ended by then. */
export const WEEKLY_WEEKDAY = num(process.env.SOCIAL_WEEKLY_WEEKDAY, 1);

/**
 * §3.3's watch window, in hours, and the reason the daily post is not about
 * yesterday. §11 lists 24h as an assumption to be re-tested against real
 * volume; when it changes, this changes with it and the settled date follows.
 */
export const REEXPORT_WINDOW_HOURS = num(process.env.REEXPORT_WINDOW_HOURS, 24);

/** How often the worker looks at the clock. */
export const TICK_MS = num(process.env.SOCIAL_TICK_MS, 60_000);

/**
 * Where the card image is fetched from.
 *
 * The app's own Open Graph route, not a second renderer. `og.tsx` already
 * generates the daily card and shares `MARK` with the site so the two cannot
 * drift; fetching it over loopback extends that to the posted image for the
 * cost of one HTTP call. A second copy of the layout would drift within a
 * month.
 */
export const CARD_ORIGIN = (
  process.env.SOCIAL_CARD_ORIGIN?.trim() || "http://127.0.0.1:3000"
).replace(/\/$/, "");

/** Attach the card to Telegram posts. Off is text-only, which always works. */
export const CARD_ENABLED = process.env.SOCIAL_CARD !== "false";

/**
 * The value Telegram presents on every webhook delivery, in
 * `X-Telegram-Bot-Api-Secret-Token`. Unset closes the route entirely, the same
 * way an unset `ALERTS_DISPATCH_SECRET` closes the dispatch route — an open
 * endpoint that makes the bot speak is not a thing to leave lying around.
 */
export const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
