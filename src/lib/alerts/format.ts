/**
 * Alert copy.
 *
 * The house rule (§1) applies here more than anywhere: an alert is pushed,
 * screenshotted and quoted. It describes measured flow and the wallet's
 * verifiable properties — first seen or returning, funded from which venue,
 * idle for how long — and never who moved the money. Venue and bridge names are
 * fine; they are the port, not the firm.
 */

import { dwell, money, seconds, shortAddress } from "@/lib/format";
import { SITE_URL } from "@/lib/config/site";
import { ALLOW_SIMULATED } from "@/lib/alerts/config";
import type { AlertEvent } from "@/lib/alerts/types";
import type { DataSource } from "@/lib/data/types";

/** Violet arrives, green stays, rose leaves — the same three meanings as §5. */
const MARK: Record<AlertEvent["kind"], string> = {
  arrival: "🟣",
  reexport: "🔴",
  idle: "🟢",
  first_seen: "🟣",
};

const HEADLINE: Record<AlertEvent["kind"], string> = {
  arrival: "Arrival",
  reexport: "Re-exported",
  idle: "Idle capital",
  first_seen: "First-seen wallet",
};

function wallet(event: AlertEvent): string {
  return event.entry.recipient.firstSeen ? "first-seen wallet" : "returning wallet";
}

function source(event: AlertEvent): string {
  const { origin, route, kind } = event.entry;
  return kind === "exchange" ? `${origin} withdrawal` : `${origin} via ${route}`;
}

function permalink(event: AlertEvent): string {
  return `${SITE_URL}/day/${event.entry.solanaTs.slice(0, 10)}`;
}

/**
 * The prefix is added here rather than in a transport so that no delivery path
 * can post an unlabelled simulated figure, however it is called.
 */
function prefix(dataSource: DataSource): string {
  return dataSource === "sim" && ALLOW_SIMULATED ? "[SIMULATED] " : "";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Telegram, HTML parse mode. Room to be complete. */
export function telegramMessage(event: AlertEvent, dataSource: DataSource): string {
  const e = event.entry;
  const lines: string[] = [
    `${MARK[event.kind]} <b>${escapeHtml(prefix(dataSource) + HEADLINE[event.kind])}</b>`,
    "",
  ];

  if (event.kind === "reexport") {
    lines.push(
      `<b>${money(event.movedUsd)}</b> that arrived from ${escapeHtml(source(event))} has left the chain.`,
    );
    if (event.detail) lines.push(`Out: ${escapeHtml(event.detail)}`);
  } else if (event.kind === "idle") {
    lines.push(
      `<b>${money(event.movedUsd)}</b> from ${escapeHtml(source(event))} has not moved for ${escapeHtml(event.detail ?? dwell(e.dwellMs))}.`,
    );
  } else {
    lines.push(`<b>${money(event.movedUsd)}</b> arrived from ${escapeHtml(source(event))}.`);
  }

  lines.push(
    "",
    `Recipient: ${wallet(event)} · <code>${escapeHtml(shortAddress(e.recipient.address))}</code>`,
    `Settled in ${seconds(e.lagMs)} · confidence <code>${e.confidence}</code>`,
    "",
    permalink(event),
  );
  return lines.join("\n");
}

/**
 * X, 280 characters. Built shortest-first and only padded while it fits, so it
 * is never truncated mid-word or mid-figure.
 */
export function xMessage(event: AlertEvent, dataSource: DataSource): string {
  const e = event.entry;
  const link = permalink(event);
  // A t.co link always counts as 23 characters however long the URL is.
  const budget = 280 - 23 - 1;

  const head =
    event.kind === "reexport"
      ? `${prefix(dataSource)}${money(event.movedUsd)} that arrived from ${source(event)} has left Solana again.`
      : event.kind === "idle"
        ? `${prefix(dataSource)}${money(event.movedUsd)} from ${source(event)} landed and has not moved for ${event.detail ?? dwell(e.dwellMs)}.`
        : `${prefix(dataSource)}${money(event.movedUsd)} arrived on Solana from ${source(event)}.`;

  const extras = [
    `Recipient: ${wallet(event)}.`,
    `Settled in ${seconds(e.lagMs)}.`,
    event.kind === "reexport" && event.detail ? `Out via ${event.detail}.` : "",
  ].filter(Boolean);

  let text = head;
  for (const extra of extras) {
    if (text.length + 1 + extra.length > budget) break;
    text += ` ${extra}`;
  }
  return `${text}\n${link}`;
}
