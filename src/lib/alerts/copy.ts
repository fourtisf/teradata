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
 * Short, and understood on the first read by someone whose English is their
 * second or third language — which is most of this audience. Number first. One
 * idea per sentence. Common words: *arrived*, *left*, *has not moved*, *sitting*.
 *
 * Three things get in the way of that, and all three are banned here:
 *
 * - **Terms of art.** *Re-exported*, *idle capital*, *dwell*, *inflow*,
 *   *settlement lag*. They belong on the site, next to a definition, and in the
 *   API. An alert arrives alone on a phone with no page around it. The footer
 *   carries the schema word after a sentence has already shown what it means.
 * - **Idioms.** *Caught off the hot wallet*, *dry powder*, *round trip*. Fluent,
 *   and opaque to anyone who did not grow up with them. "We recognised the
 *   exchange's wallet" and "money waiting to be spent" say the same thing and
 *   need nothing explained.
 * - **Volume.** No exclamation, no all-caps, no rocket, no adjective doing work
 *   the number is already doing. The figures are the only interesting thing in
 *   the message and anything decorating them competes with them.
 *
 * ## What the voice may not reach for
 *
 * §1 is not relaxed because the register got shorter. *Whale*, *smart money*
 * and *aped in* are all guesses about who is acting and why, and they are
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
  /** What a gross tracker shows for a completed round trip: the amount twice. */
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
  /** "a wallet that had never used Solana before today". */
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
  /** "4 hours" — time on-chain before it left. */
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
 * matters — in one short sentence, at the end, after the event.
 * ---------------------------------------------------------------------- */
const REEXPORT: Variant[] = [
  {
    id: "round-trip-closed",
    when: (c) => !c.partial,
    title: () => "Came in, then left",
    telegram: (c) => [
      `<b>${c.amount}</b> came in from ${c.source}. ${c.onChain} later it left Solana again.`,
      `It came in and it went out. So we count it as zero new money.`,
    ],
    x: (c) =>
      `${c.amount} came into Solana from ${c.source}. ${c.onChain} later it left again. Other sites count both moves as volume. We count it as zero new money.`,
  },
  {
    id: "gross-vs-net",
    when: (c) => !c.partial && c.large,
    title: () => "In and out, nothing stayed",
    telegram: (c) => [
      `<b>${c.amount}</b> bridged in from ${c.origin}, then bridged straight back out.`,
      `Other sites show this as ${c.roundTrip} of volume. Nothing actually stayed on Solana.`,
    ],
    x: (c) =>
      `${c.amount} bridged into Solana from ${c.origin}, then went straight back out. Other sites show that as ${c.roundTrip} of volume. Nothing stayed.`,
  },
  {
    id: "partial-exit",
    when: (c) => c.partial,
    title: (c) => `${c.sharePct} of it left`,
    telegram: (c) => [
      `<b>${c.arrived}</b> came in from ${c.source}. <b>${c.amount}</b> of it has already left — that is ${c.sharePct}.`,
      `${c.remaining} is still on Solana. Only that part counts as new money.`,
    ],
    x: (c) =>
      `${c.arrived} came into Solana from ${c.source}. ${c.amount} of it already left — ${c.sharePct}. The other ${c.remaining} is still here, and only that part counts.`,
  },
  {
    id: "timed",
    when: (c) => !c.partial,
    title: (c) => `Gone in ${c.onChain}`,
    telegram: (c) => [
      `<b>${c.amount}</b> arrived at ${c.arrivedAt} from ${c.source}. It has already left Solana.`,
      `${c.onChain} on the chain. It came in and went out, so it is not new money.`,
    ],
    x: (c) =>
      `${c.amount} arrived on Solana at ${c.arrivedAt} from ${c.source} and has already left. ${c.onChain} on the chain. In and out, so we count it as zero.`,
  },
];

/* -------------------------------------------------------------------------
 * Money arriving.
 * ---------------------------------------------------------------------- */
const ARRIVAL: Variant[] = [
  {
    id: "plain",
    title: (c) => `${c.amount} arrived`,
    telegram: (c) => [
      `From ${c.source}. It took ${c.settle} to arrive.`,
      `We now watch this wallet for 24 hours. If the money leaves again, we take it back out of today's total.`,
    ],
    x: (c) =>
      `${c.amount} arrived on Solana from ${c.source} in ${c.settle}. We watch it for 24 hours. If it leaves again, we take it back out of today's total.`,
  },
  {
    id: "attribution-note",
    when: (c) => !c.isBridge,
    title: (c) => `${c.amount} left ${c.origin}`,
    telegram: (c) => [
      `It went to a Solana wallet that is not an exchange.`,
      `We spotted this because we know that exchange's wallet. That is less certain than a bridge, and we mark it on the entry.`,
    ],
    x: (c) =>
      `${c.amount} left ${c.origin} and went to a Solana wallet. We spotted it because we know that exchange's wallet — less certain than a bridge, and we mark every entry with which one it is.`,
  },
  {
    id: "matched-note",
    when: (c) => c.isBridge,
    title: (c) => `${c.amount} arrived from ${c.origin}`,
    telegram: (c) => [
      `Sent over ${c.route}. We found the matching deposit on the ${c.origin} side using the bridge's own ID.`,
      `So the ${c.settle} it took is a real measurement, not an estimate.`,
    ],
    x: (c) =>
      `${c.amount} arrived on Solana from ${c.origin} over ${c.route}. We found the matching deposit on the other side using the bridge's own ID, so the ${c.settle} is measured, not estimated.`,
  },
  {
    id: "size",
    when: (c) => c.large,
    title: (c) => `${c.amount} in one go`,
    telegram: (c) => [
      `Arrived from ${c.source} in ${c.settle}. One of the biggest single arrivals on Solana today.`,
      `It counts as money that stayed, unless it leaves in the next 24 hours.`,
    ],
    x: (c) =>
      `${c.amount} arrived on Solana from ${c.source} in one transfer, in ${c.settle}. One of the biggest single arrivals on the chain today.`,
  },
  {
    id: "slow-settle",
    when: (c) => c.slowSettle && c.isBridge,
    title: (c) => `${c.amount} arrived, ${c.settle}`,
    telegram: (c) => [
      `From ${c.origin} over ${c.route}. Slower than this route normally takes.`,
      `We matched it to the deposit on the ${c.origin} side, so the delay is measured and not a guess.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.origin} over ${c.route} took ${c.settle} to arrive — slower than this route normally takes. Matched to the deposit on the other side, so the delay is measured.`,
  },
];

/* -------------------------------------------------------------------------
 * Money that arrived and has not done anything yet.
 *
 * "Idle capital" is the phrase on the site, and it explains nothing on a phone.
 * Every variant here lists what did not happen — no swap, no deposit, nothing
 * sent out — because that is the whole idea, and it needs no term for it.
 * ---------------------------------------------------------------------- */
const IDLE: Variant[] = [
  {
    id: "dry-powder",
    title: (c) => `${c.dwell}, still not moved`,
    telegram: (c) => [
      `<b>${c.amount}</b> arrived from ${c.source} and has not moved since.`,
      `No swap. No deposit. Nothing sent out. The money is just sitting there, waiting.`,
    ],
    x: (c) =>
      `${c.amount} arrived on Solana from ${c.source} ${c.dwell} ago and still has not moved. No swap, no deposit, nothing sent out. Just sitting there.`,
  },
  {
    id: "no-action",
    title: () => "Still not moved",
    telegram: (c) => [
      `${c.dwell} on Solana and nothing has happened. <b>${c.amount}</b> from ${c.source} is still exactly where it arrived.`,
      `Not swapped. Not deposited. Not sent anywhere.`,
    ],
    x: (c) =>
      `${c.dwell} on Solana and nothing has happened. ${c.amount} from ${c.source} is still exactly where it arrived. Not swapped, not deposited, not sent anywhere.`,
  },
  {
    id: "unspent-large",
    when: (c) => c.large,
    title: (c) => `${c.amount} not touched`,
    telegram: (c) => [
      `It arrived from ${c.source} ${c.dwell} ago and nothing has happened to it.`,
      `No swap. No deposit. Nothing sent out. This is money waiting to be spent.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.source} is still untouched ${c.dwell} after arriving. No swap, no deposit, nothing sent out. Money waiting to be spent.`,
  },
];

/* -------------------------------------------------------------------------
 * A wallet with no history on the chain before today.
 * ---------------------------------------------------------------------- */
const FIRST_SEEN: Variant[] = [
  {
    id: "no-history",
    title: () => "Brand new wallet",
    telegram: (c) => [
      `This wallet had never used Solana before today. It just received <b>${c.amount}</b> from ${c.source}.`,
      `It arrived in ${c.settle}. We will post the first thing this wallet does.`,
    ],
    x: (c) =>
      `A wallet that had never used Solana before today just received ${c.amount} from ${c.source}. We will post the first thing it does.`,
  },
  {
    id: "funded",
    title: (c) => `New wallet, ${c.amount}`,
    telegram: (c) => [
      `Funded from ${c.source}. This wallet did nothing on Solana before today.`,
      `We are watching what it buys, lends or stakes first.`,
    ],
    x: (c) =>
      `A new Solana wallet was funded with ${c.amount} from ${c.source}. It did nothing on this chain before today. We are watching what it does first.`,
  },
  {
    id: "size",
    when: (c) => c.large,
    title: (c) => `${c.amount} to a brand new wallet`,
    telegram: (c) => [
      `From ${c.source}, to a wallet that did not exist on Solana yesterday.`,
      `This is new money coming in, not money moving around inside Solana. It arrived in ${c.settle}.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.source} went to a wallet that did not exist on Solana yesterday. This is new money coming in, not money moving around inside the chain.`,
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
