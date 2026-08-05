/**
 * Renders every alert kind on both channels, without credentials and without
 * sending anything. Run before changing the copy:
 *
 *   npx tsx --tsconfig tsconfig.json scripts/alert-preview.mts
 */
import { previewAlert } from "@/lib/alerts/dispatch";
import { SimProvider } from "@/lib/data/sim";
import type { AlertEvent, AlertKind } from "@/lib/alerts/types";

const provider = new SimProvider({ now: () => Date.parse("2026-08-04T14:22:00Z") });
const entries = await provider.getEntries({ limit: 12 });

const bridge = entries.find((e) => e.kind === "bridge")!;
const venue = entries.find((e) => e.kind === "exchange")!;
const fresh = entries.find((e) => e.recipient.firstSeen) ?? bridge;

const CASES: Array<[AlertKind, AlertEvent]> = [
  ["arrival", { kind: "arrival", entry: venue, movedUsd: 6_200_000, at: "" }],
  ["reexport", { kind: "reexport", entry: bridge, movedUsd: 39_900_000,
                 detail: "Wormhole → Ethereum", at: "" }],
  ["idle", { kind: "idle", entry: bridge, movedUsd: 2_800_000, detail: "34 minutes", at: "" }],
  ["first_seen", { kind: "first_seen", entry: fresh, movedUsd: 1_400_000, at: "" }],
];

for (const [kind, event] of CASES) {
  const { telegram, x } = previewAlert(event, "live");
  console.log(`\n${"=".repeat(72)}\n${kind}\n${"=".repeat(72)}`);
  console.log("--- telegram ---");
  console.log(telegram);
  console.log(`\n--- x (${x.length} chars, limit 280${x.length > 280 ? "  ** OVER **" : ""}) ---`);
  console.log(x);
}

const sim = previewAlert(CASES[0]![1], "sim");
console.log(`\n${"=".repeat(72)}\nsim mode, with ALERTS_ALLOW_SIMULATED\n${"=".repeat(72)}`);
console.log(sim.x);
