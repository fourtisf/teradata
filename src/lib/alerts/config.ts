/**
 * Alert thresholds, cooldowns and credentials.
 *
 * Thresholds are per-channel on purpose. Telegram is a subscriber feed and can
 * carry every qualifying movement; X is a public timeline with a hard monthly
 * post budget, so it only ever gets the largest ones. See `X_MONTHLY_BUDGET`.
 */

import type { AlertKind, Channel } from "@/lib/alerts/types";

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** Minimum USD for each alert kind, per channel. */
export const THRESHOLDS: Record<Channel, Record<AlertKind, number>> = {
  telegram: {
    arrival: num(process.env.ALERT_TG_ARRIVAL_USD, 5_000_000),
    reexport: num(process.env.ALERT_TG_REEXPORT_USD, 3_000_000),
    idle: num(process.env.ALERT_TG_IDLE_USD, 2_000_000),
    first_seen: num(process.env.ALERT_TG_FIRST_SEEN_USD, 1_000_000),
  },
  x: {
    // X's free tier allows 500 posts a month. At a $5M floor with real volume
    // that is still easy to blow through, so the public feed starts an order of
    // magnitude higher than the subscriber feed and is rate-limited on top.
    arrival: num(process.env.ALERT_X_ARRIVAL_USD, 25_000_000),
    reexport: num(process.env.ALERT_X_REEXPORT_USD, 20_000_000),
    idle: num(process.env.ALERT_X_IDLE_USD, 25_000_000),
    first_seen: num(process.env.ALERT_X_FIRST_SEEN_USD, 10_000_000),
  },
};

/** Shortest gap between two posts on a channel, in seconds. */
export const COOLDOWN_SECONDS: Record<Channel, number> = {
  telegram: num(process.env.ALERT_TG_COOLDOWN_S, 20),
  x: num(process.env.ALERT_X_COOLDOWN_S, 1_800),
};

/** How long the same entry+kind is suppressed after firing once. */
export const DEDUPE_TTL_SECONDS = num(process.env.ALERT_DEDUPE_TTL_S, 6 * 3600);

export const TELEGRAM = {
  token: process.env.TELEGRAM_BOT_TOKEN?.trim() || null,
  chatId: process.env.TELEGRAM_CHAT_ID?.trim() || null,
};

export const X_CREDENTIALS = {
  consumerKey: process.env.X_API_KEY?.trim() || null,
  consumerSecret: process.env.X_API_SECRET?.trim() || null,
  accessToken: process.env.X_ACCESS_TOKEN?.trim() || null,
  accessSecret: process.env.X_ACCESS_SECRET?.trim() || null,
};

/**
 * The hard guard.
 *
 * Every figure this app produces is invented while DATA_SOURCE=sim. A website
 * showing simulated numbers is labelled and a reader can see the label; a
 * Telegram message or a tweet is pushed, screenshotted and quoted with the
 * label stripped. So delivery is refused outright in sim mode unless this is
 * explicitly set — and when it is set, every message is prefixed at format
 * time, where no transport can drop it.
 */
export const ALLOW_SIMULATED = process.env.ALERTS_ALLOW_SIMULATED === "true";

/** Shared secret the P1 ingest worker presents when POSTing events in. */
export const DISPATCH_SECRET = process.env.ALERTS_DISPATCH_SECRET?.trim() || null;

/**
 * X's free tier: 500 posts per calendar month, hard.
 *
 * This used to be documented and unenforced, which was survivable while nothing
 * published without a person starting it. It is not survivable now that the
 * scheduler in `src/lib/social/` posts unattended — an allowance spent by the
 * 20th means the feed goes silent for eleven days, and the first sign of it is
 * a 429 during the exact event worth posting about. `social/budget.ts` counts
 * against the durable ledger and refuses before the API does.
 */
export const X_MONTHLY_BUDGET = num(process.env.X_MONTHLY_BUDGET, 500);

/**
 * Held back for scheduled posts.
 *
 * Thirty-one dailies and five weeklies is thirty-six, and the reserve is a
 * little over that. Alerts are the elastic half — there can be five in a day or
 * none — so they are the half that stops first. A recap that skips because a
 * busy Tuesday ate the month is a gap in the record; an alert that skips is one
 * movement not announced.
 */
export const X_SCHEDULED_RESERVE = num(process.env.ALERT_X_SCHEDULED_RESERVE, 60);

/**
 * Never spent by either half. The cap is enforced by X as a 429, and hitting it
 * turns every subsequent post into a failed one; stopping short leaves room to
 * notice.
 */
export const X_SAFETY_MARGIN = num(process.env.ALERT_X_SAFETY_MARGIN, 20);
