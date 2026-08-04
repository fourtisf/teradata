/**
 * §3.5 — "Keep the program → category map in a config file, not scattered
 * through the code. It will change monthly."
 *
 * Program ids are filled in during P3, when the re-export watcher needs them.
 * The categories, labels and ordering are already load-bearing for the UI, so
 * they live here from P0 rather than being retrofitted.
 */

import type { FirstUseCategory } from "@/lib/data/types";

export interface ProgramGroup {
  category: FirstUseCategory;
  /** Section heading in the first-use list. */
  name: string;
  /** The programs behind it, shown as the sub-line. */
  detail: string;
  /** Individual program labels, used by the trace lines. */
  programs: string[];
  /** Solana program ids. Populated in P3 — the classifier reads these. */
  programIds: string[];
}

export const PROGRAM_GROUPS: readonly ProgramGroup[] = [
  {
    category: "spot_swap",
    name: "Spot swaps",
    detail: "Jupiter, Titan, direct AMM routes",
    programs: ["Jupiter", "Titan", "Raydium", "Orca", "Meteora"],
    programIds: [],
  },
  {
    category: "lending",
    name: "Lending deposits",
    detail: "Kamino, MarginFi, Save",
    programs: ["Kamino", "MarginFi", "Save"],
    programIds: [],
  },
  {
    category: "perp_collateral",
    name: "Perp collateral",
    detail: "Drift, Jupiter Perps",
    programs: ["Drift", "Jupiter Perps"],
    programIds: [],
  },
  {
    category: "liquidity",
    name: "Liquidity provision",
    detail: "Meteora, Orca, Raydium",
    programs: ["Meteora", "Orca", "Raydium"],
    programIds: [],
  },
  {
    category: "staking",
    name: "Staking",
    detail: "Native and liquid staking",
    programs: ["Jito", "Marinade", "Stake program"],
    programIds: [],
  },
  {
    category: "unspent",
    name: "Unspent",
    detail: "No outbound action since arrival",
    programs: [],
    programIds: [],
  },
] as const;

/** Trace copy for a first use, per category. */
export const FIRST_USE_LABELS: Record<FirstUseCategory, (program: string) => string> = {
  spot_swap: (p) => `Swapped to SOL on ${p}`,
  lending: (p) => `Deposited to ${p}`,
  perp_collateral: (p) => `Opened perp collateral on ${p}`,
  liquidity: (p) => `Added liquidity on ${p}`,
  staking: (p) => `Staked with ${p}`,
  unspent: () => "No action yet",
};

/** §3.1 — bridges we join on a protocol-level message identifier. */
export interface BridgeConfig {
  name: string;
  /** The field the origin deposit and the Solana settlement are joined on. */
  identifier: string;
}

export const BRIDGES: readonly BridgeConfig[] = [
  { name: "Wormhole", identifier: "emitter chain + emitter address + sequence" },
  { name: "deBridge", identifier: "submissionId" },
  { name: "Across", identifier: "depositId + origin chain id" },
  { name: "Mayan", identifier: "Swift order hash" },
  { name: "Allbridge", identifier: "messageId" },
] as const;

/**
 * §3.2 — venues identified by hot-wallet attribution. These are venue labels,
 * not firm labels, and that distinction holds.
 */
export const VENUES: readonly string[] = [
  "Binance",
  "Coinbase",
  "OKX",
  "Bybit",
  "Kraken",
  "Bitget",
  "Hyperliquid",
] as const;

/** Origin chains we watch on the deposit side. */
export const ORIGIN_CHAINS: readonly string[] = [
  "Ethereum",
  "Base",
  "Arbitrum",
  "BNB Chain",
  "Polygon",
] as const;

/** Stated plainly rather than estimated — §Coverage. */
export const NOT_COVERED: readonly string[] = [
  "OTC desk settlement",
  "Peer-to-peer transfers",
  "Smaller regional exchanges",
  "Entries under $100K",
] as const;

/** §11 open decision: the size floor is $100K until real volume argues otherwise. */
export const SIZE_FLOOR_USD = 100_000;

/** §3.3 open decision: 24h assumed, sensitivity check due in P1. */
export const REEXPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
