/**
 * The alert dispatcher.
 *
 * One entry point: hand it an event, it decides which channels want it, formats
 * per channel and delivers. Everything that could embarrass the product lives
 * here rather than in a transport — the simulated-data guard, the thresholds,
 * the dedupe and the cooldown.
 */

import {
  ALLOW_SIMULATED,
  COOLDOWN_SECONDS,
  DEDUPE_TTL_SECONDS,
  THRESHOLDS,
} from "@/lib/alerts/config";
import { telegramMessage, xMessage } from "@/lib/alerts/format";
import { sendTelegram, telegramConfigured } from "@/lib/alerts/telegram";
import { sendX, xConfigured } from "@/lib/alerts/x";
import type { AlertEvent, Channel, DeliveryResult, DispatchResult } from "@/lib/alerts/types";
import type { DataSource } from "@/lib/data/types";

/**
 * Dedupe and cooldown state.
 *
 * In-process, which is correct for exactly one PM2 instance and wrong the
 * moment there are two — §2 already specifies Redis for the pub/sub layer, and
 * this moves there with it. Until then a second instance would double-post, so
 * `ecosystem.config.cjs` runs one.
 */
const fired = new Map<string, number>();
const lastSent = new Map<Channel, number>();

function sweep(now: number) {
  for (const [key, at] of fired) {
    if (now - at > DEDUPE_TTL_SECONDS * 1000) fired.delete(key);
  }
}

function wants(channel: Channel, event: AlertEvent, now: number): string | null {
  if (event.movedUsd < THRESHOLDS[channel][event.kind]) return "below threshold";
  const last = lastSent.get(channel) ?? 0;
  if (now - last < COOLDOWN_SECONDS[channel] * 1000) return "cooling down";
  return null;
}

export interface DispatchOptions {
  /** Which provider produced the event. The guard reads this, not an env var. */
  dataSource: DataSource;
  /** Format and decide, deliver nothing. */
  dryRun?: boolean;
  now?: () => number;
}

export async function dispatchAlert(
  event: AlertEvent,
  options: DispatchOptions,
): Promise<DispatchResult> {
  const now = (options.now ?? Date.now)();
  const { dataSource, dryRun } = options;
  const result: DispatchResult = { kind: event.kind, entryId: event.entry.id, delivered: [] };

  // The guard. Simulated figures are not pushed to anyone's phone or timeline.
  // A page can carry a label a reader sees; a forwarded message cannot.
  if (dataSource === "sim" && !ALLOW_SIMULATED) {
    result.delivered = (["telegram", "x"] as Channel[]).map((channel) => ({
      channel,
      ok: false,
      reason: "refused: figures are simulated (set ALERTS_ALLOW_SIMULATED=true to test)",
    }));
    return result;
  }

  sweep(now);
  const dedupeKey = `${event.kind}:${event.entry.id}`;
  if (fired.has(dedupeKey)) {
    result.delivered = [{ channel: "telegram", ok: false, reason: "already fired for this entry" }];
    return result;
  }

  const jobs: Array<Promise<DeliveryResult>> = [];

  const skip = (channel: Channel, reason: string) =>
    jobs.push(Promise.resolve({ channel, ok: false, reason }));

  for (const channel of ["telegram", "x"] as Channel[]) {
    const configured = channel === "telegram" ? telegramConfigured() : xConfigured();
    if (!configured) {
      skip(channel, "not configured");
      continue;
    }
    const veto = wants(channel, event, now);
    if (veto) {
      skip(channel, veto);
      continue;
    }
    const text =
      channel === "telegram" ? telegramMessage(event, dataSource) : xMessage(event, dataSource);
    if (dryRun) {
      skip(channel, `dry run: ${text.length} chars`);
      continue;
    }
    lastSent.set(channel, now);
    jobs.push(channel === "telegram" ? sendTelegram(text) : sendX(text));
  }

  result.delivered = await Promise.all(jobs);
  // Only claim the entry once something actually went out, or a transient
  // failure would silently suppress the retry.
  if (result.delivered.some((d) => d.ok)) fired.set(dedupeKey, now);
  return result;
}

/** Preview the exact text each channel would post, without sending. */
export function previewAlert(event: AlertEvent, dataSource: DataSource) {
  return {
    telegram: telegramMessage(event, dataSource),
    x: xMessage(event, dataSource),
  };
}
