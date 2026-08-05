/**
 * Alert copy assembly.
 *
 * Builds the context every template reads from, picks a variant (see copy.ts),
 * and wraps it in the per-channel furniture. The house rule (§1) is enforced by
 * what this file makes available: there is no field here that names a firm, so
 * no template can reach for one.
 */

import { dwell as formatDwell, money, seconds, shortAddress, utcTime } from "@/lib/format";
import { SITE_URL } from "@/lib/config/site";
import { ALLOW_SIMULATED } from "@/lib/alerts/config";
import { pickVariant, type CopyContext } from "@/lib/alerts/copy";
import type { AlertEvent } from "@/lib/alerts/types";
import type { DataSource } from "@/lib/data/types";

/** Violet arrives, green stays, rose leaves — the three meanings of §5. */
const MARK: Record<AlertEvent["kind"], string> = {
  arrival: "🟣",
  reexport: "🔴",
  idle: "🟢",
  first_seen: "🟣",
};

/**
 * Fallback headers. Most variants write their own — a header carrying the
 * figure or the elapsed time beats a category label, and repeating one label
 * across every post is what makes a feed look automated.
 *
 * Plain either way. The schema words — `reexported`, `held` — are in the
 * footer, under a sentence that has already shown what they describe.
 */
const HEADLINE: Record<AlertEvent["kind"], string> = {
  arrival: "Money arrived",
  reexport: "Money left again",
  idle: "Still not moved",
  first_seen: "New wallet",
};

/**
 * How we know where it came from, said the way it would be said out loud.
 * Bridges carry a message id we can match; exchange withdrawals are recognised
 * from a labelled hot wallet, which is a weaker claim. §3.2 says we state the
 * difference rather than smooth it, and an alert is one of the surfaces that
 * has to — so the plain sentence leads and the schema word follows it, which is
 * how a reader learns the word instead of bouncing off it.
 */
const EVIDENCE: Record<string, string> = {
  matched: "The bridge's own record confirms where this came from",
  attributed: "We recognised the exchange's wallet — less certain than a bridge",
  unattributed: "We could not confirm where this came from",
};

/**
 * "a Binance withdrawal" but "an OKX withdrawal". Venue names are read as words
 * when they are words and as letters when they are acronyms, so the rule is the
 * spoken sound, not the letter: a leading vowel letter takes "an", and so does a
 * consonant whose letter-name opens on a vowel (F, H, L, M, N, R, S, X) when it
 * starts an all-caps run.
 */
const YOO_INITIAL = new Set(["Uniswap", "Unichain", "Union", "Universal"]);

function article(name: string): "a" | "an" {
  if (YOO_INITIAL.has(name)) return "a";
  if (/^[AEIOU]/.test(name)) return "an";
  return /^[FHLMNRSX](?![a-z])/.test(name) ? "an" : "a";
}

/** "4 hours", "34 minutes", "under a minute" — reads inside a sentence. */
function humanDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function buildContext(event: AlertEvent, now: number): CopyContext {
  const e = event.entry;
  const isBridge = e.kind === "bridge";
  const partial = event.kind === "reexport" && event.movedUsd < e.amountUsd * 0.995;
  const share = e.amountUsd > 0 ? event.movedUsd / e.amountUsd : 0;

  return {
    amount: money(event.movedUsd),
    arrived: money(e.amountUsd),
    remaining: money(Math.max(0, e.amountUsd - event.movedUsd)),
    sharePct: `${Math.round(share * 100)}%`,
    // What a gross tracker prints for a completed round trip: the leg in and
    // the leg out, both counted.
    roundTrip: money(event.movedUsd * 2),
    // A venue is named on its own — "in from Binance" is how the reader
    // already says it, and the footer states that we caught it off a hot
    // wallet rather than a bridge record, so nothing is lost by dropping the
    // word "withdrawal" from every sentence.
    source: isBridge ? `${e.origin} via ${e.route}` : e.origin,
    origin: e.origin,
    originArticle: article(e.origin),
    route: e.route,
    isBridge,
    wallet: e.recipient.firstSeen
      ? "a wallet that had never used Solana before today"
      : "a wallet that has used Solana before",
    firstSeen: e.recipient.firstSeen,
    settle: seconds(e.lagMs),
    fastSettle: e.lagMs < 5_000,
    slowSettle: e.lagMs > 12_000,
    dwell: event.detail ?? humanDuration(e.dwellMs ?? 0),
    arrivedAt: `${utcTime(e.solanaTs)} UTC`,
    onChain: humanDuration(Math.max(0, now - Date.parse(e.solanaTs))),
    partial,
    large: event.movedUsd >= 25_000_000,
    confidence: e.confidence,
    link: `${SITE_URL}/day/${e.solanaTs.slice(0, 10)}`,
  };
}

/**
 * Applied here rather than in a transport, so no delivery path can post an
 * unlabelled simulated figure however it is reached.
 */
function prefix(dataSource: DataSource): string {
  return dataSource === "sim" && ALLOW_SIMULATED ? "[SIMULATED] " : "";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface FormatOptions {
  now?: () => number;
}

/** Telegram, HTML parse mode. Room to be complete. */
export function telegramMessage(
  event: AlertEvent,
  dataSource: DataSource,
  options: FormatOptions = {},
): string {
  const now = (options.now ?? Date.now)();
  const context = buildContext(event, now);
  const variant = pickVariant(event.kind, event.entry.id, context);
  const e = event.entry;

  const history = context.firstSeen
    ? "never used Solana before today"
    : "has used Solana before";
  const evidence = EVIDENCE[e.confidence] ?? EVIDENCE.unattributed!;
  const title = variant.title?.(context) ?? HEADLINE[event.kind];

  return [
    `${MARK[event.kind]} <b>${escapeHtml(prefix(dataSource) + title)}</b>`,
    "",
    ...variant.telegram(context),
    "",
    `Wallet <code>${escapeHtml(shortAddress(e.recipient.address))}</code> · ${history} · arrived in ${context.settle}`,
    `${evidence} (<code>${e.confidence}</code>)`,
    "",
    context.link,
  ].join("\n");
}

/**
 * X, 280 characters. A t.co link always costs 23 whatever its length, so the
 * body budget is 280 − 23 − 1. Variants are written to fit; if one ever does
 * not, this trims at a sentence boundary rather than mid-figure.
 */
export function xMessage(
  event: AlertEvent,
  dataSource: DataSource,
  options: FormatOptions = {},
): string {
  const now = (options.now ?? Date.now)();
  const context = buildContext(event, now);
  const variant = pickVariant(event.kind, event.entry.id, context);
  const budget = 280 - 23 - 1;

  let body = prefix(dataSource) + variant.x(context);
  if (body.length > budget) {
    const sentences = body.split(/(?<=\.) /);
    body = "";
    for (const sentence of sentences) {
      if ((body ? body.length + 1 : 0) + sentence.length > budget) break;
      body = body ? `${body} ${sentence}` : sentence;
    }
  }
  return `${body}\n${context.link}`;
}

/** Exposed so the preview script can render every variant, not just the picked one. */
export { buildContext, MARK, HEADLINE };
