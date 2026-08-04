/**
 * SimProvider — the prototype's generated data, behind the real interface.
 *
 * This exists so the frontend can be deployed and reviewed before any ingest
 * work lands (§2: "Ship with DATA_SOURCE=sim|live"). Every figure here is
 * invented. Nothing in this file should ever be quoted as a measurement.
 *
 * P1 replaces this module with one that reads ClickHouse. Nothing outside
 * `lib/data` changes.
 */

import {
  BRIDGES,
  FIRST_USE_LABELS,
  NOT_COVERED,
  PROGRAM_GROUPS,
  SIZE_FLOOR_USD,
  VENUES,
} from "@/lib/config/programs";
import { createRng, hashSeed, type Rng } from "@/lib/rng";
import type {
  Coverage,
  DailySeries,
  DataProvider,
  DwellBreakdown,
  Entry,
  EntryQuery,
  EntryStatus,
  FirstUse,
  FirstUseRow,
  FlowSummary,
  HomeSnapshot,
  IndexerStatus,
  OriginCard,
  Range,
} from "@/lib/data/types";
import { RANGES } from "@/lib/data/types";

/** The prototype's headline figures, kept verbatim: gross / held / unspent. */
const RANGE_FIGURES: Record<Range, [number, number, number]> = {
  "1h": [18.2e6, 11.4e6, 2.1e6],
  "24h": [412.9e6, 268.4e6, 29.6e6],
  "7d": [2.61e9, 1.68e9, 184e6],
  "30d": [9.84e9, 6.12e9, 612e6],
};

const RANGE_ENTRY_COUNT: Record<Range, number> = {
  "1h": 104,
  "24h": 2481,
  "7d": 16_940,
  "30d": 71_300,
};

const BASE_SLOT = 341_209_884;
const MEDIAN_LAG_MS = 8_200;

/** Origin, net USD in millions, percent against the seven-day average. */
const ORIGINS: ReadonlyArray<readonly [string, number, number]> = [
  ["Ethereum", 71.4, 18.2],
  ["Binance", 58.9, 31.4],
  ["Base", 34.2, -4.1],
  ["Coinbase", 29.7, 9.6],
  ["Arbitrum", 21.3, -11.8],
  ["Hyperliquid", 18.6, 62.9],
  ["OKX", 14.1, -2.2],
  ["BNB Chain", 11.8, 7.4],
];

const DWELL_BUCKETS: ReadonlyArray<readonly [string, number, number, boolean]> = [
  // label, USD at 24h, bar share, is-idle
  ["Under 5 min", 96.1e6, 0.78, false],
  ["5 – 60 min", 66.4e6, 0.54, false],
  ["1 – 6 hours", 46.8e6, 0.38, false],
  ["6 – 24 hours", 29.5e6, 0.24, false],
  ["Still idle", 29.6e6, 0.24, true],
];

const FIRST_USE_FIGURES: Record<string, [number, number]> = {
  // category → [USD at 24h, bar share]
  spot_swap: [84.2e6, 1.0],
  lending: [51.6e6, 0.61],
  perp_collateral: [36.9e6, 0.44],
  liquidity: [27.8e6, 0.33],
  staking: [18.3e6, 0.22],
  unspent: [29.6e6, 0.35],
};

/** Routes the feed draws from: [origin, route, kind]. */
const SOURCES: ReadonlyArray<readonly [string, string, "bridge" | "exchange"]> = [
  ["Ethereum", "Wormhole", "bridge"],
  ["Ethereum", "deBridge", "bridge"],
  ["Base", "Mayan", "bridge"],
  ["Base", "Across", "bridge"],
  ["Arbitrum", "deBridge", "bridge"],
  ["BNB Chain", "Wormhole", "bridge"],
  ["Polygon", "Allbridge", "bridge"],
  ["Hyperliquid", "withdrawal", "exchange"],
  ["Binance", "withdrawal", "exchange"],
  ["Coinbase", "withdrawal", "exchange"],
  ["OKX", "withdrawal", "exchange"],
  ["Bybit", "withdrawal", "exchange"],
  ["Kraken", "withdrawal", "exchange"],
];

/** The prototype's status mix, weighted the same way. */
const STATUSES: readonly EntryStatus[] = [
  "settling",
  "held",
  "deployed",
  "deployed",
  "held",
  "reexported",
];

const ASSETS = ["USDC", "USDT", "SOL", "ETH", "WBTC"] as const;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const HEX = "abcdef0123456789";

function chars(rng: Rng, alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(rng.next() * alphabet.length)];
  return out;
}

/** Scales a 24h figure onto another range, holding the ratios steady. */
function scaleFrom24h(usd: number, range: Range): number {
  const base = RANGE_FIGURES["24h"][0];
  const target = RANGE_FIGURES[range][0];
  return (usd / base) * target;
}

export interface SimOptions {
  seed?: number;
  /** Injectable so tests and snapshots can pin the clock. */
  now?: () => number;
}

export class SimProvider implements DataProvider {
  readonly source = "sim" as const;

  private readonly seed: number;
  private readonly now: () => number;

  constructor(options: SimOptions = {}) {
    this.seed = options.seed ?? 1_296_520_521;
    this.now = options.now ?? (() => Date.now());
  }

  /** A stream per section, so adding one section does not reshuffle the others. */
  private rngFor(section: string): Rng {
    return createRng((this.seed ^ hashSeed(section)) >>> 0);
  }

  async getSummary(range: Range): Promise<FlowSummary> {
    const [gross, held, unspent] = RANGE_FIGURES[range];
    return {
      range,
      declaredInboundUsd: gross,
      stillOnSolanaUsd: held,
      unspentUsd: unspent,
      reexportedUsd: gross - held,
      entryCount: RANGE_ENTRY_COUNT[range],
      medianLagMs: MEDIAN_LAG_MS,
    };
  }

  async getDailyFlows(days = 30): Promise<DailySeries> {
    const rng = this.rngFor("daily");
    const today = this.now();

    // Net-outflow days are drawn up front rather than rolled per day. The
    // prototype rolled 13% a day and could produce a month with none in it,
    // which leaves the rose bar — the state the entire method section argues
    // for — untested and unreviewable. Three to five, always.
    const outflowDays = new Set<number>();
    const outflowCount = rng.int(3, 5);
    while (outflowDays.size < outflowCount) outflowDays.add(rng.int(0, days - 1));

    const series = [];
    for (let index = 0; index < days; index++) {
      const grossUsd = 260e6 + rng.next() * 420e6;
      const keepRatio = 0.38 + rng.next() * 0.42;
      const heldUsd = outflowDays.has(index)
        ? -(grossUsd * (0.04 + rng.next() * 0.12))
        : grossUsd * keepRatio;
      series.push({
        date: new Date(today - (days - 1 - index) * 864e5).toISOString(),
        grossUsd,
        heldUsd,
      });
    }

    const averageHeldUsd =
      series.reduce((sum, d) => sum + Math.max(0, d.heldUsd), 0) / series.length;

    return { days: series, averageHeldUsd };
  }

  async getEntries(query: EntryQuery = {}): Promise<Entry[]> {
    const { limit = 12, minUsd = SIZE_FLOOR_USD, kind, status } = query;
    const rng = this.rngFor("entries");
    const now = this.now();
    const entries: Entry[] = [];

    // The prototype seeds the feed with twelve rows spaced roughly 47s apart.
    for (let i = 0; entries.length < limit && i < limit * 4; i++) {
      const entry = makeEntry(rng, now - (i * 47 + 20) * 1000, BASE_SLOT);
      if (entry.amountUsd < minUsd) continue;
      if (kind && entry.kind !== kind) continue;
      if (status && entry.status !== status) continue;
      entries.push(entry);
    }

    return entries;
  }

  async getDwell(range: Range): Promise<DwellBreakdown> {
    const buckets = DWELL_BUCKETS.map(([label, usd, share, idle]) => ({
      label,
      usd: scaleFrom24h(usd, range),
      share,
      idle,
    }));
    const [, held, unspent] = RANGE_FIGURES[range];
    return {
      buckets,
      unspentUsd: unspent,
      // Against what stayed, not against gross. "Inflow" in this product means
      // net inflow — quoting idle capital as a share of a number that includes
      // round trips would understate it using the very figure we reject.
      unspentShare: unspent / held,
    };
  }

  async getFirstUse(range: Range): Promise<FirstUseRow[]> {
    return PROGRAM_GROUPS.map((group) => {
      const figures = FIRST_USE_FIGURES[group.category] ?? [0, 0];
      return {
        category: group.category,
        name: group.name,
        detail: group.detail,
        usd: scaleFrom24h(figures[0], range),
        share: figures[1],
      };
    });
  }

  async getOrigins(range: Range): Promise<OriginCard[]> {
    const rng = this.rngFor("origins");
    return ORIGINS.map(([name, millions, deltaPct]) => {
      const netUsd = scaleFrom24h(millions * 1e6, range);
      // Seven days of shape, trending with the delta so a spike is legible
      // without opening the card.
      const spark = Array.from({ length: 7 }, (_, i) => {
        const drift = (deltaPct / 100) * (i / 6) * netUsd * 0.55;
        return Math.max(netUsd * 0.18, netUsd * 0.72 + drift + (rng.next() - 0.5) * netUsd * 0.3);
      });
      return {
        name,
        kind: VENUES.includes(name) ? ("exchange" as const) : ("bridge" as const),
        netUsd,
        deltaPct,
        spark,
      };
    });
  }

  async getCoverage(): Promise<Coverage> {
    return {
      indexed: [...BRIDGES.map((b) => b.name), ...VENUES],
      notCovered: [...NOT_COVERED],
    };
  }

  async getStatus(): Promise<IndexerStatus> {
    const now = this.now();
    return {
      state: "live",
      // Solana produces a slot roughly every 400ms; the sim advances the same
      // way so the status strip does not sit frozen between deploys.
      lastSlot: BASE_SLOT + Math.floor((now % 864e5) / 400),
      medianLagMs: MEDIAN_LAG_MS,
      // §7 wants this under 15% and visible. It is visible either way.
      unattributedShare: 0.062,
      updatedAt: new Date(now).toISOString(),
    };
  }

  async getHomeSnapshot(): Promise<HomeSnapshot> {
    const [summaryList, daily, entries, dwell, firstUse, origins, coverage, status] =
      await Promise.all([
        Promise.all(RANGES.map((range) => this.getSummary(range))),
        this.getDailyFlows(30),
        this.getEntries({ limit: 12 }),
        this.getDwell("24h"),
        this.getFirstUse("24h"),
        this.getOrigins("24h"),
        this.getCoverage(),
        this.getStatus(),
      ]);

    const summaries = Object.fromEntries(
      summaryList.map((summary) => [summary.range, summary]),
    ) as Record<Range, FlowSummary>;

    return { summaries, daily, entries, dwell, firstUse, origins, coverage, status };
  }
}

/**
 * One simulated arrival.
 *
 * Exported because the client-side stream replays the same generator to append
 * live rows — the feed component must not be allowed to invent its own data.
 */
export function makeEntry(rng: Rng, tsMs: number, baseSlot: number): Entry {
  const [origin, route, kind] = rng.pick(SOURCES);
  // One entry in six is a size that moves the headline.
  const heavy = rng.chance(0.16);
  const amountUsd = heavy ? 2.2e6 + rng.next() * 9e6 : 1.05e5 + rng.next() * 1.6e6;
  const status = rng.pick(STATUSES);
  const firstSeen = rng.chance(0.34);
  const lagMs = Math.round((4 + rng.next() * 11) * 1000);
  const dwellMs = pickDwell(rng);
  const firstUse = status === "settling" ? null : pickFirstUse(rng, tsMs, dwellMs);
  const address = chars(rng, BASE58, 44);

  return {
    id: chars(rng, HEX, 16),
    // §3.2 — exchange flow is hot-wallet attribution, not protocol-level
    // matching, and the API says so on every row.
    confidence: kind === "bridge" ? "matched" : "attributed",
    kind,
    origin,
    route,
    asset: rng.pick(ASSETS),
    amountUsd,
    originRef: kind === "exchange" ? "withdrawal batch" : `0x${chars(rng, HEX, 16)}`,
    routeRef:
      kind === "exchange"
        ? `hot wallet ${chars(rng, BASE58, 4)}…${chars(rng, BASE58, 4)}`
        : `msg ${chars(rng, HEX, 8)}`,
    solanaSlot: baseSlot - rng.int(0, 400),
    solanaTs: new Date(tsMs).toISOString(),
    lagMs,
    recipient: {
      address,
      firstSeen,
      historyNote: firstSeen ? "no prior Solana history" : "active since Mar 2025",
    },
    status,
    dwellMs,
    firstUse,
    reexportedUsd: status === "reexported" ? amountUsd : 0,
    windowClosed: false,
  };
}

/** The prototype's dwell mix: ~30% not yet moved, then minutes, hours, idle. */
function pickDwell(rng: Rng): number | null {
  const r = rng.next();
  if (r < 0.3) return null;
  if (r < 0.62) return Math.ceil(rng.next() * 9) * 60_000;
  if (r < 0.88) return Math.ceil(rng.next() * 5) * 3_600_000;
  return 14 * 3_600_000;
}

function pickFirstUse(rng: Rng, tsMs: number, dwellMs: number | null): FirstUse {
  const group = rng.pick(PROGRAM_GROUPS);
  const program = group.programs.length ? rng.pick(group.programs) : null;
  return {
    category: group.category,
    program,
    label: FIRST_USE_LABELS[group.category](program ?? ""),
    ts: dwellMs === null ? null : new Date(tsMs + dwellMs).toISOString(),
  };
}
