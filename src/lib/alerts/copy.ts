/**
 * Alert copy, in variants.
 *
 * A feed that posts the same sentence with a different number every time reads
 * as a bot, and a bot is not worth following. Each alert kind carries several
 * phrasings; the applicable ones are filtered by what is actually notable about
 * the event — a partial exit, a first-seen recipient, an unusually slow
 * settlement — and one is chosen deterministically from the entry id.
 *
 * Deterministic, not random, for two reasons: a retry after a transport error
 * must produce the identical message rather than a second different one, and a
 * reviewer reading this file can reproduce exactly what went out.
 *
 * ## Voice
 *
 * Native to the timeline it posts on. Number first, short sentences, fragments
 * where a fragment is clearer, and none of the hedging a press release would
 * put in. "$39.9M in from Ethereum. Out again four hours later." — that is the
 * register, and it is shorter than the polite version rather than louder.
 *
 * Loud is a different thing and we do not do it: no exclamation, no all-caps,
 * no rocket, no adjective doing work a number should do. The figures are the
 * only interesting thing in the message and anything decorating them competes.
 *
 * Plain over precise in the body, precise in the footer. The first line never
 * needs a glossary — an alert arrives alone on a phone with no page around it,
 * so it says "gone" and "sitting" rather than "re-exported" and "idle". The
 * schema words still travel, paired with their meaning in the footer, after a
 * sentence has already shown what they describe.
 *
 * ## What the voice may not reach for
 *
 * §1 is not relaxed because the register got shorter. "Whale", "smart money"
 * and "aped in" are all guesses about who is acting and why, and they are
 * exactly the guesses that turn a measurement into a defamation risk. Describe
 * the flow and what is verifiable about the wallet — how much, from where, seen
 * before or not, how long it sat. Venue and bridge names are the port, never
 * the firm.
 */

import { hashSeed } from "@/lib/rng";
import type { AlertKind } from "@/lib/alerts/types";

export interface CopyContext {
  /** The value this alert is about. */
  amount: string;
  /** The full arrival, when a partial exit means it differs from `amount`. */
  arrived: string;
  /** What is still on-chain after a partial exit. */
  remaining: string;
  /** "60%" of the arrival, for partial exits. */
  sharePct: string;
  /** What a gross tracker prints for a completed round trip: the amount twice. */
  roundTrip: string;
  /** "Ethereum via Wormhole" or "Binance". */
  source: string;
  /** "Ethereum" or "Binance". */
  origin: string;
  /** "a" or "an", agreeing with `origin` — "a Binance", "an OKX". */
  originArticle: string;
  /** "Wormhole", or "withdrawal" for a venue. */
  route: string;
  isBridge: boolean;
  /** "a wallet with no Solana history before today". */
  wallet: string;
  firstSeen: boolean;
  /** "6.4s". */
  settle: string;
  fastSettle: boolean;
  slowSettle: boolean;
  /** "34 minutes". */
  dwell: string;
  /** "14:02 UTC". */
  arrivedAt: string;
  /** "four hours" — time on-chain before it left. */
  onChain: string;
  partial: boolean;
  large: boolean;
  confidence: string;
  link: string;
}

interface Variant {
  id: string;
  /** Only offered when the event actually has this property. */
  when?: (c: CopyContext) => boolean;
  /** Telegram header. Falls back to the per-kind default in format.ts. */
  title?: (c: CopyContext) => string;
  /** Telegram body lines. The header and footer are added by the formatter. */
  telegram: (c: CopyContext) => string[];
  x: (c: CopyContext) => string;
}

/* -------------------------------------------------------------------------
 * Money that came in and then left again.
 *
 * The whole method exists to catch this, so the copy is allowed to say why it
 * matters — in one clause, at the end, after the event.
 * ---------------------------------------------------------------------- */
const REEXPORT: Variant[] = [
  {
    id: "round-trip-closed",
    when: (c) => !c.partial,
    title: (c) => `Out again after ${c.onChain}`,
    telegram: (c) => [
      `<b>${c.amount}</b> in from ${c.source}. ${c.onChain} later it is gone.`,
      `Money that leaves again was never money that arrived. Today's "still on Solana" figure drops by the same amount.`,
    ],
    x: (c) =>
      `${c.amount} in from ${c.source}. Out again ${c.onChain} later. Volume charts count that trip twice. We count it zero.`,
  },
  {
    id: "gross-vs-net",
    when: (c) => !c.partial && c.large,
    title: () => "Round trip",
    telegram: (c) => [
      `<b>${c.amount}</b> bridged in from ${c.origin}. Bridged straight back out.`,
      `Nothing stayed. Elsewhere the same trip prints as ${c.roundTrip} of volume.`,
    ],
    x: (c) =>
      `${c.amount} bridged into Solana from ${c.origin}, then straight back out. Nothing stayed. Elsewhere the same round trip prints as ${c.roundTrip} of volume.`,
  },
  {
    id: "partial-exit",
    when: (c) => c.partial,
    title: (c) => `${c.sharePct} of it left`,
    telegram: (c) => [
      `<b>${c.arrived}</b> in from ${c.source}. <b>${c.amount}</b> already back out — ${c.sharePct}.`,
      `${c.remaining} stayed. That is the part we count.`,
    ],
    x: (c) =>
      `${c.arrived} in from ${c.source}. ${c.amount} already back out — ${c.sharePct} of it. ${c.remaining} stayed, and that is the only part we count.`,
  },
  {
    id: "timed",
    when: (c) => !c.partial,
    title: (c) => `${c.onChain} on chain`,
    telegram: (c) => [
      `<b>${c.amount}</b> landed at ${c.arrivedAt} from ${c.source}. Already gone.`,
      `Round trip, not inflow. It never counted as money that arrived.`,
    ],
    x: (c) =>
      `${c.amount} landed on Solana at ${c.arrivedAt} from ${c.source}. Already gone — ${c.onChain} on chain, start to finish. Round trip, not inflow.`,
  },
];

/* -------------------------------------------------------------------------
 * Money arriving.
 * ---------------------------------------------------------------------- */
const ARRIVAL: Variant[] = [
  {
    id: "plain",
    title: (c) => `${c.amount} in`,
    telegram: (c) => [
      `From ${c.source}, landed in ${c.settle}.`,
      `24-hour clock starts now. Whether it stays is the only part that counts.`,
    ],
    x: (c) =>
      `${c.amount} into Solana from ${c.source}, landed in ${c.settle}. 24-hour clock starts now — whether it stays is the only part that counts.`,
  },
  {
    id: "attribution-note",
    when: (c) => !c.isBridge,
    title: (c) => `${c.amount} out of ${c.origin}`,
    telegram: (c) => [
      `Into a Solana address that is not an exchange.`,
      `Caught off the hot wallet, not a bridge record. Weaker proof, and we tag it that way on the entry.`,
    ],
    x: (c) =>
      `${c.amount} out of ${c.origin} and onto Solana. Caught off the hot wallet, not a bridge record — weaker proof, and every entry says which one it is.`,
  },
  {
    id: "matched-note",
    when: (c) => c.isBridge,
    title: (c) => `${c.amount} in from ${c.origin}`,
    telegram: (c) => [
      `Over ${c.route}, matched to the deposit on the other side by the bridge's own transfer ID.`,
      `Which is why the ${c.settle} is measured and not a guess.`,
    ],
    x: (c) =>
      `${c.amount} into Solana from ${c.origin} over ${c.route}. Matched to the deposit on the other side by the bridge's own ID, so the ${c.settle} is measured, not a guess.`,
  },
  {
    id: "size",
    when: (c) => c.large,
    title: (c) => `${c.amount}, one transfer`,
    telegram: (c) => [
      `In from ${c.source}, landed in ${c.settle}. One of the biggest single arrivals on Solana today.`,
      `Counts as money that stayed until something moves it.`,
    ],
    x: (c) =>
      `${c.amount} into Solana from ${c.source} in one transfer, landed in ${c.settle}. One of the largest single arrivals on the chain today.`,
  },
  {
    id: "slow-settle",
    when: (c) => c.slowSettle && c.isBridge,
    title: (c) => `${c.amount} in, ${c.settle} to land`,
    telegram: (c) => [
      `From ${c.origin} over ${c.route}. Slower than this route usually runs.`,
      `Matched to the origin deposit, so that lag is measured rather than estimated.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.origin} over ${c.route} took ${c.settle} to land — slower than this route usually runs. Matched to the origin deposit, so the lag is measured.`,
  },
];

/* -------------------------------------------------------------------------
 * Money that arrived and has not done anything yet.
 *
 * "Idle capital" is the phrase on the site and it does not explain itself on a
 * phone. Every variant here spells out what did not happen — no swap, no
 * deposit, no transfer — before it reaches for the idea.
 * ---------------------------------------------------------------------- */
const IDLE: Variant[] = [
  {
    id: "dry-powder",
    title: (c) => `${c.dwell}, no moves`,
    telegram: (c) => [
      `<b>${c.amount}</b> in from ${c.source} and it has not moved since.`,
      `No swap, no deposit, no transfer out. Dry powder, still sitting.`,
    ],
    x: (c) =>
      `${c.amount} into Solana from ${c.source} ${c.dwell} ago. Zero moves since. No swap, no deposit, no transfer out. Dry powder, still sitting.`,
  },
  {
    id: "no-action",
    title: () => "Still sitting",
    telegram: (c) => [
      `${c.dwell} on Solana and nothing: <b>${c.amount}</b> from ${c.source} is exactly where it landed.`,
      `Not swapped, not deposited, not sent on.`,
    ],
    x: (c) =>
      `${c.dwell} on Solana and nothing: ${c.amount} from ${c.source} is exactly where it landed. Not swapped, not deposited, not sent on.`,
  },
  {
    id: "unspent-large",
    when: (c) => c.large,
    title: (c) => `${c.amount}, untouched`,
    telegram: (c) => [
      `${c.dwell} since it landed from ${c.source}. Nothing has touched it.`,
      `No swap, no deposit, no transfer out. Money that came in to be spent and has not been.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.source} still untouched ${c.dwell} after landing. No swap, no deposit, no transfer out. Came in to be spent, hasn't been.`,
  },
];

/* -------------------------------------------------------------------------
 * A wallet with no history on the chain before today.
 * ---------------------------------------------------------------------- */
const FIRST_SEEN: Variant[] = [
  {
    id: "no-history",
    title: () => "Fresh wallet",
    telegram: (c) => [
      `Zero Solana history before today. Just took <b>${c.amount}</b> from ${c.source}.`,
      `Landed in ${c.settle}. We post whatever it touches first.`,
    ],
    x: (c) =>
      `Fresh wallet, zero Solana history before today, just took ${c.amount} from ${c.source}. We post whatever it touches first.`,
  },
  {
    id: "funded",
    title: (c) => `New wallet, ${c.amount} in`,
    telegram: (c) => [
      `Funded from ${c.source}. Nothing on Solana before today.`,
      `Watching for what it buys, lends or stakes first.`,
    ],
    x: (c) =>
      `New Solana wallet funded with ${c.amount} from ${c.source}. Nothing on this chain before today. Watching what it does first.`,
  },
  {
    id: "size",
    when: (c) => c.large,
    title: (c) => `${c.amount} to a brand new address`,
    telegram: (c) => [
      `From ${c.source}, to an address that did not exist on Solana yesterday.`,
      `New money coming in, not money rotating inside the chain. Landed in ${c.settle}, first move still to come.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.source} went to an address that did not exist on Solana yesterday. New money coming in, not money rotating inside the chain.`,
  },
];

const VARIANTS: Record<AlertKind, Variant[]> = {
  reexport: REEXPORT,
  arrival: ARRIVAL,
  idle: IDLE,
  first_seen: FIRST_SEEN,
};

/**
 * Picks the variant for an event. Filters to the ones whose conditions the
 * event actually satisfies, then selects by hashing the entry id — so the same
 * entry always renders the same way, and two entries in a row almost never do.
 */
export function pickVariant(kind: AlertKind, entryId: string, context: CopyContext): Variant {
  const pool = VARIANTS[kind].filter((v) => !v.when || v.when(context));
  // Every kind has at least one unconditional variant, so the pool is never
  // empty — but fall back to the full list rather than throw if that changes.
  const usable = pool.length ? pool : VARIANTS[kind];
  const index = hashSeed(`${kind}:${entryId}`) % usable.length;
  return usable[index]!;
}

export { VARIANTS };
export type { Variant };
