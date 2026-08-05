/**
 * Whether the indexer is alive — which is not the same question as whether
 * money is moving.
 *
 * §7 puts the indexer's state on a public page. The tempting way to derive it
 * is "how long since the last arrival", and that reading calls a quiet Sunday
 * an outage and calls a stalled stream healthy for as long as its backlog
 * lasts. So the worker stamps a heartbeat on every slot it processes, whether
 * or not anything arrived in it, and liveness is the age of that stamp.
 */

import { query, queryOne } from "@/lib/db/pool";

/**
 * Solana produces a slot roughly every 400ms, so silence is loud here.
 *
 * Thirty seconds is ~75 missed slots — well past a normal hiccup and well
 * inside the ten-second promise §P5 makes about alerts, which cannot be kept by
 * a stream nobody noticed had stopped. Five minutes is not a wobble; it is an
 * outage, and the page says so rather than showing a stale figure as current.
 */
const DEGRADED_MS = 30_000;
const DOWN_MS = 5 * 60_000;

export interface Heartbeat {
  lastSlot: number;
  /** The chain's clock for that slot. Null before the first stamp. */
  slotTs: string | null;
  /** Ours, when we processed it. */
  updatedAt: string | null;
}

/** Called by the worker on every processed slot. One row, always. */
export async function stampHeartbeat(slot: number | bigint, slotTs: Date | null): Promise<void> {
  await query(
    `INSERT INTO indexer_state (id, last_slot, slot_ts, updated_at)
     VALUES (true, $1, $2, now())
     ON CONFLICT (id) DO UPDATE SET
       -- A slot behind the one we have is a replay catching up, not progress.
       -- Taking the greater keeps the reported head monotonic.
       last_slot  = GREATEST(indexer_state.last_slot, EXCLUDED.last_slot),
       slot_ts    = EXCLUDED.slot_ts,
       updated_at = now()`,
    [String(slot), slotTs],
  );
}

export async function readHeartbeat(): Promise<Heartbeat | null> {
  const row = await queryOne<{ last_slot: string; slot_ts: Date | null; updated_at: Date }>(
    "SELECT last_slot, slot_ts, updated_at FROM indexer_state WHERE id = true",
  );
  if (!row) return null;
  return {
    lastSlot: Number(row.last_slot),
    slotTs: row.slot_ts ? row.slot_ts.toISOString() : null,
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * `live`, `degraded` or `down`, from the age of the heartbeat alone.
 *
 * No heartbeat at all is `down` rather than `live`: a database that has never
 * been written to is exactly the state where claiming health is most wrong.
 */
export function livenessOf(heartbeat: Heartbeat | null, now: number): "live" | "degraded" | "down" {
  if (!heartbeat?.updatedAt) return "down";
  const age = now - Date.parse(heartbeat.updatedAt);
  if (age >= DOWN_MS) return "down";
  if (age >= DEGRADED_MS) return "degraded";
  return "live";
}

export { DEGRADED_MS, DOWN_MS };
