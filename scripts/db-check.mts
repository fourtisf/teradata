/**
 * The store's tests, against a real Postgres.
 *
 *   createdb tare_test
 *   POSTGRES_URL=postgres:///tare_test npm run db:check
 *
 * Every rule in `src/lib/db/arrivals.ts` is a rule from the spec that a caller
 * could otherwise break — replay safety, an unpriced arrival never becoming
 * $0, a closed window staying closed. None of them can be checked against a
 * mock, because all of them are enforced in SQL.
 *
 * It applies `deploy/postgres/schema.sql` first, so the schema is checked by
 * being used rather than by being read.
 */
import { readFile } from "node:fs/promises";
import {
  attachOrigin,
  closeWindows,
  indexerFacts,
  markReexport,
  recordArrival,
  recordFirstUse,
  type SettlementInput,
} from "@/lib/db/arrivals";
import { livenessOf, readHeartbeat, stampHeartbeat } from "@/lib/db/indexer";
import { closePool, query, queryOne } from "@/lib/db/pool";

const url = process.env.POSTGRES_URL?.trim();
if (!url) {
  console.error("POSTGRES_URL is not set.");
  console.error("  createdb tare_test && POSTGRES_URL=postgres:///tare_test npm run db:check");
  process.exit(1);
}
// This truncates. A connection string that does not say "test" is one that
// might be production, and the cost of being wrong once is the whole dataset.
if (!/test/i.test(url)) {
  // Without the password. A refusal is exactly when someone screenshots the
  // terminal to ask why, and a connection string carries a credential.
  const shown = url.replace(/\/\/[^@/]*@/, "//[redacted]@");
  console.error(`Refusing: POSTGRES_URL does not look like a test database.\n  ${shown}`);
  process.exit(1);
}

let failed = 0;
let passed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL  ${label}${detail ? `\n      ${detail}` : ""}`);
  }
};
const group = (title: string) => console.log(`\n${title}`);

await query(await readFile("deploy/postgres/schema.sql", "utf8"));
// indexer_state too, and it is the easy one to forget: stampHeartbeat keeps
// the highest slot it has seen, so a leftover row from a previous run makes
// the heartbeat checks fail on the second invocation and pass on the first.
// A suite that only passes against a fresh database is a suite that will lie
// to somebody later.
await query("TRUNCATE arrivals, daily_flows, wallets, entities, indexer_state CASCADE");

const TS = (iso: string) => new Date(iso);
const base = (over: Partial<SettlementInput> = {}): SettlementInput => ({
  confidence: "unattributed",
  bridge: "Wormhole",
  originChain: "Ethereum",
  asset: "USDC",
  amountNative: "1000000",
  amountUsd: "1000000",
  solanaTx: "sig-1",
  solanaSlot: 331_000_001,
  solanaTs: TS("2026-08-04T12:00:00Z"),
  recipient: "Recipient1111111111111111111111111111111111",
  ...over,
});

const usdOf = async (id: string) =>
  (await queryOne<{ amount_usd: string | null; reexported_usd: string; status: string; window_closed: boolean; dwell_ms: string | null; confidence: string; lag_ms: number }>(
    "SELECT amount_usd, reexported_usd, status, window_closed, dwell_ms, confidence, lag_ms FROM arrivals WHERE id = $1",
    [id],
  ))!;

/* ------------------------------------------------------------- replay ---- */
group("replay safety");
{
  const first = await recordArrival(base());
  const again = await recordArrival(base());
  check("a replayed settlement is the same row", first === again);
  const counted = await queryOne<{ n: string }>("SELECT count(*) AS n FROM arrivals");
  check("and does not double-count", counted?.n === "1", `${counted?.n} rows`);

  // A bridge settlement can carry several transfers. Collapsing them on the
  // transaction alone would lose every arrival but the first.
  const second = await recordArrival(base({ instructionIndex: 1, recipient: "Recipient2222222222222222222222222222222222" }));
  check("a second transfer in the same transaction is its own arrival", second !== first);
}

/* -------------------------------------------------------------- price ---- */
group("pricing");
{
  const id = await recordArrival(base({ solanaTx: "sig-unpriced", amountUsd: null }));
  check("an unpriced arrival is stored", Boolean(id));
  check("with a null value, never zero", (await usdOf(id)).amount_usd === null);

  await recordArrival(base({ solanaTx: "sig-unpriced", amountUsd: "500000" }));
  check("a later replay can fill the price in", (await usdOf(id)).amount_usd === "500000.00");

  await recordArrival(base({ solanaTx: "sig-unpriced", amountUsd: null }));
  check("and a replay without one does not blank it", (await usdOf(id)).amount_usd === "500000.00");
}

/* ------------------------------------------------------------- origin ---- */
group("origin matching");
{
  const id = await recordArrival(
    base({ solanaTx: "sig-match", messageId: "vaa-7", solanaTs: TS("2026-08-04T12:00:08Z") }),
  );
  check("it starts unattributed", (await usdOf(id)).confidence === "unattributed");

  const matched = await attachOrigin("Wormhole", "vaa-7", {
    originTx: "0xdeposit",
    originTs: TS("2026-08-04T12:00:00Z"),
  });
  check("a late deposit finds it", matched);
  const row = await usdOf(id);
  check("and promotes it", row.confidence === "matched");
  check("with the lag measured, not guessed", row.lag_ms === 8000, `${row.lag_ms}ms`);

  check(
    "a deposit for an arrival we do not have matches nothing",
    !(await attachOrigin("Wormhole", "vaa-unknown", { originTx: "0x", originTs: TS("2026-08-04T12:00:00Z") })),
  );
  check(
    "and a second deposit cannot re-match a matched row",
    !(await attachOrigin("Wormhole", "vaa-7", { originTx: "0xother", originTs: TS("2026-08-04T11:00:00Z") })),
  );
}

/* ---------------------------------------------------------- re-export ---- */
group("re-export, proportionally");
{
  const id = await recordArrival(base({ solanaTx: "sig-exit", amountUsd: "1000000" }));

  check("60% leaving is recorded", await markReexport(id, "600000", TS("2026-08-04T16:00:00Z")));
  let row = await usdOf(id);
  check("the amount accumulates", row.reexported_usd === "600000.00", row.reexported_usd);
  check("and the arrival is still held", row.status === "held", row.status);

  check("the rest leaving is recorded too", await markReexport(id, "400000", TS("2026-08-04T18:00:00Z")));
  row = await usdOf(id);
  check("only then is it a re-export", row.status === "reexported", row.status);
  check("and it cannot exceed what arrived", row.reexported_usd === "1000000.00", row.reexported_usd);

  await markReexport(id, "500000", TS("2026-08-04T19:00:00Z"));
  check("a further exit still cannot", (await usdOf(id)).reexported_usd === "1000000.00");
}

/* ---------------------------------------------------------- first use ---- */
group("first use");
{
  const id = await recordArrival(base({ solanaTx: "sig-use", solanaTs: TS("2026-08-04T12:00:00Z") }));
  check(
    "the first meaningful action is recorded",
    await recordFirstUse(id, { category: "spot_swap", program: "Jupiter", at: TS("2026-08-04T12:34:00Z") }),
  );
  const row = await usdOf(id);
  check("dwell is the time to it", row.dwell_ms === "2040000", String(row.dwell_ms));
  check("and the arrival is deployed", row.status === "deployed", row.status);
  check(
    "a second action is not the first one",
    !(await recordFirstUse(id, { category: "lending", program: "Kamino", at: TS("2026-08-04T13:00:00Z") })),
  );
}

/* ------------------------------------------------------------- window ---- */
group("the window closes permanently");
{
  const id = await recordArrival(base({ solanaTx: "sig-old", solanaTs: TS("2026-08-01T09:00:00Z") }));
  const days = await closeWindows(TS("2026-08-03T00:00:00Z"));
  check("closing reports the days it touched", days.includes("2026-08-01"), days.join(","));
  check("the row is closed", (await usdOf(id)).window_closed);
  check(
    "and a late exit cannot rewrite a published day",
    !(await markReexport(id, "1000", TS("2026-08-05T00:00:00Z"))),
  );
  check(
    "nor a late first use",
    !(await recordFirstUse(id, { category: "staking", program: "Jito", at: TS("2026-08-05T00:00:00Z") })),
  );
}

/* ------------------------------------------------------------ indexer ---- */
group("indexer facts");
{
  await query("TRUNCATE arrivals CASCADE");
  // Two matched with known lags, one unattributed carrying value, one unpriced.
  await recordArrival(base({ solanaTx: "f1", confidence: "matched", lagMs: 4000, amountUsd: "1000000", solanaSlot: 10 }));
  await recordArrival(base({ solanaTx: "f2", confidence: "matched", lagMs: 12000, amountUsd: "1000000", solanaSlot: 20 }));
  await recordArrival(base({ solanaTx: "f3", confidence: "unattributed", lagMs: 0, amountUsd: "500000", solanaSlot: 30 }));
  await recordArrival(base({ solanaTx: "f4", confidence: "unattributed", lagMs: 0, amountUsd: null, solanaSlot: 40 }));

  const facts = await indexerFacts(TS("2026-08-01T00:00:00Z"));
  check("the last slot is the highest seen", facts.lastSlot === 40, `${facts.lastSlot}`);
  check("the median lag is over matched arrivals only", facts.medianLagMs === 8000, `${facts.medianLagMs}`);
  // 500k unattributed of 2.5M priced. The unpriced row is excluded rather than
  // counted as zero, which would have made the share look smaller.
  check("the unattributed share is by value", Math.abs(facts.unattributedShare - 0.2) < 1e-9, `${facts.unattributedShare}`);
  check("every arrival is counted", facts.entryCount === 4, `${facts.entryCount}`);
  check("updated is the newest settlement", facts.updatedAt === "2026-08-04T12:00:00.000Z", String(facts.updatedAt));
}

/* ---------------------------------------------------------- heartbeat ---- */
group("liveness is not the same question as activity");
{
  check("no heartbeat at all is down, not live", livenessOf(null, Date.now()) === "down");

  await stampHeartbeat(331_000_500, TS("2026-08-04T12:00:00Z"));
  const beat = await readHeartbeat();
  check("the heartbeat is stored", beat?.lastSlot === 331_000_500, `${beat?.lastSlot}`);
  check("with the chain's own clock for the slot", beat?.slotTs === "2026-08-04T12:00:00.000Z");

  // A replay catching up must not walk the reported head backwards.
  await stampHeartbeat(331_000_400, TS("2026-08-04T11:59:00Z"));
  check("a replayed slot does not move the head back", (await readHeartbeat())?.lastSlot === 331_000_500);

  const at = Date.parse((await readHeartbeat())!.updatedAt!);
  check("a fresh heartbeat is live", livenessOf(await readHeartbeat(), at + 5_000) === "live");
  check("half a minute of silence is degraded", livenessOf(await readHeartbeat(), at + 45_000) === "degraded");
  check("five minutes is down", livenessOf(await readHeartbeat(), at + 6 * 60_000) === "down");

  // The distinction the table exists for: nothing has arrived for hours, and
  // the indexer is still healthy because it is still processing slots.
  await query("TRUNCATE arrivals CASCADE");
  await stampHeartbeat(331_002_000, TS("2026-08-04T18:00:00Z"));
  const quiet = await readHeartbeat();
  check(
    "a quiet chain with a beating indexer is live",
    livenessOf(quiet, Date.parse(quiet!.updatedAt!) + 1_000) === "live",
  );
}

await closePool();
console.log(`\n${failed ? `FAIL — ${failed} of ${passed + failed} checks failed` : `All ${passed} checks passed.`}`);
process.exit(failed ? 1 : 0);
