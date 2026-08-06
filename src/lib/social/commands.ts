/**
 * The Telegram bot, answering rather than broadcasting.
 *
 * The rest of this directory pushes: a recap fires on a clock and goes to
 * everyone. This is the other direction — someone asks the bot a question in a
 * chat and it answers there. It lives here because "social" is everything the
 * two accounts do, and an answer is subject to exactly the same rules as a
 * post: no invented figures, no firm named, and the plain register of
 * `alerts/copy.ts` rather than the site's vocabulary.
 *
 * ## What it will not do
 *
 * Quote a figure while `DATA_SOURCE=sim`. A reply is one-to-one and pull-based,
 * which sounds safer than a broadcast and is not: it is forwarded and
 * screenshotted the same way, and a generated dollar amount under the brand is
 * the damage §1 says cannot be undone afterwards. So the sim answer is the
 * honest one — nothing is measured yet — rather than a number with a label on
 * it that a screenshot drops.
 *
 * ## What it will not become
 *
 * A relay. Nothing a user types is ever echoed back, and the parser keeps the
 * first token and discards the rest. A bot that repeats input is a bot that
 * posts someone else's link under our name.
 */

import { escapeHtml, simulatedPrefix } from "@/lib/alerts/format";
import { ALLOW_SIMULATED } from "@/lib/alerts/config";
import { SITE_URL } from "@/lib/config/site";
import { count, money, percent, seconds } from "@/lib/format";
import { spokenDate } from "@/lib/social/time";
import type { PosterState } from "@/lib/social/state";
import type { DataProvider, FlowSummary } from "@/lib/data/types";

export type Command = "today" | "week" | "status" | "help";

const COMMANDS: Record<string, Command> = {
  "/today": "today",
  "/week": "week",
  "/status": "status",
  "/help": "help",
  "/start": "help",
};

/**
 * The command in a message, or null.
 *
 * Telegram appends the bot's username in groups — `/today@TareDataBot` — so the
 * suffix is stripped. Everything after the first token is discarded rather than
 * parsed: there are no arguments, and accepting one is how a handler starts
 * reflecting input.
 */
export function parseCommand(text: string): Command | null {
  const first = text.trim().split(/\s+/)[0];
  if (!first?.startsWith("/")) return null;
  return COMMANDS[first.split("@")[0]!.toLowerCase()] ?? null;
}

const LINK = SITE_URL;

/** The answer when there is nothing measured to answer with. */
function unmeasured(): string {
  return [
    "<b>Nothing is measured yet.</b>",
    "",
    "The site is running on generated figures while the indexer is built. This bot will not " +
      "quote a number it cannot stand behind, so it is not going to show you one.",
    "",
    "The method, and what it will report when there is data:",
    LINK,
  ].join("\n");
}

function helpText(): string {
  return [
    "<b>Tare</b> — capital arriving on Solana, and whether it stayed.",
    "",
    "/today — what came in today, and what is still here",
    "/week — the last seven days",
    "/status — what the indexer is doing, and what it is missing",
    "",
    "A recap is posted here every day without being asked. It covers the most recent day whose " +
      "24-hour windows have all closed, so the figure in it will not move afterwards.",
    "",
    LINK,
  ].join("\n");
}

function flowText(title: string, summary: FlowSummary, tail: string): string {
  return [
    `🟢 <b>${escapeHtml(title)}</b>`,
    "",
    `<b>${money(summary.declaredInboundUsd)}</b> came into Solana. ` +
      `<b>${money(summary.stillOnSolanaUsd)}</b> of it is still here.`,
    "",
    `${money(summary.reexportedUsd)} came in and went out again. We do not count that as new money.`,
    "",
    tail,
    "",
    LINK,
  ].join("\n");
}

function statusText(
  status: Awaited<ReturnType<DataProvider["getStatus"]>>,
  poster: PosterState,
): string {
  const last = poster.lastDaily
    ? `Last recap posted here: ${spokenDate(poster.lastDaily.to)}.`
    : "No recap has been posted here yet.";

  return [
    `<b>Indexer: ${status.state}</b>`,
    "",
    `Last slot read ${count(status.lastSlot)}. Half of all arrivals settle in under ${seconds(status.medianLagMs)}.`,
    "",
    `${percent(status.unattributedShare)} of the value that arrived could not be traced to where it ` +
      `came from. It is counted in the total and left out of the breakdown by source, rather than ` +
      `guessed at.`,
    "",
    last,
    "",
    `${LINK}/status`,
  ].join("\n");
}

/**
 * The reply to one command.
 *
 * Everything it needs is fetched here rather than by the route, so the route
 * stays a transport and this stays the only place a figure is turned into a
 * sentence.
 */
export async function replyTo(
  command: Command,
  provider: DataProvider,
  poster: PosterState,
): Promise<string> {
  if (command === "help") return helpText();

  // The guard. Same switch as every other path, and the same reason.
  if (provider.source === "sim" && !ALLOW_SIMULATED) return unmeasured();
  const label = simulatedPrefix(provider.source);

  if (command === "status") {
    const status = await provider.getStatus();
    return label + statusText(status, poster);
  }

  if (command === "week") {
    const summary = await provider.getSummary("7d");
    return (
      label +
      flowText(
        "The last seven days",
        summary,
        `Across ${count(summary.entryCount)} arrivals. Every one of them was watched for 24 hours ` +
          `after it landed.`,
      )
    );
  }

  const summary = await provider.getSummary("24h");
  return (
    label +
    flowText(
      "Today so far",
      summary,
      "Today is still moving. Each arrival is watched for 24 hours, so this figure can go down " +
        "as money leaves again — the daily recap posted here is the version that will not.",
    )
  );
}
