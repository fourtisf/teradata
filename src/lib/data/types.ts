/**
 * The data contract for every surface in the product.
 *
 * Components never import a data module. They receive already-shaped values
 * from a server component that asked the active `DataProvider` for them, which
 * is what makes P1 a one-file swap: `SimProvider` out, `LiveProvider` in, no
 * component touched.
 *
 * Field names track §4 of CLAUDE.md and the API shapes in §9.
 */

export type Range = "1h" | "24h" | "7d" | "30d";

export const RANGES: readonly Range[] = ["1h", "24h", "7d", "30d"] as const;

/**
 * §3.1 / §3.2. Bridge arrivals are joined on the bridge's own message id and
 * are `matched`. Exchange withdrawals have no message id and are identified by
 * hot-wallet attribution — a different and weaker class, exposed rather than
 * hidden. Arrivals still unmatched when the buffer TTL expires are
 * `unattributed`: counted in the inbound total, excluded from the origin
 * breakdown, and surfaced on the status page.
 */
export type Confidence = "matched" | "attributed" | "unattributed";

/** §4 `arrivals.status`. Mutable until the 24h window closes — see §3.4. */
export type EntryStatus = "settling" | "held" | "deployed" | "reexported";

/** How the capital reached Solana. Bridges carry a route, venues a withdrawal. */
export type ArrivalKind = "bridge" | "exchange";

/** §3.5 first-use classification. The program → category map lives in config. */
export type FirstUseCategory =
  | "spot_swap"
  | "liquidity"
  | "lending"
  | "perp_collateral"
  | "staking"
  | "unspent";

export interface FirstUse {
  category: FirstUseCategory;
  /** Program label, e.g. "Jupiter". Never a firm name — see the house rule. */
  program: string | null;
  /** Human line for the trace, e.g. "Swapped to SOL on Jupiter". */
  label: string;
  ts: string | null;
}

/**
 * The receiving wallet, described only by what is verifiable. There is no
 * `entity_name` here and there must never be one — §1, the house rule.
 */
export interface Recipient {
  /** Truncated for display. The full address is a P6 API concern. */
  address: string;
  firstSeen: boolean;
  /** e.g. "no prior Solana history" / "active since Mar 2025". */
  historyNote: string;
}

/** One arrival. §4 `arrivals`, narrowed to what a public surface may see. */
export interface Entry {
  id: string;
  confidence: Confidence;
  kind: ArrivalKind;
  /** Origin chain for a bridge, venue for an exchange withdrawal. */
  origin: string;
  /** Bridge name, or "withdrawal" for a venue. */
  route: string;
  asset: string;
  amountUsd: number;
  /** Origin-side transaction, or a batch reference for a venue. */
  originRef: string;
  /** The bridge's own message identifier (§3.1), or the hot wallet (§3.2). */
  routeRef: string;
  solanaSlot: number;
  /** ISO 8601, UTC. Formatting happens in the component, identically on both sides. */
  solanaTs: string;
  lagMs: number;
  recipient: Recipient;
  status: EntryStatus;
  dwellMs: number | null;
  firstUse: FirstUse | null;
  reexportedUsd: number;
  windowClosed: boolean;
}

/** §9 `GET /v1/flows/summary`. */
export interface FlowSummary {
  range: Range;
  /** Gross. What every other dashboard reports. */
  declaredInboundUsd: number;
  /** Net of round trips. The headline, and deliberately the smaller number. */
  stillOnSolanaUsd: number;
  /** Landed with no qualifying outbound action inside the window. */
  unspentUsd: number;
  reexportedUsd: number;
  entryCount: number;
  medianLagMs: number;
}

/** §9 `GET /v1/flows/daily`. `heldUsd` goes negative on a net-outflow day. */
export interface DailyFlow {
  date: string;
  grossUsd: number;
  heldUsd: number;
}

export interface DailySeries {
  days: DailyFlow[];
  averageHeldUsd: number;
}

export interface DwellBucket {
  /** "Under 5 min", "5 – 60 min", … */
  label: string;
  usd: number;
  /** 0–1, against the largest bucket, for the bar width. */
  share: number;
  /** The idle bucket is green: it is capital that stayed. */
  idle: boolean;
}

export interface DwellBreakdown {
  buckets: DwellBucket[];
  unspentUsd: number;
  /** 0–1 of inflow still unspent. */
  unspentShare: number;
}

export interface FirstUseRow {
  category: FirstUseCategory;
  name: string;
  /** The programs behind the category, e.g. "Kamino, MarginFi, Save". */
  detail: string;
  usd: number;
  /** 0–1, against the largest row. */
  share: number;
}

export interface OriginCard {
  name: string;
  kind: ArrivalKind;
  /** Net of re-exports. */
  netUsd: number;
  /** Percentage change against the seven-day average. */
  deltaPct: number;
  /** Seven daily net values, oldest first. Normalised by the component. */
  spark: number[];
}

export interface Coverage {
  indexed: string[];
  notCovered: string[];
}

/** §7 — the unattributed share is public, not buried. */
export interface IndexerStatus {
  state: "live" | "degraded" | "down";
  lastSlot: number;
  medianLagMs: number;
  /** 0–1 of inbound USD that never matched a message id. */
  unattributedShare: number;
  /** ISO 8601. The nav's freshness indicator counts up from here. */
  updatedAt: string;
}

/** Everything the home page needs, in one round trip. */
export interface HomeSnapshot {
  /** All four ranges, so the range selector switches without a refetch. */
  summaries: Record<Range, FlowSummary>;
  daily: DailySeries;
  entries: Entry[];
  dwell: DwellBreakdown;
  firstUse: FirstUseRow[];
  origins: OriginCard[];
  coverage: Coverage;
  status: IndexerStatus;
}

export interface EntryQuery {
  minUsd?: number;
  kind?: ArrivalKind;
  status?: EntryStatus;
  limit?: number;
}

export type DataSource = "sim" | "live";

export interface DataProvider {
  readonly source: DataSource;
  getSummary(range: Range): Promise<FlowSummary>;
  getDailyFlows(days: number): Promise<DailySeries>;
  getEntries(query?: EntryQuery): Promise<Entry[]>;
  getDwell(range: Range): Promise<DwellBreakdown>;
  getFirstUse(range: Range): Promise<FirstUseRow[]>;
  getOrigins(range: Range): Promise<OriginCard[]>;
  getCoverage(): Promise<Coverage>;
  getStatus(): Promise<IndexerStatus>;
  getHomeSnapshot(): Promise<HomeSnapshot>;
}

/**
 * §9 `WS /v1/stream`. The sim emits the same three events the live socket will,
 * so the feed component is already written against the real protocol.
 *
 * `entry.reclassified` is the one that matters: §3.4 says a row classified
 * `held` at 14:00 can become `reexported` at 21:00, and the UI has to restamp
 * it live rather than wait for a reload.
 */
export type StreamEvent =
  | { type: "entry.new"; entry: Entry }
  | { type: "entry.reclassified"; id: string; status: EntryStatus; reexportedUsd: number }
  | { type: "entry.first_use"; id: string; firstUse: FirstUse; dwellMs: number };

export interface EntryStream {
  subscribe(listener: (event: StreamEvent) => void): () => void;
  close(): void;
}
