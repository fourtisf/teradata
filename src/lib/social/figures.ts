/**
 * The figures a scheduled post is built from.
 *
 * Read through the same `DataProvider` every page reads, so a post and the page
 * it links to cannot disagree — the recap for the 5th states what
 * `/day/2026-08-05` renders, because both asked the same method the same
 * question. Nothing here computes a figure of its own.
 *
 * Everything returns null rather than a zero. A recap that says `$0` on a day
 * the indexer was down looks exactly like a recap of a day when nothing
 * happened, and §3.1's refusal to guess an origin is the same instinct: no
 * number is better than a number that reads as complete and is not.
 */

import { SITE_URL } from "@/lib/config/site";
import type { BreakdownRow, DataProvider, FlowSummary } from "@/lib/data/types";

export interface SourceShare {
  name: string;
  usd: number;
  /** 0–1 of the period's gross. */
  share: number;
}

export interface DailyFigures {
  date: string;
  summary: FlowSummary;
  topOrigin: SourceShare | null;
  /** Nothing stayed: everything that arrived left again inside the window. */
  netOutflow: boolean;
  link: string;
}

export interface WeeklyFigures {
  /** Both inclusive, both settled. */
  from: string;
  to: string;
  summary: FlowSummary;
  topOrigin: SourceShare | null;
  /** The single strongest day of the seven, by what stayed. */
  bestDay: { date: string; heldUsd: number } | null;
  link: string;
}

function topOf(rows: readonly BreakdownRow[], gross: number): SourceShare | null {
  const top = rows.reduce<BreakdownRow | null>(
    (best, row) => (!best || row.usd > best.usd ? row : best),
    null,
  );
  if (!top || top.usd <= 0) return null;
  return { name: top.name, usd: top.usd, share: gross > 0 ? top.usd / gross : 0 };
}

export async function dailyFigures(
  provider: DataProvider,
  date: string,
): Promise<DailyFigures | null> {
  const page = await provider.getDayPage(date);
  if (!page) return null;
  const { summary } = page;
  if (summary.declaredInboundUsd <= 0) return null;

  return {
    date,
    summary,
    topOrigin: topOf(page.breakdown, summary.declaredInboundUsd),
    netOutflow: summary.stillOnSolanaUsd <= 0,
    link: `${SITE_URL}/day/${date}`,
  };
}

/**
 * The week, summed from the seven settled days rather than asked for as a
 * range.
 *
 * `getSummary("7d")` is a rolling window ending now, so it carries two days
 * whose §3.3 windows are still open — the figure the daily post exists to
 * avoid. Summing settled days costs seven provider calls and makes the weekly
 * total exactly the sum of the seven dailies that preceded it, which is also
 * the only version of the number a reader can check.
 *
 * All seven must be present. A short week understates the total while looking
 * like a complete one.
 */
export async function weeklyFigures(
  provider: DataProvider,
  dates: readonly string[],
): Promise<WeeklyFigures | null> {
  if (dates.length !== 7) return null;
  const pages = await Promise.all(dates.map((date) => provider.getDayPage(date)));
  if (pages.some((page) => page === null)) return null;

  const days = pages as NonNullable<(typeof pages)[number]>[];
  const summary: FlowSummary = {
    range: "7d",
    declaredInboundUsd: 0,
    stillOnSolanaUsd: 0,
    unspentUsd: 0,
    reexportedUsd: 0,
    entryCount: 0,
    // A median cannot be summed. The middle day's is the closest honest thing
    // and no copy quotes it — it is here because `FlowSummary` has the field
    // and the card renderer takes the whole shape.
    medianLagMs: days[3]!.summary.medianLagMs,
  };

  const byOrigin = new Map<string, number>();
  let bestDay: { date: string; heldUsd: number } | null = null;

  for (const page of days) {
    summary.declaredInboundUsd += page.summary.declaredInboundUsd;
    summary.stillOnSolanaUsd += page.summary.stillOnSolanaUsd;
    summary.unspentUsd += page.summary.unspentUsd;
    summary.reexportedUsd += page.summary.reexportedUsd;
    summary.entryCount += page.summary.entryCount;
    for (const row of page.breakdown) {
      byOrigin.set(row.name, (byOrigin.get(row.name) ?? 0) + row.usd);
    }
    if (!bestDay || page.summary.stillOnSolanaUsd > bestDay.heldUsd) {
      bestDay = { date: page.date, heldUsd: page.summary.stillOnSolanaUsd };
    }
  }

  if (summary.declaredInboundUsd <= 0) return null;

  const rows: BreakdownRow[] = [...byOrigin].map(([name, usd]) => ({
    name,
    slug: name,
    usd,
    share: usd / summary.declaredInboundUsd,
  }));

  return {
    from: dates[0]!,
    to: dates[6]!,
    summary,
    topOrigin: topOf(rows, summary.declaredInboundUsd),
    bestDay,
    link: SITE_URL,
  };
}
