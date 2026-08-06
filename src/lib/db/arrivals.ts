/**
 * The `arrivals` table, as the ingest worker sees it.
 *
 * This is the write side of P1 and the seam the Helius subscription lands on:
 * the worker decodes a settlement, and calls `recordArrival`. Everything about
 * how a row is stored, updated and closed is here rather than in the worker, so
 * the transport can be replaced — gRPC for webhooks, or a second region — with
 * nothing in this file changing.
 *
 * Three rules from the spec are enforced here rather than trusted to callers:
 *
 * - **A settlement is idempotent.** §3.1 has an origin deposit and a Solana
 *   settlement arriving separately and out of order, and a stream that restarts
 *   replays whole slots. `recordArrival` upserts on the transaction *and the
 *   transfer within it*, so a replay cannot double-count a figure and a
 *   settlement carrying several transfers is not collapsed into one.
 * - **An unpriced arrival is never $0.** §11 closed this: a zero understates
 *   the headline while looking like a complete figure. `amount_usd` stays null
 *   and the row is still stored.
 * - **A closed window is immutable.** §3.4 makes a row mutable for 24 hours and
 *   history afterwards, so `markReexport` refuses a row whose window has shut
 *   rather than silently rewriting a published day.
 */

import { query, queryOne } from "@/lib/db/pool";
import type { Confidence } from "@/lib/data/types";

/** What the worker knows when a settlement lands. */
export interface SettlementInput {
  confidence: Confidence;
  /** Bridge name, or the venue for an exchange withdrawal. A port, never a firm. */
  bridge: string;
  /** The bridge's own message id (§3.1). Empty for a venue withdrawal. */
  messageId?: string;
  originChain: string;
  originTx?: string;
  originTs?: Date | null;
  asset: string;
  amountNative: string | number;
  /** Null when the asset could not be priced. Never 0 — see the header. */
  amountUsd?: string | number | null;
  priceUsd?: string | number | null;
  priceSource?: string | null;
  priceTs?: Date | null;
  solanaTx: string;
  /** Which transfer within that transaction. Defaults to 0. See the header. */
  instructionIndex?: number;
  solanaSlot: number | bigint;
  solanaTs: Date;
  lagMs?: number;
  recipient: string;
  recipientFirstSeen?: boolean;
}

export interface ArrivalRow {
  id: string;
  confidence: Confidence;
  bridge: string;
  amount_usd: string | null;
  solana_slot: string;
  solana_ts: Date;
  status: string;
  reexported_usd: string;
  window_closed: boolean;
}

/**
 * Stores a settlement, or updates the one already stored for that transaction.
 *
 * Returns the row id either way, so a caller that replayed a slot gets the id
 * of the arrival it already has rather than a second one.
 *
 * The conflict target is `(solana_tx, instruction_index)` rather than the
 * transaction alone: a bridge settlement can carry several transfers in one
 * transaction, and collapsing them would lose every arrival but the first.
 * Matching an origin deposit to a row later is `attachOrigin` — a different
 * event, arriving at a different time (§3.1).
 */
export async function recordArrival(input: SettlementInput): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO arrivals (
       id, confidence, bridge, message_id, origin_chain, origin_tx, origin_ts,
       asset, amount_native, amount_usd, price_usd, price_source, price_ts,
       solana_tx, instruction_index, solana_slot, solana_ts, lag_ms,
       recipient, recipient_first_seen,
       status, updated_at
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17,
       $18, $19,
       'held', now()
     )
     ON CONFLICT (solana_tx, instruction_index) DO UPDATE SET
       -- A replay must not weaken what we already know. An arrival that has
       -- since been matched to its origin deposit stays matched, and a row
       -- that was priced stays priced, even if the replay carries neither.
       confidence   = CASE WHEN arrivals.confidence = 'unattributed'
                           THEN EXCLUDED.confidence ELSE arrivals.confidence END,
       message_id   = CASE WHEN arrivals.message_id = ''
                           THEN EXCLUDED.message_id ELSE arrivals.message_id END,
       amount_usd   = COALESCE(arrivals.amount_usd, EXCLUDED.amount_usd),
       price_usd    = COALESCE(arrivals.price_usd, EXCLUDED.price_usd),
       price_source = COALESCE(arrivals.price_source, EXCLUDED.price_source),
       price_ts     = COALESCE(arrivals.price_ts, EXCLUDED.price_ts),
       updated_at   = now()
     RETURNING id`,
    [
      input.confidence,
      input.bridge,
      input.messageId ?? "",
      input.originChain,
      input.originTx ?? "",
      input.originTs ?? null,
      input.asset,
      String(input.amountNative),
      input.amountUsd === undefined || input.amountUsd === null ? null : String(input.amountUsd),
      input.priceUsd === undefined || input.priceUsd === null ? null : String(input.priceUsd),
      input.priceSource ?? null,
      input.priceTs ?? null,
      input.solanaTx,
      input.instructionIndex ?? 0,
      String(input.solanaSlot),
      input.solanaTs,
      input.lagMs ?? 0,
      input.recipient,
      input.recipientFirstSeen ?? false,
    ],
  );
  return row!.id;
}

/**
 * Attaches an origin deposit to an arrival that settled before it was matched.
 *
 * §3.1's buffer holds the pending origin record for six hours, but a settlement
 * can beat its own deposit event to us. When the deposit turns up, the row is
 * promoted from `unattributed` to `matched` and the lag becomes a measurement
 * rather than a zero.
 *
 * Returns false when nothing matched, which is a normal answer: the deposit may
 * belong to an arrival we have not seen yet.
 */
export async function attachOrigin(
  bridge: string,
  messageId: string,
  origin: { originTx: string; originTs: Date },
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE arrivals SET
       confidence = 'matched',
       origin_tx  = $3,
       origin_ts  = $4,
       lag_ms     = GREATEST(0, (EXTRACT(EPOCH FROM (solana_ts - $4)) * 1000)::integer),
       updated_at = now()
     WHERE bridge = $1 AND message_id = $2 AND confidence = 'unattributed'
     RETURNING id`,
    [bridge, messageId, origin.originTx, origin.originTs],
  );
  return rows.length > 0;
}

/**
 * §3.3. Records that value left the chain again.
 *
 * `usd` is the amount that left, not the total — partial exits are
 * proportional, so this accumulates and the status follows the total rather
 * than the last event. A row whose window has closed is refused: §3.4 makes the
 * close permanent, and a late write would silently move a figure that has
 * already been published.
 */
export async function markReexport(
  arrivalId: string,
  usd: string | number,
  at: Date,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE arrivals SET
       reexported_usd = LEAST(COALESCE(amount_usd, 0), reexported_usd + $2),
       reexported_ts  = $3,
       status = CASE
         -- Proportional, so "all of it left" is the only thing that makes the
         -- whole arrival a re-export. Anything less leaves it held, minus the
         -- part that went.
         WHEN reexported_usd + $2 >= COALESCE(amount_usd, 0) THEN 'reexported'
         ELSE status
       END,
       updated_at = now()
     WHERE id = $1 AND window_closed = false
     RETURNING id`,
    [arrivalId, String(usd), at],
  );
  return rows.length > 0;
}

/** §3.5. The first meaningful outbound action, and how long it took. */
export async function recordFirstUse(
  arrivalId: string,
  use: { category: string; program: string | null; at: Date },
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE arrivals SET
       first_use_category = $2,
       first_use_program  = $3,
       first_use_ts       = $4,
       dwell_ms   = GREATEST(0, (EXTRACT(EPOCH FROM ($4 - solana_ts)) * 1000)::bigint),
       status     = CASE WHEN status = 'held' THEN 'deployed' ELSE status END,
       updated_at = now()
     WHERE id = $1 AND first_use_ts IS NULL AND window_closed = false
     RETURNING id`,
    [arrivalId, use.category, use.program, use.at],
  );
  return rows.length > 0;
}

/**
 * Shuts the window on every arrival older than it.
 *
 * Returns the dates touched, because §3.4 requires the rollup for any day a
 * reclassification reached to be recomputed — and the last thing that happens
 * to a row is its window closing.
 */
export async function closeWindows(before: Date): Promise<string[]> {
  const rows = await query<{ day: string }>(
    `WITH closed AS (
       UPDATE arrivals SET window_closed = true, updated_at = now()
       WHERE window_closed = false AND solana_ts < $1
       RETURNING solana_ts
     )
     SELECT DISTINCT to_char(solana_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
     FROM closed ORDER BY day`,
    [before],
  );
  return rows.map((r) => r.day);
}

/** Rows still inside their window, for the watcher to follow. */
export async function openArrivals(limit = 500): Promise<ArrivalRow[]> {
  return query<ArrivalRow>(
    `SELECT id, confidence, bridge, amount_usd, solana_slot, solana_ts,
            status, reexported_usd, window_closed
     FROM arrivals WHERE window_closed = false
     ORDER BY solana_ts ASC LIMIT $1`,
    [limit],
  );
}

/**
 * §7 / §3.1 — what the status page and the nav's freshness indicator read.
 *
 * The unattributed share is a share of *value*, not of rows: one $40M arrival
 * we could not trace matters more than forty small ones, and §7's under-15%
 * acceptance criterion is about the figure rather than the count.
 *
 * Unpriced rows are excluded from that ratio rather than counted as zero, for
 * the same reason they are stored as null.
 */
export interface IndexerFacts {
  lastSlot: number;
  medianLagMs: number;
  unattributedShare: number;
  /** The newest settlement we hold, which is what "updated" means to a reader. */
  updatedAt: string | null;
  entryCount: number;
}

export async function indexerFacts(since: Date): Promise<IndexerFacts> {
  const row = await queryOne<{
    last_slot: string | null;
    median_lag_ms: string | null;
    unattributed_share: string | null;
    updated_at: Date | null;
    entry_count: string;
  }>(
    `SELECT
       MAX(solana_slot)                                        AS last_slot,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lag_ms)
         FILTER (WHERE confidence = 'matched')                 AS median_lag_ms,
       COALESCE(
         SUM(amount_usd) FILTER (WHERE confidence = 'unattributed')
         / NULLIF(SUM(amount_usd), 0),
       0)                                                      AS unattributed_share,
       MAX(solana_ts)                                          AS updated_at,
       COUNT(*)                                                AS entry_count
     FROM arrivals WHERE solana_ts >= $1`,
    [since],
  );

  return {
    lastSlot: Number(row?.last_slot ?? 0),
    medianLagMs: Math.round(Number(row?.median_lag_ms ?? 0)),
    unattributedShare: Number(row?.unattributed_share ?? 0),
    updatedAt: row?.updated_at ? row.updated_at.toISOString() : null,
    entryCount: Number(row?.entry_count ?? 0),
  };
}
