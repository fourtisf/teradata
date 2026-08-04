/**
 * Prose for the public pages, generated from the figures the page displays.
 *
 * §8 asks for "prose generated from the data". Two rules hold it honest:
 *
 * 1. Every sentence restates a number that is rendered on the same page. No
 *    claim is made here that the figures do not already support.
 * 2. Nothing names who moved the money. Venue and bridge labels are fine — the
 *    house rule bans firm attribution, not the name of the port (§1).
 */

import { longDate, money, percent } from "@/lib/format";
import type { BreakdownRow, DwellBreakdown, Entry, FlowSummary } from "@/lib/data/types";

function heldShare(summary: FlowSummary): number {
  return summary.declaredInboundUsd > 0
    ? summary.stillOnSolanaUsd / summary.declaredInboundUsd
    : 0;
}

/** "$412.9M arrived … $268.4M — 65% — was still here when the window closed." */
function arrivalSentence(subject: string, summary: FlowSummary): string {
  return (
    `${subject} ${money(summary.declaredInboundUsd)} of gross inbound value, ` +
    `of which ${money(summary.stillOnSolanaUsd)} — ${percent(heldShare(summary), 0)} — ` +
    `was still on Solana when the 24-hour window closed.`
  );
}

function roundTripSentence(summary: FlowSummary): string {
  return (
    `The remaining ${money(summary.reexportedUsd)} left again inside the window and is ` +
    `excluded from the held figure, which is why this number is smaller than the gross ` +
    `volume reported elsewhere.`
  );
}

function largestSentence(entries: Entry[]): string | null {
  const largest = entries.reduce<Entry | null>(
    (best, entry) => (!best || entry.amountUsd > best.amountUsd ? entry : best),
    null,
  );
  if (!largest) return null;
  const wallet = largest.recipient.firstSeen
    ? "a wallet with no prior Solana history"
    : "a returning wallet";
  return (
    `The largest single arrival was ${money(largest.amountUsd)} from ${largest.origin} ` +
    `via ${largest.route === "withdrawal" ? "an exchange withdrawal" : largest.route}, ` +
    `received by ${wallet}.`
  );
}

function leaderSentence(rows: BreakdownRow[], noun: string): string | null {
  const top = rows[0];
  if (!top) return null;
  return `${top.name} was the largest ${noun}, at ${money(top.usd)} — ${percent(top.share, 0)} of the total.`;
}

export function dayProse(
  date: string,
  summary: FlowSummary,
  breakdown: BreakdownRow[],
  entries: Entry[],
  dwell: DwellBreakdown,
): string[] {
  const out = [
    arrivalSentence(`On ${longDate(`${date}T00:00:00.000Z`)}, Solana received`, summary),
    roundTripSentence(summary),
    `${money(dwell.unspentUsd)} of what stayed had still not moved by the end of the day — ` +
      `idle capital is the only inflow figure that is forward-looking.`,
  ];
  const leader = leaderSentence(breakdown, "single source");
  if (leader) out.push(leader);
  const largest = largestSentence(entries);
  if (largest) out.push(largest);
  return out;
}

export function originProse(
  origin: string,
  kind: "bridge" | "exchange",
  summary: FlowSummary,
  breakdown: BreakdownRow[],
  entries: Entry[],
  days: number,
): string[] {
  const out = [
    arrivalSentence(`Over the last ${days} days, capital arriving on Solana from ${origin} totalled`, summary),
    roundTripSentence(summary),
    kind === "bridge"
      ? `Arrivals from ${origin} are matched to their origin transaction on the bridge's own ` +
        `message identifier, so each entry can be traced back to the deposit that created it.`
      : `${origin} withdrawals carry no protocol-level identifier. They are attributed by ` +
        `hot-wallet labelling, which is a weaker class of evidence than a bridge match, and ` +
        `every entry says so.`,
  ];
  const leader = leaderSentence(breakdown, kind === "bridge" ? "route" : "destination");
  if (leader) out.push(leader);
  const largest = largestSentence(entries);
  if (largest) out.push(largest);
  return out;
}

export function routeProse(
  route: string,
  identifier: string,
  summary: FlowSummary,
  breakdown: BreakdownRow[],
  entries: Entry[],
  days: number,
): string[] {
  const out = [
    arrivalSentence(`Over the last ${days} days, ${route} settled`, summary),
    roundTripSentence(summary),
    `Every ${route} arrival is joined to its origin-chain deposit on ${identifier}, so the ` +
      `settlement lag below is measured rather than estimated.`,
  ];
  const leader = leaderSentence(breakdown, "origin chain");
  if (leader) out.push(leader);
  const largest = largestSentence(entries);
  if (largest) out.push(largest);
  return out;
}

/** One-line meta description. Search results cut around 155 characters. */
export function metaDescription(subject: string, summary: FlowSummary): string {
  return (
    `${subject}: ${money(summary.declaredInboundUsd)} gross inbound, ` +
    `${money(summary.stillOnSolanaUsd)} still on Solana after round trips are removed ` +
    `(${percent(heldShare(summary), 0)} held).`
  );
}
