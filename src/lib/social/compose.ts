/**
 * Copy for the scheduled posts.
 *
 * Same rules as `alerts/copy.ts`, and for the same reason: this is the half of
 * the feed that publishes on a quiet week, so it is the half a reader sees
 * most, and a template with a different number in it every day reads as a
 * script rather than a measurement.
 *
 * - No terms of art. *Re-exported*, *idle capital*, *dwell*, *inflow* and *net*
 *   all belong on the site next to a definition. A post arrives alone.
 * - No idioms, no exclamation, no adjective doing work the number is doing.
 * - Nothing names who moved the money (§1). Origins are venues and bridges —
 *   the port, never the firm.
 *
 * Variants are chosen by hashing the occurrence key, so the post for a given
 * day is the same text on every retry, and a reviewer can reproduce what went
 * out from the date alone.
 */

import { escapeHtml, fitForX, simulatedPrefix } from "@/lib/alerts/format";
import { money, percent } from "@/lib/format";
import { hashSeed } from "@/lib/rng";
import { REEXPORT_WINDOW_HOURS } from "@/lib/social/config";
import { spokenDay } from "@/lib/social/time";
import type { ComposedPost, JobKind } from "@/lib/social/types";
import type { DailyFigures, WeeklyFigures } from "@/lib/social/figures";
import type { DataSource } from "@/lib/data/types";

/** Violet arrives, green stays, rose leaves — §5's three meanings, unchanged. */
const STAYED = "🟢";
const LEFT = "🔴";

/** "24 hours", "12 hours" — §11 may retune the window and the copy follows. */
function windowPhrase(hours: number = REEXPORT_WINDOW_HOURS): string {
  return hours === 1 ? "an hour" : `${hours} hours`;
}

interface Context {
  /** "5 August". */
  day: string;
  /** "30 July" — the weekly's opening day. */
  from: string;
  gross: string;
  held: string;
  /** What came in and went out again. */
  left: string;
  unspent: string;
  /** 0–1 of what stayed that has not moved at all. */
  unspentShare: number;
  heldPct: string;
  origin: string | null;
  originUsd: string;
  originPct: string;
  originShare: number;
  bestDay: string | null;
  bestDayUsd: string;
  netOutflow: boolean;
  window: string;
  link: string;
}

interface Variant {
  id: string;
  when?: (c: Context) => boolean;
  /** Telegram header. */
  title: (c: Context) => string;
  mark: (c: Context) => string;
  /** Telegram paragraphs. Blank lines between them are added by the formatter. */
  telegram: (c: Context) => string[];
  x: (c: Context) => string;
}

/* -------------------------------------------------------------------------
 * One settled day.
 * ---------------------------------------------------------------------- */
const DAILY: Variant[] = [
  {
    id: "stayed",
    when: (c) => !c.netOutflow,
    mark: () => STAYED,
    title: (c) => `${c.day}: ${c.held} stayed`,
    telegram: (c) => [
      `<b>${c.gross}</b> came into Solana on ${c.day}. ${c.window} later, <b>${c.held}</b> of it was still here.`,
      `The other ${c.left} came in and went out again, so we do not count it as new money.`,
    ],
    x: (c) =>
      `${c.day} on Solana: ${c.gross} came in, and ${c.held} of it was still here ${c.window} later. The other ${c.left} came in and went out again, so we do not count it.`,
  },
  {
    id: "gross-vs-net",
    when: (c) => !c.netOutflow,
    mark: () => STAYED,
    title: (c) => `${c.held} stayed on ${c.day}`,
    telegram: (c) => [
      `Other sites show <b>${c.gross}</b> of volume for ${c.day}. We watched every arrival for ${c.window} and ${c.left} of it left again.`,
      `<b>${c.held}</b> was still on Solana at the end. That is ${c.heldPct} of what arrived.`,
    ],
    x: (c) =>
      `Other sites show ${c.gross} of Solana volume for ${c.day}. We watched every arrival for ${c.window}: ${c.left} left again. ${c.held} was still here at the end — ${c.heldPct} of what arrived.`,
  },
  {
    id: "unspent",
    // Gated on the figure being worth a headline rather than on it being
    // large: a tenth of what stayed is the ordinary case, and the number is
    // still tens of millions. The floor is there for the day almost everything
    // was put to work, where "$1.2M has not moved" is padding.
    when: (c) => !c.netOutflow && c.unspentShare >= 0.05,
    mark: () => STAYED,
    title: (c) => `${c.day}: ${c.unspent} has not moved`,
    telegram: (c) => [
      `<b>${c.gross}</b> came into Solana on ${c.day} and <b>${c.held}</b> of it was still here a day later.`,
      `${c.unspent} of that has not been swapped, deposited or sent anywhere. It is money waiting to be spent.`,
    ],
    x: (c) =>
      `${c.held} stayed on Solana on ${c.day}, out of ${c.gross} that came in. ${c.unspent} of it has not been swapped, deposited or sent anywhere yet.`,
  },
  {
    id: "top-source",
    // A fifth of the day's arrivals through one venue or bridge is enough for
    // "sent the most" to mean something. Below that the leader is an artefact
    // of a flat distribution and naming it implies a concentration that is not
    // there.
    when: (c) => !c.netOutflow && c.origin !== null && c.originShare >= 0.2,
    mark: () => STAYED,
    // Not "$X stayed" again. A header identical to another variant's undoes
    // the point of having variants, and the share below is a share of what
    // arrived rather than of what stayed — so it stays out of the headline
    // where the two would read as the same number.
    title: (c) => `${c.origin} sent the most on ${c.day}`,
    telegram: (c) => [
      `<b>${c.gross}</b> came in and <b>${c.held}</b> of it was still on Solana a day later.`,
      `${c.origin} sent the most: ${c.originUsd}, ${c.originPct} of everything that arrived.`,
    ],
    x: (c) =>
      `${c.gross} came into Solana on ${c.day} and ${c.held} was still here a day later. ${c.origin} sent the most, ${c.originUsd} — ${c.originPct} of everything that arrived.`,
  },
  {
    // The day the method is for. Rose, because this is capital that left.
    id: "net-outflow",
    when: (c) => c.netOutflow,
    mark: () => LEFT,
    title: (c) => `${c.day}: nothing stayed`,
    telegram: (c) => [
      `<b>${c.gross}</b> came into Solana on ${c.day}. All of it left again within ${c.window}.`,
      `Other sites count both moves as volume. The day added no new money to the chain.`,
    ],
    x: (c) =>
      `${c.gross} came into Solana on ${c.day} and all of it left again within ${c.window}. Other sites count both moves as volume. The day added nothing.`,
  },
];

/* -------------------------------------------------------------------------
 * Seven settled days.
 * ---------------------------------------------------------------------- */
const WEEKLY: Variant[] = [
  {
    id: "week-total",
    mark: () => STAYED,
    title: (c) => `${c.from} – ${c.day}: ${c.held} stayed`,
    telegram: (c) => [
      `<b>${c.gross}</b> came into Solana over those seven days. <b>${c.held}</b> of it was still here after each arrival had been watched for ${c.window}.`,
      `${c.left} came in and went out again. We do not count that part.`,
    ],
    x: (c) =>
      `Seven days to ${c.day}: ${c.gross} came into Solana and ${c.held} of it stayed. The other ${c.left} came in and went out again, and we do not count it.`,
  },
  {
    id: "week-best-day",
    when: (c) => c.bestDay !== null,
    mark: () => STAYED,
    title: (c) => `The week to ${c.day}: ${c.held} stayed`,
    telegram: (c) => [
      `<b>${c.gross}</b> arrived on Solana across the seven days. <b>${c.held}</b> was still here after every window closed.`,
      `${c.bestDay} was the strongest day: ${c.bestDayUsd} stayed.`,
    ],
    x: (c) =>
      `${c.gross} came into Solana in the seven days to ${c.day}, and ${c.held} of it stayed. The strongest day was ${c.bestDay}, with ${c.bestDayUsd} still here after ${c.window}.`,
  },
  {
    id: "week-top-source",
    when: (c) => c.origin !== null,
    mark: () => STAYED,
    title: (c) => `The week to ${c.day}: ${c.held} stayed`,
    telegram: (c) => [
      `<b>${c.gross}</b> came into Solana over seven days and <b>${c.held}</b> of it was still here a day after arriving.`,
      `${c.origin} sent the most: ${c.originUsd}, ${c.originPct} of the total.`,
    ],
    x: (c) =>
      `${c.gross} came into Solana in the seven days to ${c.day}. ${c.held} of it stayed. ${c.origin} sent the most, ${c.originUsd} — ${c.originPct} of the total.`,
  },
];

const VARIANTS: Record<JobKind, Variant[]> = { daily: DAILY, weekly: WEEKLY };

function pick(kind: JobKind, key: string, context: Context): Variant {
  const pool = VARIANTS[kind].filter((v) => !v.when || v.when(context));
  const usable = pool.length ? pool : VARIANTS[kind];
  return usable[hashSeed(key) % usable.length]!;
}

function dailyContext(figures: DailyFigures): Context {
  const s = figures.summary;
  const heldShare = s.declaredInboundUsd > 0 ? s.stillOnSolanaUsd / s.declaredInboundUsd : 0;
  return {
    day: spokenDay(figures.date),
    from: spokenDay(figures.date),
    gross: money(s.declaredInboundUsd),
    held: money(s.stillOnSolanaUsd),
    left: money(s.reexportedUsd),
    unspent: money(s.unspentUsd),
    unspentShare: s.stillOnSolanaUsd > 0 ? s.unspentUsd / s.stillOnSolanaUsd : 0,
    heldPct: percent(heldShare, 0),
    origin: figures.topOrigin?.name ?? null,
    originUsd: money(figures.topOrigin?.usd ?? 0),
    originPct: percent(figures.topOrigin?.share ?? 0, 0),
    originShare: figures.topOrigin?.share ?? 0,
    bestDay: null,
    bestDayUsd: "",
    netOutflow: figures.netOutflow,
    window: windowPhrase(),
    link: figures.link,
  };
}

function weeklyContext(figures: WeeklyFigures): Context {
  const s = figures.summary;
  const heldShare = s.declaredInboundUsd > 0 ? s.stillOnSolanaUsd / s.declaredInboundUsd : 0;
  return {
    day: spokenDay(figures.to),
    from: spokenDay(figures.from),
    gross: money(s.declaredInboundUsd),
    held: money(s.stillOnSolanaUsd),
    left: money(s.reexportedUsd),
    unspent: money(s.unspentUsd),
    unspentShare: s.stillOnSolanaUsd > 0 ? s.unspentUsd / s.stillOnSolanaUsd : 0,
    heldPct: percent(heldShare, 0),
    origin: figures.topOrigin?.name ?? null,
    originUsd: money(figures.topOrigin?.usd ?? 0),
    originPct: percent(figures.topOrigin?.share ?? 0, 0),
    originShare: figures.topOrigin?.share ?? 0,
    bestDay: figures.bestDay ? spokenDay(figures.bestDay.date) : null,
    bestDayUsd: money(figures.bestDay?.heldUsd ?? 0),
    netOutflow: s.stillOnSolanaUsd <= 0,
    window: windowPhrase(),
    link: figures.link,
  };
}

function render(
  kind: JobKind,
  key: string,
  context: Context,
  dataSource: DataSource,
  cardDate: string | null,
): ComposedPost {
  const variant = pick(kind, key, context);
  const label = simulatedPrefix(dataSource);

  const telegram = [
    `${variant.mark(context)} <b>${escapeHtml(label + variant.title(context))}</b>`,
    "",
    variant.telegram(context).join("\n\n"),
    "",
    context.link,
  ].join("\n");

  return {
    key,
    kind,
    telegram,
    x: `${fitForX(label + variant.x(context))}\n${context.link}`,
    link: context.link,
    cardDate,
  };
}

export function composeDaily(
  key: string,
  figures: DailyFigures,
  dataSource: DataSource,
): ComposedPost {
  return render("daily", key, dailyContext(figures), dataSource, figures.date);
}

export function composeWeekly(
  key: string,
  figures: WeeklyFigures,
  dataSource: DataSource,
): ComposedPost {
  // No card: the generator in `og.tsx` is wired to a page, and there is no
  // /week route to point it at. Adding one to make an image is the tail
  // wagging the dog — the weekly links to the live surface instead.
  return render("weekly", key, weeklyContext(figures), dataSource, null);
}

export { VARIANTS, dailyContext, weeklyContext, render };
export type { Context, Variant };
