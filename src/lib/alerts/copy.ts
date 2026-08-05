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
 * Register: a desk note, not a marketing post. Declarative, no exclamation, no
 * hype adjectives.
 *
 * **Plain words, and the first line never needs a glossary.** The site can
 * afford a term of art next to a definition; an alert arrives alone on someone's
 * phone with no page around it. So: "came in", "went back out", "has not moved"
 * — not "re-exported", "idle capital", "dwell". The product's own vocabulary
 * belongs on the entry and in the API, and the footer carries it there, after
 * the plain sentence has already taught what it means.
 *
 * The house rule (§1) is absolute here: flow and the wallet's verifiable
 * properties only. Venue and bridge names are the port, never the firm.
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
  /** "Ethereum via Wormhole" or "a Binance withdrawal". */
  source: string;
  /** "Ethereum" or "Binance". */
  origin: string;
  /** "a" or "an", agreeing with `origin` — "a Binance", "an OKX". */
  originArticle: string;
  /** "Wormhole", or "withdrawal" for a venue. */
  route: string;
  isBridge: boolean;
  /** "a wallet we have seen on Solana before". */
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
  /** Telegram body lines. The header and footer are added by the formatter. */
  telegram: (c: CopyContext) => string[];
  x: (c: CopyContext) => string;
}

/* -------------------------------------------------------------------------
 * Money that came in and then left again.
 *
 * The whole method exists to catch this, so the copy is allowed to say why it
 * matters — but it has to say what happened first, in words that need nothing
 * explained.
 * ---------------------------------------------------------------------- */
const REEXPORT: Variant[] = [
  {
    id: "round-trip-closed",
    when: (c) => !c.partial,
    telegram: (c) => [
      `<b>${c.amount}</b> came in from ${c.source} and has now gone straight back off Solana.`,
      `It was here for ${c.onChain}. Money that leaves again was never money that arrived, so today's "still on Solana" figure drops by the same amount.`,
    ],
    x: (c) =>
      `${c.amount} came into Solana from ${c.source} and went back out ${c.onChain} later. Volume charts count that round trip twice. We count it as nothing arriving.`,
  },
  {
    id: "gross-vs-net",
    when: (c) => !c.partial && c.large,
    telegram: (c) => [
      `<b>${c.amount}</b> bridged in from ${c.origin}. It has now bridged back out.`,
      `Nothing new stayed on the chain. Most trackers will show ${c.amount} in and ${c.amount} out, and call both of them volume.`,
    ],
    x: (c) =>
      `${c.amount} bridged into Solana from ${c.origin} and has now bridged back out. Elsewhere that reads as volume in both directions. Here it reads as no new money at all.`,
  },
  {
    id: "partial-exit",
    when: (c) => c.partial,
    telegram: (c) => [
      `<b>${c.arrived}</b> came in from ${c.source}. <b>${c.amount}</b> of it has already gone back off Solana — ${c.sharePct} of the arrival.`,
      `The other ${c.remaining} is still here, and still counts as money that stayed.`,
    ],
    x: (c) =>
      `${c.arrived} came into Solana from ${c.source}, and ${c.sharePct} of it — ${c.amount} — has already gone back out. The other ${c.remaining} is still here and still counts.`,
  },
  {
    id: "timed",
    when: (c) => !c.partial,
    telegram: (c) => [
      `<b>${c.amount}</b> landed at ${c.arrivedAt} from ${c.source}. It has already left Solana.`,
      `Total time on the chain: ${c.onChain}.`,
    ],
    x: (c) =>
      `${c.amount} landed on Solana at ${c.arrivedAt} from ${c.source} and is already gone. Total time on the chain: ${c.onChain}.`,
  },
];

/* -------------------------------------------------------------------------
 * Money arriving.
 * ---------------------------------------------------------------------- */
const ARRIVAL: Variant[] = [
  {
    id: "plain",
    telegram: (c) => [
      `<b>${c.amount}</b> just arrived on Solana from ${c.source}, landing in ${c.settle}.`,
      `We watch this wallet for the next 24 hours. Whether the money stays is the part we report.`,
    ],
    x: (c) =>
      `${c.amount} just arrived on Solana from ${c.source}, landing in ${c.settle}. We watch it for the next 24 hours — whether it stays is the part that counts.`,
  },
  {
    id: "attribution-note",
    when: (c) => !c.isBridge,
    telegram: (c) => [
      `<b>${c.amount}</b> left ${c.originArticle} ${c.origin} exchange wallet and landed on a Solana address that is not an exchange.`,
      `We spotted this by recognising the exchange's own wallet, not by reading a bridge record. That is weaker evidence, and the entry says so.`,
    ],
    x: (c) =>
      `${c.amount} moved out of ${c.originArticle} ${c.origin} exchange wallet onto Solana. Spotted by recognising the exchange's wallet, not from a bridge record — weaker evidence, and we label it.`,
  },
  {
    id: "matched-note",
    when: (c) => c.isBridge,
    telegram: (c) => [
      `<b>${c.amount}</b> arrived from ${c.origin} over ${c.route}.`,
      `We matched it to the original deposit on the other chain using ${c.route}'s own transfer ID, so the ${c.settle} it took is measured rather than estimated.`,
    ],
    x: (c) =>
      `${c.amount} arrived on Solana from ${c.origin} over ${c.route}. Matched to the deposit on the other side using the bridge's own transfer ID, so the ${c.settle} is measured, not a guess.`,
  },
  {
    id: "size",
    when: (c) => c.large,
    telegram: (c) => [
      `<b>${c.amount}</b> arrived from ${c.source} in one go — one of the biggest single arrivals on Solana today.`,
      `It landed in ${c.settle}, and counts as money that stayed until something moves it.`,
    ],
    x: (c) =>
      `${c.amount} arrived on Solana from ${c.source} in a single transfer, landing in ${c.settle}. One of the largest single arrivals on the chain today.`,
  },
  {
    id: "slow-settle",
    when: (c) => c.slowSettle && c.isBridge,
    telegram: (c) => [
      `<b>${c.amount}</b> arrived from ${c.origin} over ${c.route}, but took ${c.settle} to land — slower than this route usually runs.`,
      `We know that because we matched it to the original deposit, so the delay is measured rather than guessed at.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.origin} over ${c.route} took ${c.settle} to land — slower than this route usually runs. Matched to the original deposit, so that delay is measured.`,
  },
];

/* -------------------------------------------------------------------------
 * Money that arrived and has not done anything yet.
 *
 * "Idle capital" is the phrase on the site. It is not a phrase that explains
 * itself on a phone, so every variant here spells out what did not happen —
 * no swap, no deposit, no transfer — before it reaches for the idea.
 * ---------------------------------------------------------------------- */
const IDLE: Variant[] = [
  {
    id: "dry-powder",
    telegram: (c) => [
      `<b>${c.amount}</b> arrived from ${c.source} and has not moved for ${c.dwell}.`,
      `Not swapped, not lent out, not sent anywhere. It is buying power sitting on the chain that has not been used yet.`,
    ],
    x: (c) =>
      `${c.amount} arrived on Solana from ${c.source} ${c.dwell} ago and still has not moved. Not swapped, not lent, not sent on. Buying power that has not been spent yet.`,
  },
  {
    id: "no-action",
    telegram: (c) => [
      `${c.dwell} on Solana and still nothing: <b>${c.amount}</b> from ${c.source} is sitting exactly where it landed.`,
      `The wallet has not swapped it, deposited it, or sent it on.`,
    ],
    x: (c) =>
      `${c.dwell} on Solana and still nothing: ${c.amount} from ${c.source} is sitting exactly where it landed. Not swapped, not deposited, not sent on.`,
  },
  {
    id: "unspent-large",
    when: (c) => c.large,
    telegram: (c) => [
      `<b>${c.amount}</b> from ${c.source} is still untouched ${c.dwell} after landing.`,
      `No swap, no deposit, no transfer out — nothing at all. Money that arrived to be spent, and has not been spent.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.source} is still untouched ${c.dwell} after landing. No swap, no deposit, no transfer out. Money that arrived to be spent and hasn't been.`,
  },
];

/* -------------------------------------------------------------------------
 * A wallet with no history on the chain before today.
 * ---------------------------------------------------------------------- */
const FIRST_SEEN: Variant[] = [
  {
    id: "no-history",
    telegram: (c) => [
      `A wallet that had never touched Solana before today just received <b>${c.amount}</b> from ${c.source}.`,
      `It landed in ${c.settle}. We will report the first thing this wallet does with it.`,
    ],
    x: (c) =>
      `A wallet with no Solana history at all just received ${c.amount} from ${c.source}. We will report the first thing it does with the money.`,
  },
  {
    id: "funded",
    telegram: (c) => [
      `New wallet, funded with <b>${c.amount}</b> from ${c.source}.`,
      `Nothing on Solana before today. We are watching for what it buys, lends or stakes first.`,
    ],
    x: (c) =>
      `New Solana wallet, funded with ${c.amount} from ${c.source}. Nothing on this chain before today. Watching for what it does first.`,
  },
  {
    id: "size",
    when: (c) => c.large,
    telegram: (c) => [
      `<b>${c.amount}</b> from ${c.source} went to an address that did not exist on Solana yesterday.`,
      `That is new money coming in, not money moving around inside the chain. Landed in ${c.settle}, first move still to come.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.source} went to an address that did not exist on Solana yesterday. New money coming in, not money moving around inside the chain.`,
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
