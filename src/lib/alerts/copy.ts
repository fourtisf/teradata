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
 * hype adjectives, no alert klaxons. The product's own vocabulary throughout —
 * arrived, settled, held, re-exported, dwell, first use — because the reader
 * should learn one set of words and see them everywhere.
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
  /** "a returning wallet" / "a wallet with no prior Solana history". */
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
 * Re-export — capital that landed and has now left. The movement the whole
 * method exists to catch, so the copy is allowed to say why it matters.
 * ---------------------------------------------------------------------- */
const REEXPORT: Variant[] = [
  {
    id: "round-trip-closed",
    when: (c) => !c.partial,
    telegram: (c) => [
      `<b>${c.amount}</b> that arrived from ${c.source} has left Solana again.`,
      `Round trip closed after ${c.onChain} on-chain. The held figure for today falls by the same amount.`,
    ],
    x: (c) =>
      `Round trip closed. ${c.amount} arrived from ${c.source} and left Solana again after ${c.onChain} on-chain. Every gross volume figure counts this twice. Ours counts it zero.`,
  },
  {
    id: "gross-vs-net",
    when: (c) => !c.partial && c.large,
    telegram: (c) => [
      `<b>${c.amount}</b> bridged in from ${c.origin} has now bridged out.`,
      `Gross bridge volume elsewhere records ${c.amount} in and ${c.amount} out. Neither one was new capital.`,
    ],
    x: (c) =>
      `${c.amount} that bridged into Solana from ${c.origin} has bridged back out. Reported elsewhere as volume in both directions. Reported here as nothing arriving.`,
  },
  {
    id: "partial-exit",
    when: (c) => c.partial,
    telegram: (c) => [
      `<b>${c.amount}</b> of the ${c.arrived} that arrived from ${c.source} has left again — ${c.sharePct} of the arrival.`,
      `${c.remaining} is still on-chain and still counted as held.`,
    ],
    x: (c) =>
      `${c.amount} of a ${c.arrived} arrival from ${c.source} has left Solana — ${c.sharePct} of it. The other ${c.remaining} is still here and still counted.`,
  },
  {
    id: "timed",
    when: (c) => !c.partial,
    telegram: (c) => [
      `<b>${c.amount}</b> from ${c.source} settled at ${c.arrivedAt} and has now left the chain.`,
      `Time on Solana: ${c.onChain}.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.source} settled on Solana at ${c.arrivedAt} and is already gone. Time on-chain: ${c.onChain}.`,
  },
];

/* -------------------------------------------------------------------------
 * Arrival.
 * ---------------------------------------------------------------------- */
const ARRIVAL: Variant[] = [
  {
    id: "plain",
    telegram: (c) => [
      `<b>${c.amount}</b> arrived on Solana from ${c.source}, settling in ${c.settle}.`,
      `The 24-hour window opens now. Whether it stays is the part we report.`,
    ],
    x: (c) =>
      `${c.amount} arrived on Solana from ${c.source}, settled in ${c.settle}. Whether it stays is the part that counts, and the 24-hour window starts now.`,
  },
  {
    id: "attribution-note",
    when: (c) => !c.isBridge,
    telegram: (c) => [
      `<b>${c.amount}</b> left ${c.originArticle} ${c.origin} hot wallet for a non-exchange address on Solana.`,
      `Identified by hot-wallet attribution rather than a protocol message — a weaker class of evidence, and marked <code>attributed</code> on the entry.`,
    ],
    x: (c) =>
      `${c.amount} withdrawn from ${c.origin} to a Solana address. Attributed by hot-wallet labelling, not a protocol message — a weaker class of evidence, and we say so on every entry.`,
  },
  {
    id: "matched-note",
    when: (c) => c.isBridge,
    telegram: (c) => [
      `<b>${c.amount}</b> arrived from ${c.origin} over ${c.route}.`,
      `Matched to its origin deposit on the bridge's own message identifier, so the ${c.settle} settlement lag is measured rather than estimated.`,
    ],
    x: (c) =>
      `${c.amount} arrived on Solana from ${c.origin} over ${c.route}. Matched to the origin deposit on the bridge's message id, so the ${c.settle} lag is measured, not estimated.`,
  },
  {
    id: "size",
    when: (c) => c.large,
    telegram: (c) => [
      `<b>${c.amount}</b> from ${c.source} — one of the larger single arrivals on the chain today.`,
      `Settled in ${c.settle}. Counted as held until something moves it.`,
    ],
    x: (c) =>
      `${c.amount} into Solana from ${c.source} in a single arrival, settled in ${c.settle}. Received by ${c.wallet}.`,
  },
  {
    id: "slow-settle",
    when: (c) => c.slowSettle && c.isBridge,
    telegram: (c) => [
      `<b>${c.amount}</b> arrived from ${c.origin} over ${c.route}, settling in ${c.settle}.`,
      `Slower than the median for this route. The origin deposit and the settlement are matched, so that lag is a measurement.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.origin} over ${c.route} took ${c.settle} to settle — above the median for this route. Matched on the bridge's message id, so the number is measured.`,
  },
];

/* -------------------------------------------------------------------------
 * Idle — the only forward-looking figure the product has.
 * ---------------------------------------------------------------------- */
const IDLE: Variant[] = [
  {
    id: "dry-powder",
    telegram: (c) => [
      `<b>${c.amount}</b> that arrived from ${c.source} has not moved for ${c.dwell}.`,
      `Idle capital is the only inflow figure that is forward-looking. Everything else has already been spent.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.source} has been sitting on Solana for ${c.dwell} without moving. Idle capital is the only inflow figure that hasn't already been spent.`,
  },
  {
    id: "no-action",
    telegram: (c) => [
      `${c.dwell} on-chain, no outbound action: <b>${c.amount}</b> from ${c.source} is still where it landed.`,
      `The dwell clock is still running.`,
    ],
    x: (c) =>
      `${c.dwell} on-chain and no outbound action yet: ${c.amount} from ${c.source} is still sitting where it landed.`,
  },
  {
    id: "unspent-large",
    when: (c) => c.large,
    telegram: (c) => [
      `<b>${c.amount}</b> from ${c.source} remains unspent ${c.dwell} after settlement.`,
      `Not a swap, not a deposit, not a transfer out — nothing. It is demand that has not been executed.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.source} is still unspent ${c.dwell} after settling. No swap, no deposit, no transfer out. Demand that hasn't been executed yet.`,
  },
];

/* -------------------------------------------------------------------------
 * First-seen wallet.
 * ---------------------------------------------------------------------- */
const FIRST_SEEN: Variant[] = [
  {
    id: "no-history",
    telegram: (c) => [
      `An address with no prior Solana history received <b>${c.amount}</b> from ${c.source}.`,
      `Settled in ${c.settle}. Its first meaningful action will be reported when it happens.`,
    ],
    x: (c) =>
      `An address with no prior Solana history just received ${c.amount} from ${c.source}. We'll report what it does first.`,
  },
  {
    id: "funded",
    telegram: (c) => [
      `New wallet funded with <b>${c.amount}</b> from ${c.source}.`,
      `No activity on this chain before today. Watching for first use.`,
    ],
    x: (c) =>
      `New Solana wallet funded with ${c.amount} from ${c.source}. No activity on this chain before today.`,
  },
  {
    id: "size",
    when: (c) => c.large,
    telegram: (c) => [
      `<b>${c.amount}</b> from ${c.source} went to an address that did not exist on Solana yesterday.`,
      `Settled in ${c.settle}. First use pending.`,
    ],
    x: (c) =>
      `${c.amount} from ${c.source} went to an address with no Solana history at all. Fresh money, not rotation. First use pending.`,
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
