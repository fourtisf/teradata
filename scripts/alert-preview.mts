/**
 * Renders alert copy without credentials and without sending anything.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/alert-preview.mts          # variety
 *   npx tsx --tsconfig tsconfig.json scripts/alert-preview.mts --all    # every variant
 *
 * `--all` is the one to run after editing copy.ts: it renders every variant on
 * both channels and fails if any X message is over the limit.
 */
import { telegramMessage, xMessage, buildContext } from "@/lib/alerts/format";
import { VARIANTS } from "@/lib/alerts/copy";
import { SimProvider } from "@/lib/data/sim";
import type { AlertEvent, AlertKind } from "@/lib/alerts/types";
import type { Entry } from "@/lib/data/types";

const NOW = Date.parse("2026-08-04T18:30:00Z");
const KINDS: AlertKind[] = ["reexport", "arrival", "idle", "first_seen"];
const LIMIT = 280;

const provider = new SimProvider({ now: () => NOW });
const pool = await provider.getEntries({ limit: 40 });

function eventFor(kind: AlertKind, entry: Entry, i: number): AlertEvent {
  // A first_seen event only exists for a first-seen recipient — the dispatcher
  // refuses it otherwise, so the fixture has to agree or the preview would show
  // copy that can never be sent.
  const subject: Entry =
    kind === "first_seen"
      ? { ...entry, recipient: { ...entry.recipient, firstSeen: true } }
      : entry;
  const base = { kind, entry: subject, at: new Date(NOW).toISOString() };
  if (kind === "reexport") {
    const partial = i % 3 === 0;
    return { ...base, movedUsd: partial ? entry.amountUsd * 0.6 : entry.amountUsd };
  }
  if (kind === "idle") return { ...base, movedUsd: entry.amountUsd, detail: "34 minutes" };
  return { ...base, movedUsd: entry.amountUsd };
}

let over = 0;
const rule = (s: string) => console.log(`\n${"─".repeat(76)}\n${s}\n${"─".repeat(76)}`);

if (process.argv.includes("--all")) {
  for (const kind of KINDS) {
    rule(`${kind}  ·  ${VARIANTS[kind].length} variants`);
    for (const [i, variant] of VARIANTS[kind].entries()) {
      // Force each variant by building context and calling it directly.
      const entry = pool[i % pool.length]!;
      const event = eventFor(kind, { ...entry, amountUsd: 39_900_000 }, i);
      const ctx = buildContext(event, NOW);
      const x = variant.x(ctx);
      const applies = !variant.when || variant.when(ctx);
      console.log(`\n[${variant.id}]${applies ? "" : "  (gated off for this fixture)"}`);
      console.log(variant.telegram(ctx).join("\n"));
      const len = x.length;
      if (len > LIMIT - 24) over++;
      console.log(`  x (${len + 24}/280${len > LIMIT - 24 ? "  ** OVER **" : ""}): ${x}`);
    }
  }
} else {
  for (const kind of KINDS) {
    rule(kind);
    for (let i = 0; i < 4; i++) {
      const entry = pool[(i * 7 + KINDS.indexOf(kind)) % pool.length]!;
      const scaled = { ...entry, amountUsd: [39.9e6, 6.2e6, 2.8e6, 41.2e6][i]! };
      const event = eventFor(kind, scaled, i);
      console.log(`\n▸ telegram\n${telegramMessage(event, "live", { now: () => NOW })}`);
      const x = xMessage(event, "live", { now: () => NOW });
      const len = x.split("\n")[0]!.length + 24;
      if (len > LIMIT) over++;
      console.log(`\n▸ x  (${len}/280${len > LIMIT ? "  ** OVER **" : ""})\n${x}`);
    }
  }
}

console.log(`\n${over ? `FAIL: ${over} message(s) over the limit` : "All messages within the 280-character limit."}`);
process.exit(over ? 1 : 0);
