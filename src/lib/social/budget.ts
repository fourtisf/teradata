/**
 * The X post budget, enforced.
 *
 * X's free tier allows 500 posts per calendar month and answers 429 for the
 * 501st. That is a fine constraint to live with and a terrible one to discover
 * at the moment it binds, because the posts you lose are the ones at the end of
 * the month rather than the ones you would have chosen to drop.
 *
 * So the two halves of the social layer draw on the allowance at different
 * depths. Scheduled posts are few, predictable, and the reason the account
 * looks alive on a quiet week; they are allowed down to the safety margin.
 * Alerts are elastic — a busy day can produce several — so they stop first,
 * leaving the reserve intact for the recaps that are still to come.
 *
 * Telegram has no equivalent cap. It is a subscriber feed with its own cooldown
 * and nothing here applies to it.
 */

import { X_MONTHLY_BUDGET, X_SAFETY_MARGIN, X_SCHEDULED_RESERVE } from "@/lib/alerts/config";
import type { Channel, PostLedger, Purpose } from "@/lib/social/types";

export interface BudgetVerdict {
  ok: boolean;
  /** Posts already published on this channel this UTC month. */
  used: number;
  /** What this purpose may spend up to. */
  cap: number;
  reason?: string;
}

/** What a purpose is allowed to reach, out of the monthly allowance. */
export function capFor(purpose: Purpose): number {
  const usable = Math.max(0, X_MONTHLY_BUDGET - X_SAFETY_MARGIN);
  return purpose === "scheduled" ? usable : Math.max(0, usable - X_SCHEDULED_RESERVE);
}

/**
 * Whether one more post of this purpose may go out on this channel.
 *
 * Fails open when the ledger cannot be read: the count is bookkeeping, and X
 * enforces the real cap itself. Refusing to post because we cannot read a file
 * would turn a bookkeeping fault into silence — `x.ts` already reads a 429 as
 * the monthly limit, so the worst case is a rejected post rather than a wrong
 * figure.
 */
export async function checkBudget(
  ledger: PostLedger,
  channel: Channel,
  purpose: Purpose,
  at: number = Date.now(),
): Promise<BudgetVerdict> {
  if (channel !== "x") return { ok: true, used: 0, cap: Infinity };

  const used = await ledger.countMonth("x", at);
  const cap = capFor(purpose);
  if (used >= cap) {
    return {
      ok: false,
      used,
      cap,
      reason:
        purpose === "alert"
          ? `X budget: ${used}/${cap} used this month, the rest is reserved for scheduled posts`
          : `X budget: ${used}/${cap} used this month`,
    };
  }
  return { ok: true, used, cap };
}
