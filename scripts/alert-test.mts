/**
 * Sends one real alert through the real dispatcher, to one channel.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/alert-test.mts
 *   npx tsx --tsconfig tsconfig.json scripts/alert-test.mts --kind reexport
 *   npx tsx --tsconfig tsconfig.json scripts/alert-test.mts --channel x --public
 *
 * This is the whole path — thresholds, cooldown, dedupe, formatting, HTTP.
 * `alert-preview.mts` renders the copy and sends nothing; this one sends.
 *
 * ## Telegram first, into a private channel
 *
 * Default channel is telegram, because a mistake there is recoverable: point
 * TELEGRAM_CHAT_ID at a private channel, test, then point it back. Figures are
 * still simulated, so every message carries [SIMULATED] — but a forwarded
 * message loses that prefix the moment someone screenshots it, which is why the
 * private channel matters more than the prefix does.
 *
 * ## X is different, and --public is why
 *
 * There is no private tweet. @Taredata is a public account, so a test post is
 * public, and an invented dollar figure published under the brand is the exact
 * damage §1 says cannot be undone by fixing the data afterwards. Deleting it
 * afterwards does not help: it was live, and it was screenshottable.
 *
 * So --channel x requires --public as well. Not to be difficult — to make sure
 * the second flag is typed by someone who has read this paragraph.
 */
import { dispatchAlert } from "@/lib/alerts/dispatch";
import { previewAlert } from "@/lib/alerts/dispatch";
import { getDataProvider } from "@/lib/data";
import { ALLOW_SIMULATED } from "@/lib/alerts/config";
import type { AlertEvent, AlertKind, Channel } from "@/lib/alerts/types";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? "") : null;
};

const KINDS: AlertKind[] = ["arrival", "reexport", "idle", "first_seen"];
const kind = (flag("kind") ?? "arrival") as AlertKind;
const channel = (flag("channel") ?? "telegram") as Channel;

if (!KINDS.includes(kind)) {
  console.error(`--kind must be one of ${KINDS.join(", ")}`);
  process.exit(1);
}
if (channel !== "telegram" && channel !== "x") {
  console.error("--channel must be telegram or x");
  process.exit(1);
}
if (channel === "x" && !argv.includes("--public")) {
  console.error("Refusing. @Taredata is public and every figure here is still");
  console.error("simulated, so this would publish an invented dollar amount");
  console.error("under the brand. Deleting it afterwards does not unpublish it.");
  console.error("");
  console.error("Test on Telegram into a private channel instead. If you have");
  console.error("read scripts/alert-test.mts and still want this, add --public.");
  process.exit(1);
}

const provider = getDataProvider();
const source = provider.source;

if (source === "sim" && !ALLOW_SIMULATED) {
  console.error("The dispatcher will refuse: DATA_SOURCE=sim and");
  console.error("ALERTS_ALLOW_SIMULATED is not true. That is the guard working.");
  console.error("Set ALERTS_ALLOW_SIMULATED=true for this test, and unset it after.");
  process.exit(1);
}

const [entry] = await provider.getEntries({ limit: 1 });
if (!entry) {
  console.error("No entry to build an event from.");
  process.exit(1);
}

// A fresh id each run, or the dedupe would suppress the second attempt and it
// would look like a delivery failure.
const subject = {
  ...entry,
  id: `test-${kind}-${process.pid}-${argv.join("")}`,
  amountUsd: 39_900_000,
  recipient: { ...entry.recipient, firstSeen: kind === "first_seen" },
};

const event: AlertEvent = {
  kind,
  entry: subject,
  movedUsd: kind === "reexport" ? 23_900_000 : 39_900_000,
  detail: kind === "idle" ? "34 minutes" : undefined,
  at: new Date().toISOString(),
};

console.log(`data source   ${source}${source === "sim" ? "  (figures are invented)" : ""}`);
console.log(`kind          ${kind}`);
console.log(`channel       ${channel}`);
console.log("");
console.log("--- exactly what will be sent -------------------------------");
console.log(previewAlert(event, source)[channel]);
console.log("-------------------------------------------------------------");
console.log("");

const result = await dispatchAlert(event, { dataSource: source, only: [channel] });

for (const d of result.delivered) {
  console.log(d.ok ? `SENT  ${d.channel}  id ${d.id ?? "-"}` : `NOT SENT  ${d.channel}  ${d.reason}`);
}

// "below threshold" and "cooling down" are the dispatcher working, not a fault,
// so say which is which rather than leaving a bare exit code to interpret.
const sent = result.delivered.some((d) => d.ok);
if (!sent) {
  console.log("");
  console.log("Nothing went out. If the reason above is 'below threshold' or");
  console.log("'cooling down', that is the dispatcher deciding correctly.");
}
process.exit(sent ? 0 : 1);
