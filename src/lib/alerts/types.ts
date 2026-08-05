/**
 * §P5 — alerts.
 *
 * An alert is a movement worth waking someone for. Four of them, and they map
 * onto the same events the websocket layer already emits (§9), so the ingest
 * worker in P1 has one place to hand things to and no new vocabulary to learn.
 */

import type { Entry } from "@/lib/data/types";

export type AlertKind =
  /** A single arrival over the size threshold. */
  | "arrival"
  /** Capital that landed has now left the chain — §3.3, the round trip closing. */
  | "reexport"
  /** Landed, and still has not moved. The only forward-looking signal we have. */
  | "idle"
  /** A wallet with no prior Solana history, funded above the threshold. */
  | "first_seen";

export interface AlertEvent {
  kind: AlertKind;
  entry: Entry;
  /** For `reexport`: how much of the arrival left. For others, the full amount. */
  movedUsd: number;
  /** For `reexport`: where it went. For `idle`: how long it has sat. */
  detail?: string;
  /** ISO 8601. */
  at: string;
}

export type Channel = "telegram" | "x";

export interface DeliveryResult {
  channel: Channel;
  ok: boolean;
  /** Why it was not sent. `skipped` reasons are normal, `error` ones are not. */
  reason?: string;
  id?: string;
}

export interface DispatchResult {
  kind: AlertKind;
  entryId: string;
  delivered: DeliveryResult[];
}
