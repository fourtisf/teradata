/**
 * The scheduled poster.
 *
 *   npm run social                 # the long-running worker, what PM2 starts
 *   npm run social -- --once       # one tick and exit, for a system cron
 *   npm run social -- --dry-run    # compose and decide, send nothing
 *   npm run social -- --channel telegram
 *   npm run social -- --once --dry-run --at 2026-08-07T00:06:00Z
 *
 * `--at` moves the clock the scheduler reads, so "what would go out at the next
 * firing" can be answered on the box without waiting for midnight. It does not
 * move the provider's clock, so keep it near the present.
 *
 * All it does is look at the clock every minute and ask `runDue` whether a post
 * is owed. Every decision — the simulated-data guard, the dedupe, the X budget,
 * the attempt cap — is in `src/lib/social/`, so this file stays small enough
 * that nothing important can hide in it.
 *
 * ## What it publishes
 *
 * A recap of the most recent day whose §3.3 windows have all closed, daily, and
 * a recap of the seven settled days before it, weekly. Not yesterday: see the
 * header of `src/lib/social/schedule.ts` for why a post cannot carry a figure
 * that is still going to move.
 *
 * ## What stops it
 *
 * `DATA_SOURCE=sim` refuses everything before it formats anything. That is the
 * expected state today and the log says so on every tick that would have
 * posted.
 *
 * `ALERTS_ALLOW_SIMULATED=true` lifts that for testing, and lifts it for
 * Telegram only. There is no private tweet: @TareData_ is public, so a test
 * post is public, and an invented dollar amount published under the brand is
 * the damage §1 says cannot be undone by fixing the data afterwards. Deleting
 * it does not unpublish it.
 *
 * `--public` overrides that, and exists so the flag is typed by someone who has
 * read this paragraph. It does nothing once the figures are real.
 */
import { getDataProvider } from "@/lib/data";
import { ALLOW_SIMULATED } from "@/lib/alerts/config";
import { telegramConfigured } from "@/lib/alerts/telegram";
import { xConfigured } from "@/lib/alerts/x";
import { capFor } from "@/lib/social/budget";
import {
  CARD_ENABLED,
  ENABLED_CHANNELS,
  ENABLED_JOBS,
  REEXPORT_WINDOW_HOURS,
  TICK_MS,
} from "@/lib/social/config";
import { LEDGER_DIR, getLedger } from "@/lib/social/ledger";
import { runDue } from "@/lib/social/runner";
import { activeSpecs, mostRecentDue, settledDate } from "@/lib/social/schedule";
import type { Channel } from "@/lib/social/types";

const argv = process.argv.slice(2);
const has = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const channel = value("channel");
if (channel && channel !== "telegram" && channel !== "x") {
  console.error("--channel must be telegram or x");
  process.exit(1);
}
const only = channel ? ([channel] as Channel[]) : undefined;
const dryRun = has("dry-run");
const once = has("once");
const allowSimulatedPublic = has("public");

const atFlag = value("at");
const at = atFlag ? Date.parse(atFlag) : null;
if (atFlag && !Number.isFinite(at)) {
  console.error(`--at must be an ISO 8601 instant, got "${atFlag}"`);
  process.exit(1);
}
/** The clock the scheduler reads. Real time unless --at moved it. */
const clock = () => (at !== null ? at : Date.now());

const provider = getDataProvider();
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (line: string) => console.log(`${stamp()}  ${line}`);

/* ---------------------------------------------------------------------------
 * What this process is about to do, said once at startup.
 *
 * An unattended worker whose first output is silence is indistinguishable from
 * one that failed to start, so it states its configuration and the answer it
 * would give right now.
 * ------------------------------------------------------------------------ */
log(`tare social poster`);
log(`  data source     ${provider.source}${provider.source === "sim" ? "  (figures are invented)" : ""}`);
log(`  jobs            ${ENABLED_JOBS.join(", ")}`);
log(`  channels        ${(only ?? ENABLED_CHANNELS).join(", ")}`);
log(`  telegram        ${telegramConfigured() ? "configured" : "not configured"}`);
log(`  x               ${xConfigured() ? "configured" : "not configured"}  (scheduled cap ${capFor("scheduled")}/month)`);
log(`  card image      ${CARD_ENABLED ? "on" : "off"}`);
log(`  ledger          ${LEDGER_DIR}`);
log(`  watch window    ${REEXPORT_WINDOW_HOURS}h — today's post covers ${settledDate(clock())}`);
log(`  tick            ${Math.round(TICK_MS / 1000)}s${dryRun ? "  (dry run)" : ""}`);
if (at !== null) log(`  clock           pinned to ${new Date(at).toISOString()}`);

if (provider.source === "sim" && !ALLOW_SIMULATED) {
  log("");
  log("  Nothing will be published: DATA_SOURCE=sim and ALERTS_ALLOW_SIMULATED");
  log("  is not true. That is the guard, not a fault. The process stays up so");
  log("  the schedule can be watched — set DATA_SOURCE=live when P1 lands.");
} else if (provider.source === "sim" && !allowSimulatedPublic) {
  log("");
  log("  Telegram only: the figures are simulated and X is public. Point");
  log("  TELEGRAM_CHAT_ID at a private channel first. --public overrides this");
  log("  and publishes an invented dollar amount under the brand.");
} else if (provider.source === "sim") {
  log("");
  log("  --public with simulated figures. Every message carries [SIMULATED],");
  log("  and a screenshot does not. This will be visible on the timeline.");
}

for (const spec of activeSpecs()) {
  const due = mostRecentDue(spec, clock());
  if (due !== null) log(`  last ${spec.kind} occurrence was due ${new Date(due).toISOString()}`);
}

const ledger = getLedger();
for (const c of only ?? ENABLED_CHANNELS) {
  if (c === "x") log(`  x posts this month  ${await ledger.countMonth("x", clock())}`);
}

/* ------------------------------------------------------------------------ */

async function tick() {
  try {
    const outcomes = await runDue({ dryRun, only, allowSimulatedPublic, now: clock() });
    // Silence is the normal state — most ticks have nothing due — so it is only
    // worth a line on a one-shot run, where it is the difference between "no
    // post is owed" and "the process did not get that far".
    if (!outcomes.length && once) log("nothing due");
    for (const o of outcomes) {
      // "already posted" is the steady state — it is the answer on every tick
      // for twelve hours after a successful daily — so it is not worth a line.
      if (!o.ok && o.reason === "already posted") continue;
      log(o.ok ? `SENT  ${o.kind}  ${o.channel}  id ${o.id ?? "-"}` : `skip  ${o.kind}  ${o.channel}  ${o.reason}`);
    }
  } catch (error) {
    // A thrown tick must not take the process with it: the next occurrence is
    // hours away and PM2 restarting into the same fault would just loop.
    log(`ERROR  ${(error as Error).stack ?? (error as Error).message}`);
  }
}

if (once) {
  await tick();
  process.exit(0);
}

log("");
log("watching the clock. ctrl-c to stop.");

const timer = setInterval(tick, TICK_MS);
await tick();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    log(`${signal} — stopping.`);
    process.exit(0);
  });
}
