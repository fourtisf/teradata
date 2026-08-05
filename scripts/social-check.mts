/**
 * The scheduler's tests.
 *
 *   npm run social:check
 *
 * There is no test runner in this repo, and adding one for six modules would be
 * more machinery than the thing it tests. What matters here is not covered by
 * reading the code anyway: a scheduler is wrong in ways that only show up after
 * it has been left alone for a month, so this drives ninety days of ticks
 * through the real functions and asserts the shape of what comes out.
 *
 * `social-preview.mts` reads the copy; this one checks the clock, the ledger,
 * the budget and the guard.
 */
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capFor, checkBudget } from "@/lib/social/budget";
import { FileLedger, memoryLedger } from "@/lib/social/ledger";
import { buildPost, runDue } from "@/lib/social/runner";
import { getPosterState } from "@/lib/social/state";
import {
  dueOccurrences,
  mostRecentDue,
  occurrenceKey,
  settledDate,
  settledWeek,
} from "@/lib/social/schedule";
import { dayStartMs, utcDate, utcWeekday } from "@/lib/social/time";
import { SimProvider } from "@/lib/data/sim";
import {
  ALLOW_SIMULATED,
  X_MONTHLY_BUDGET,
  X_SAFETY_MARGIN,
  X_SCHEDULED_RESERVE,
} from "@/lib/alerts/config";
import type { JobSpec } from "@/lib/social/types";

const HOUR = 3_600_000;
const DAY = 86_400_000;

let failed = 0;
let passed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    return;
  }
  failed++;
  console.error(`FAIL  ${label}${detail ? `\n      ${detail}` : ""}`);
}

function group(title: string) {
  console.log(`\n${title}`);
}

const DAILY: JobSpec = { kind: "daily", atMinuteUtc: 5, weekday: null, maxLatenessMs: 12 * HOUR };
const MONDAY: JobSpec = { kind: "weekly", atMinuteUtc: 20, weekday: 1, maxLatenessMs: 24 * HOUR };
const SPECS = [DAILY, MONDAY];

/* -------------------------------------------------------------------------
 * The settled date. The whole reason the daily post is not about yesterday.
 * ---------------------------------------------------------------------- */
group("settled date");
{
  const now = Date.parse("2026-08-07T00:05:00Z");
  check("at 00:05 on the 7th, the settled day is the 5th", settledDate(now, 24) === "2026-08-05", settledDate(now, 24));

  // The invariant behind it: every arrival the day could contain has been
  // watched for the full window, and the following day has not.
  const settled = settledDate(now, 24);
  const closes = (date: string) => dayStartMs(date) + DAY + 24 * HOUR;
  check("the settled day's last window has closed", closes(settled) <= now);
  check("the next day's has not", closes(utcDate(dayStartMs(settled) + DAY)) > now);

  // §11 may retune the window; the settled date has to follow it. Read at
  // midday, where the windows differ — at 00:05 a 12h and a 24h window both
  // land on the 5th, because the day before has only had twelve of its hours.
  const midday = Date.parse("2026-08-07T13:00:00Z");
  check("a 12h window settles a day sooner", settledDate(midday, 12) === "2026-08-06", settledDate(midday, 12));
  check("the 24h window does not, at the same instant", settledDate(midday, 24) === "2026-08-05", settledDate(midday, 24));
  check("a 48h window settles a day later", settledDate(now, 48) === "2026-08-04", settledDate(now, 48));

  const week = settledWeek(now, 24);
  check("the week is seven days", week.length === 7);
  check("the week ends on the settled day", week[6] === settled);
  check("the week starts six days earlier", week[0] === "2026-07-30", String(week[0]));
}

/* -------------------------------------------------------------------------
 * The clock.
 * ---------------------------------------------------------------------- */
group("occurrences");
{
  const day = "2026-08-07";
  const at = (time: string) => Date.parse(`${day}T${time}Z`);

  check(
    "one second before the minute, the current occurrence is yesterday's",
    utcDate(mostRecentDue(DAILY, at("00:04:59"))!) === "2026-08-06",
  );
  check(
    "on the minute, it is today's",
    utcDate(mostRecentDue(DAILY, at("00:05:00"))!) === day,
  );
  check("the key names the firing, not the subject", occurrenceKey(DAILY, at("00:05:00")) === "daily:2026-08-07");

  check("still due eleven hours late", dueOccurrences(at("11:05:00"), [DAILY]).length === 1);
  check("no longer due thirteen hours late", dueOccurrences(at("13:05:00"), [DAILY]).length === 0);

  // Bounded catch-up: three days of downtime is not three posts.
  const after = dueOccurrences(Date.parse("2026-08-07T00:06:00Z"), SPECS);
  check("a restart yields at most one occurrence per job", after.length <= SPECS.length);
  check("and it is today's daily", after.some((o) => o.key === "daily:2026-08-07"));

  const monday = Date.parse("2026-08-03T00:20:00Z");
  check("the weekly fires on a Monday", utcWeekday(monday) === 1);
  check("the weekly is due on Monday", dueOccurrences(monday, [MONDAY]).length === 1);
  check(
    "the weekly is not due on Wednesday",
    dueOccurrences(Date.parse("2026-08-05T00:20:00Z"), [MONDAY]).length === 0,
  );
}

/* -------------------------------------------------------------------------
 * Ninety days of ticks. Every ten minutes, which is 12,960 samples — enough to
 * catch a schedule that fires twice or skips a month boundary.
 * ---------------------------------------------------------------------- */
group("ninety days of ticks");
{
  const start = Date.parse("2026-06-01T00:00:00Z");
  const dailyKeys = new Set<string>();
  const weeklyKeys = new Set<string>();
  let dailyTicks = 0;

  for (let t = start; t < start + 90 * DAY; t += 10 * 60_000) {
    for (const occurrence of dueOccurrences(t, SPECS)) {
      if (occurrence.spec.kind === "daily") {
        dailyKeys.add(occurrence.key);
        dailyTicks++;
      } else {
        weeklyKeys.add(occurrence.key);
      }
    }
  }

  check("exactly one daily occurrence per day", dailyKeys.size === 90, `${dailyKeys.size} distinct keys`);
  // Due at 00:05, still due at 12:05, and the samples land on the ten — so
  // 00:10 through 12:00, seventy-two of them, every day and no more.
  check("each stays due for its twelve hours", dailyTicks === 90 * 72, `${dailyTicks} ticks`);
  check("twelve or thirteen weekly occurrences in ninety days", weeklyKeys.size === 12 || weeklyKeys.size === 13, `${weeklyKeys.size}`);
  check(
    "every weekly key is a Monday",
    [...weeklyKeys].every((key) => utcWeekday(dayStartMs(key.slice("weekly:".length))) === 1),
  );
}

/* -------------------------------------------------------------------------
 * The ledger.
 * ---------------------------------------------------------------------- */
group("ledger");
{
  const ledger = memoryLedger();
  const at = Date.parse("2026-08-07T00:05:00Z");

  check("nothing is recorded to begin with", !(await ledger.has("daily:2026-08-07", "telegram", at)));

  await ledger.record({ key: "daily:2026-08-07", channel: "telegram", purpose: "scheduled", ok: true, at: new Date(at).toISOString() });
  check("a success dedupes", await ledger.has("daily:2026-08-07", "telegram", at));
  check("on that channel only", !(await ledger.has("daily:2026-08-07", "x", at)));

  await ledger.record({ key: "daily:2026-08-07", channel: "x", purpose: "scheduled", ok: false, reason: "http 503", at: new Date(at).toISOString() });
  check("a failure does not dedupe", !(await ledger.has("daily:2026-08-07", "x", at)));
  check("but it counts as an attempt", (await ledger.attempts("daily:2026-08-07", "x", at)) === 1);

  check("a failure does not spend the budget", (await ledger.countMonth("x", at)) === 0);
  await ledger.record({ key: "alert:arrival:1", channel: "x", purpose: "alert", ok: true, at: new Date(at).toISOString() });
  check("a success does", (await ledger.countMonth("x", at)) === 1);
  check(
    "and the count is per calendar month",
    (await ledger.countMonth("x", Date.parse("2026-09-01T00:00:00Z"))) === 0,
  );
}

/* -------------------------------------------------------------------------
 * The file-backed ledger, against a real directory.
 *
 * `memoryLedger` above cannot catch the failure this group exists for: the
 * file implementation shards by UTC month, so a write and the dedupe read that
 * follows it have to agree on which month they are in. When they did not, the
 * read looked in the wrong file, found nothing, and the recap went out twice.
 * ---------------------------------------------------------------------- */
group("file ledger");
{
  const dir = await mkdtemp(join(tmpdir(), "tare-ledger-"));
  const ledger = new FileLedger(dir);
  const august = Date.parse("2026-08-20T00:05:00Z");
  const september = Date.parse("2026-09-01T00:05:00Z");

  await ledger.record({ key: "daily:2026-08-20", channel: "x", purpose: "scheduled", ok: true, at: new Date(august).toISOString() });
  check("a record survives a round trip to disk", await ledger.has("daily:2026-08-20", "x", august));
  check("and is not confused with another channel", !(await ledger.has("daily:2026-08-20", "telegram", august)));

  // The first of the month, reading back a post written on the last day of the
  // one before. This is the case the sharding has to get right.
  await ledger.record({ key: "daily:2026-09-01", channel: "x", purpose: "scheduled", ok: true, at: new Date(september).toISOString() });
  check("a post written this month is found this month", await ledger.has("daily:2026-09-01", "x", september));
  check("and last month's is still visible from the 1st", await ledger.has("daily:2026-08-20", "x", september));

  check("the budget counts August's alone", (await ledger.countMonth("x", august)) === 1);
  check("and September's alone", (await ledger.countMonth("x", september)) === 1);
  check("two month files were written", (await readdir(dir)).sort().join(",") === "posts-2026-08.ndjson,posts-2026-09.ndjson", (await readdir(dir)).join(","));

  await rm(dir, { recursive: true, force: true });
}

/* -------------------------------------------------------------------------
 * What the status page says the poster has done.
 *
 * The figures on a public page have to be the ones the ledger actually holds,
 * and the two easy ways to get this wrong are both asserted here: reporting a
 * firing date where a reader expects the period it covered, and counting a
 * failed post as a published one.
 * ---------------------------------------------------------------------- */
group("poster state");
{
  const dir = await mkdtemp(join(tmpdir(), "tare-state-"));
  const ledger = new FileLedger(dir);
  const now = Date.parse("2026-08-05T16:00:00Z");
  const line = (key: string, channel: "telegram" | "x", ok: boolean, at: string) =>
    ledger.record({ key, channel, purpose: "scheduled", ok, at });

  // A daily that fired at 00:05 on the 5th covers the 3rd, and reached only
  // Telegram: X was attempted and returned 503.
  await line("daily:2026-08-05", "telegram", true, "2026-08-05T00:05:03.000Z");
  await line("daily:2026-08-05", "x", false, "2026-08-05T00:05:05.000Z");
  await line("daily:2026-08-04", "x", true, "2026-08-04T00:05:06.000Z");
  await line("weekly:2026-08-03", "telegram", true, "2026-08-03T00:20:03.000Z");

  const state = await getPosterState(now, ledger);
  check("the ledger is readable", state.available);
  check("the last daily is the newest firing", state.lastDaily?.at === "2026-08-05T00:05:03.000Z");
  check(
    "reported as the day it covered, not the day it fired",
    state.lastDaily?.from === "2026-08-03" && state.lastDaily?.to === "2026-08-03",
    `${state.lastDaily?.from}..${state.lastDaily?.to}`,
  );
  check(
    "a channel that failed is not claimed",
    state.lastDaily?.channels.join(",") === "telegram",
    state.lastDaily?.channels.join(","),
  );
  check(
    "the weekly covers seven settled days",
    state.lastWeekly?.from === "2026-07-26" && state.lastWeekly?.to === "2026-08-01",
    `${state.lastWeekly?.from}..${state.lastWeekly?.to}`,
  );
  check("only successful X posts are counted", state.xUsedThisMonth === 1, `${state.xUsedThisMonth}`);
  check("the cap shown is the scheduled one", state.xCap === capFor("scheduled"));
  check("the next firings are soonest first", state.next.length > 0 && state.next.every((e, i, all) => i === 0 || all[i - 1]!.atMs <= e.atMs));
  check("and every one is in the future", state.next.every((e) => e.atMs > now));

  // The distinction the page depends on: a ledger that cannot be read is not
  // the same claim as a ledger that is empty.
  const absent = await getPosterState(now, new FileLedger(join(dir, "does-not-exist")));
  check("an unreadable ledger reports unavailable", !absent.available);
  check("rather than nothing published", absent.lastDaily === null && absent.xUsedThisMonth === 0);
  check("and the schedule is still answered", absent.next.length === state.next.length);

  await rm(dir, { recursive: true, force: true });
}

/* -------------------------------------------------------------------------
 * The X budget. The number that decides what gets published if nothing
 * enforces it.
 * ---------------------------------------------------------------------- */
group("x budget");
{
  const usable = X_MONTHLY_BUDGET - X_SAFETY_MARGIN;
  check("scheduled posts may reach the safety margin", capFor("scheduled") === usable, `${capFor("scheduled")}`);
  check("alerts stop a reserve short of it", capFor("alert") === usable - X_SCHEDULED_RESERVE, `${capFor("alert")}`);
  check("the reserve covers a month of recaps", X_SCHEDULED_RESERVE >= 31 + 5);

  const at = Date.parse("2026-08-20T12:00:00Z");
  const spent = (n: number) => ({
    async has() {
      return false;
    },
    async attempts() {
      return 0;
    },
    async countMonth() {
      return n;
    },
    async record() {},
  });

  check("telegram is never capped", (await checkBudget(spent(9_999), "telegram", "alert", at)).ok);
  check("alerts pass below the alert cap", (await checkBudget(spent(capFor("alert") - 1), "x", "alert", at)).ok);
  check("alerts stop at it", !(await checkBudget(spent(capFor("alert")), "x", "alert", at)).ok);
  check(
    "scheduled posts still pass there",
    (await checkBudget(spent(capFor("alert")), "x", "scheduled", at)).ok,
    "the reserve is what this is for",
  );
  check("and stop at the margin", !(await checkBudget(spent(capFor("scheduled")), "x", "scheduled", at)).ok);
}

/* -------------------------------------------------------------------------
 * Composition, against the provider the site uses.
 * ---------------------------------------------------------------------- */
group("composition");
{
  const now = Date.parse("2026-08-07T00:05:00Z");
  const provider = new SimProvider({ now: () => now });
  const seen = new Map<string, number>();
  let checked = 0;

  for (let i = 0; i < 21; i++) {
    const at = now - i * DAY;
    const occurrence = dueOccurrences(at, [DAILY])[0];
    if (!occurrence) continue;
    const post = await buildPost(new SimProvider({ now: () => at }), occurrence, at);
    if (!post) continue;
    checked++;
    const [body = "", link = ""] = post.x.split("\n");
    check(`${occurrence.key} fits X`, body.length + 1 + (link ? 23 : 0) <= 280, `${body.length} chars of body`);
    check(`${occurrence.key} fits a caption`, post.telegram.length <= 1024);
    check(`${occurrence.key} links to the day it describes`, post.link.endsWith(`/day/${settledDate(at)}`), post.link);
    check(`${occurrence.key} names no firm`, !/\b(Jump|Wintermute|Alameda|whale|smart money)\b/i.test(post.telegram + post.x));
    seen.set(post.telegram.split("\n")[0]!, (seen.get(post.telegram.split("\n")[0]!) ?? 0) + 1);
  }

  check("three weeks of posts were composed", checked === 21, `${checked}`);
  // Not a strict requirement — the same header twice in three weeks is fine.
  // Every day identical is the failure the variants exist to prevent.
  check("the copy varies", seen.size >= 3, `${seen.size} distinct headers in ${checked} posts`);

  const weekly = await buildPost(provider, dueOccurrences(Date.parse("2026-08-03T00:20:00Z"), [MONDAY])[0]!, Date.parse("2026-08-03T00:20:00Z"));
  check("the weekly composes", weekly !== null);
  check("and carries no card", weekly?.cardDate === null);
}

/* -------------------------------------------------------------------------
 * The guard. The one that has to hold whatever else is wrong.
 * ---------------------------------------------------------------------- */
/**
 * `ALERTS_ALLOW_SIMULATED` is read at module load, so this script cannot move
 * it — which turns out to be the right shape anyway. Each setting has its own
 * thing to prove, and running the script both ways checks both halves:
 *
 *   npm run social:check                             the blanket refusal
 *   ALERTS_ALLOW_SIMULATED=true npm run social:check  X still held back
 */
group(ALLOW_SIMULATED ? "simulated-data guard, hatch open" : "simulated-data guard");
{
  const now = Date.parse("2026-08-03T00:20:30Z");
  const run = (extra: Parameters<typeof runDue>[0] = {}) =>
    runDue({
      provider: new SimProvider({ now: () => now }),
      ledger: memoryLedger(),
      now,
      specs: SPECS,
      ...extra,
    });

  const outcomes = await run();
  check("the guard produced outcomes", outcomes.length > 0);
  check("nothing was delivered", outcomes.every((o) => !o.ok));

  if (!ALLOW_SIMULATED) {
    check(
      "and every channel is refused for the simulated figures",
      outcomes.every((o) => o.reason?.startsWith("refused: figures are simulated")),
      outcomes.map((o) => o.reason).join(" | "),
    );
  } else {
    // The hatch was written for a private Telegram channel. X does not have
    // one, so opening it must not open both.
    const x = outcomes.filter((o) => o.channel === "x");
    const telegram = outcomes.filter((o) => o.channel === "telegram");
    check("X is held back for being public", x.length > 0 && x.every((o) => o.reason?.includes("X is public")), x.map((o) => o.reason).join(" | "));
    check(
      "Telegram is not held back for that reason",
      telegram.every((o) => !o.reason?.includes("X is public")),
      telegram.map((o) => o.reason).join(" | "),
    );

    // And --public is what lifts it — the flag a person types after reading
    // why. Past the refusal it stops at credentials, which is far enough.
    const forced = await run({ allowSimulatedPublic: true });
    const forcedX = forced.filter((o) => o.channel === "x");
    check(
      "--public gets X past the refusal",
      forcedX.length > 0 && forcedX.every((o) => !o.reason?.includes("X is public")),
      forcedX.map((o) => o.reason).join(" | "),
    );
  }
}

console.log(
  `\n${failed ? `FAIL — ${failed} of ${passed + failed} checks failed` : `All ${passed} checks passed.`}`,
);
process.exit(failed ? 1 : 0);
