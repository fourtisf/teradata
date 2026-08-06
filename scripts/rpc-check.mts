/**
 * The RPC failover, against real HTTP servers on loopback.
 *
 *   npm run rpc:check
 *
 * No network and no credentials: three local servers stand in for a dead
 * primary, a rate-limited one and a healthy fallback. Failover is exactly the
 * kind of code that is never exercised until the day it matters, so it is
 * exercised here instead.
 */
import { createServer, type Server } from "node:http";
import { RpcError, resetRpcHealth, rpc } from "@/lib/rpc/client";
import { redactUrl, type RpcEndpoint } from "@/lib/rpc/endpoints";

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

/** A stub node. `hits` is what makes "was it even asked" assertable. */
interface Stub {
  server: Server;
  url: string;
  hits: () => number;
}

async function stub(handler: (n: number) => { status: number; body: unknown } | "hang"): Promise<Stub> {
  let hits = 0;
  const server = createServer((req, res) => {
    hits++;
    const answer = handler(hits);
    if (answer === "hang") return; // never responds; the client must time out
    res.writeHead(answer.status, { "content-type": "application/json" });
    res.end(JSON.stringify(answer.body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}`, hits: () => hits };
}

const ok = (value: unknown) => ({ status: 200, body: { jsonrpc: "2.0", id: 1, result: value } });
const rpcError = (code: number, message: string) => ({
  status: 200,
  body: { jsonrpc: "2.0", id: 1, error: { code, message } },
});

const dead = await stub(() => ({ status: 500, body: { error: "boom" } }));
const limited = await stub(() => ({ status: 429, body: { error: "slow down" } }));
const behind = await stub(() => rpcError(-32001, "node is behind by 200 slots"));
const bad = await stub(() => rpcError(-32602, "Invalid params"));
const good = await stub(() => ok(331_000_777));

const endpoint = (name: string, url: string, tier: "primary" | "fallback", complete: boolean): RpcEndpoint =>
  ({ name, url, tier, complete });

/* ------------------------------------------------------------ failover --- */
group("failover");
{
  resetRpcHealth();
  const result = await rpc<number>("getSlot", [], {
    endpoints: [
      endpoint("dead", dead.url, "primary", true),
      endpoint("limited", limited.url, "primary", true),
      endpoint("public", good.url, "fallback", false),
    ],
    timeoutMs: 2000,
  });
  check("a working endpoint answers", result.value === 331_000_777, String(result.value));
  check("and the answer says which one", result.endpoint === "public", result.endpoint);
  check("the failures are reported, in order", result.skipped.join(",") === "dead,limited", result.skipped.join(","));
  check("the answer is marked not complete", !result.complete && result.tier === "fallback");
}

group("a node that is behind is worth another node");
{
  resetRpcHealth();
  const result = await rpc<number>("getSlot", [], {
    endpoints: [endpoint("behind", behind.url, "primary", true), endpoint("good", good.url, "primary", true)],
    timeoutMs: 2000,
  });
  check("it moves on", result.endpoint === "good", result.endpoint);
}

/* ------------------------------------------------ an error is an answer --- */
group("a JSON-RPC error is usually an answer, not a failure");
{
  resetRpcHealth();
  const before = good.hits();
  let threw = false;
  try {
    await rpc("getBlock", [1], {
      endpoints: [endpoint("bad", bad.url, "primary", true), endpoint("good", good.url, "primary", true)],
      timeoutMs: 2000,
    });
  } catch (error) {
    threw = error instanceof RpcError;
    check("the message carries the code", (error as Error).message.includes("-32602"), (error as Error).message);
  }
  check("invalid params throws rather than failing over", threw);
  check(
    "and the next endpoint is never asked",
    good.hits() === before,
    `${good.hits() - before} extra calls — retrying a bad request spends a rate limit for the same answer`,
  );
}

/* ------------------------------------------------------------- breaker --- */
group("a failing endpoint is stood down");
{
  resetRpcHealth();
  const endpoints = [endpoint("dead", dead.url, "primary", true), endpoint("good", good.url, "primary", true)];
  for (let i = 0; i < 3; i++) await rpc("getSlot", [], { endpoints, timeoutMs: 2000 });

  const before = dead.hits();
  const result = await rpc<number>("getSlot", [], { endpoints, timeoutMs: 2000 });
  check("after three failures it is skipped", dead.hits() === before, `${dead.hits() - before} further calls`);
  check("and the good one still answers", result.endpoint === "good");
  check("without being counted as a skip", result.skipped.length === 0, result.skipped.join(","));

  // Not dropped, though: if everything is failing, an endpoint that may have
  // recovered beats refusing outright.
  resetRpcHealth();
}

/* ------------------------------------------------------ completeness ----- */
group("completeness is not negotiable where it matters");
{
  resetRpcHealth();
  let message = "";
  try {
    await rpc("getTransaction", ["sig"], {
      endpoints: [endpoint("public", good.url, "fallback", false)],
      requireComplete: true,
      timeoutMs: 2000,
    });
  } catch (error) {
    message = (error as Error).message;
  }
  check("a fallback-only setup refuses the read", message.includes("complete answer"), message);
  check("and says what to configure", message.includes("HELIUS_API_KEY"), message);

  // The same read is fine when a trusted endpoint exists.
  const result = await rpc<number>("getTransaction", ["sig"], {
    endpoints: [endpoint("helius", good.url, "primary", true), endpoint("public", good.url, "fallback", false)],
    requireComplete: true,
    timeoutMs: 2000,
  });
  check("with a primary configured it goes through", result.endpoint === "helius");
}

/* ------------------------------------------------------- all endpoints --- */
group("everything down");
{
  resetRpcHealth();
  let error: RpcError | null = null;
  try {
    await rpc("getSlot", [], {
      endpoints: [endpoint("dead", dead.url, "primary", true), endpoint("limited", limited.url, "fallback", false)],
      timeoutMs: 2000,
    });
  } catch (e) {
    error = e as RpcError;
  }
  check("it throws rather than returning a zero", error !== null);
  check("naming every endpoint it tried", error?.attempts.length === 2, `${error?.attempts.length}`);
  check("with each reason", error!.message.includes("http 500") && error!.message.includes("http 429"), error?.message);
}

/* ---------------------------------------------------------- redaction ---- */
group("the key never reaches a log");
{
  const url = "https://mainnet.helius-rpc.com/?api-key=abcd-1234-secret";
  check("the api key is redacted", !redactUrl(url).includes("abcd-1234-secret"), redactUrl(url));
  check("and the host survives", redactUrl(url).includes("mainnet.helius-rpc.com"));
}

for (const s of [dead, limited, behind, bad, good]) s.server.close();
console.log(`\n${failed ? `FAIL — ${failed} of ${passed + failed} checks failed` : `All ${passed} checks passed.`}`);
process.exit(failed ? 1 : 0);
