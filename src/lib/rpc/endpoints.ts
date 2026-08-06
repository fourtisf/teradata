/**
 * Where Solana JSON-RPC reads go, and in what order.
 *
 * ## What this is not
 *
 * It is **not** a fallback for the Geyser stream. §2 fixes Helius gRPC because
 * the product promises event-to-alert under ten seconds and polling cannot meet
 * that; a JSON-RPC endpoint standing in for the stream would quietly turn the
 * ingest layer into the polling design §2 refuses. If the stream is down, the
 * honest state is `degraded` on the status page, not a slower path nobody was
 * told about.
 *
 * This is for the other half of the RPC work, the half `.env.example` already
 * describes: gap repair after a stream restart, and pulling a settlement's full
 * transaction. Those are request/response reads where a second endpoint is a
 * genuine improvement, because the alternative is dropping the read.
 *
 * ## Why the tiers are not cosmetic
 *
 * A public endpoint is not a slower Helius. It is rate-limited, it is usually
 * not archival, and `getSignaturesForAddress` on one can return a shorter
 * history than the same call on a paid node. Failing over to a node that
 * returns *less* is worse than failing outright: it produces a figure that
 * looks complete and is not, which is the exact failure §3.1 refuses when it
 * keeps an unmatched arrival rather than guessing an origin.
 *
 * So every answer carries which endpoint produced it and whether that endpoint
 * was a fallback. A caller doing something completeness-sensitive can refuse a
 * degraded answer; a caller reading the head slot does not care.
 */

export type Tier = "primary" | "fallback";

export interface RpcEndpoint {
  /** Short label. Appears in logs and in the provenance on every result. */
  name: string;
  url: string;
  tier: Tier;
  /**
   * Whether this endpoint can be trusted for a complete answer — archival
   * depth, no aggressive truncation. Only paid nodes we have configured
   * deliberately get this; a public endpoint never does.
   */
  complete: boolean;
}

/** The token is in the URL, so this exists to keep it out of logs and errors. */
export function redactUrl(url: string): string {
  return url
    .replace(/([?&](api-key|api_key|apikey)=)[^&#]+/gi, "$1[redacted]")
    .replace(/(\/v\d+\/)[A-Za-z0-9_-]{16,}/g, "$1[redacted]");
}

function helius(): RpcEndpoint | null {
  const explicit = process.env.HELIUS_RPC_URL?.trim();
  if (explicit) return { name: "helius", url: explicit, tier: "primary", complete: true };

  const key = process.env.HELIUS_API_KEY?.trim();
  if (!key) return null;
  return {
    name: "helius",
    url: `https://mainnet.helius-rpc.com/?api-key=${key}`,
    tier: "primary",
    complete: true,
  };
}

/**
 * Extra endpoints, comma-separated, in preference order.
 *
 * These are `primary` and trusted for completeness, because putting a URL here
 * is a deliberate act — it is where a second paid provider goes. Public
 * endpoints belong in `SOLANA_RPC_FALLBACK_URLS` below.
 */
function extraPrimaries(): RpcEndpoint[] {
  return parseList(process.env.SOLANA_RPC_URLS).map((url, i) => ({
    name: `rpc-${i + 1}`,
    url,
    tier: "primary" as const,
    complete: true,
  }));
}

/**
 * The last resort.
 *
 * The default is Solana's own public endpoint, which its documentation says is
 * rate-limited and not intended for production — which is precisely what a last
 * resort is. It is enough to answer "what slot are we on" while a paid provider
 * is down, and it is not enough to build a figure on, which is why nothing here
 * is marked complete.
 */
function fallbacks(): RpcEndpoint[] {
  const configured = parseList(process.env.SOLANA_RPC_FALLBACK_URLS);
  const urls = configured.length ? configured : ["https://api.mainnet-beta.solana.com"];
  return urls.map((url, i) => ({
    name: configured.length ? `fallback-${i + 1}` : "solana-public",
    url,
    tier: "fallback" as const,
    complete: false,
  }));
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Every endpoint, primaries first.
 *
 * Ordered rather than round-robin on purpose. Round-robin spreads load, which
 * is a thing to want when every node is equivalent; here they are not, and
 * spreading reads across a public endpoint that returns short histories would
 * make the completeness problem intermittent instead of visible.
 */
export function rpcEndpoints(): RpcEndpoint[] {
  const primaries = [helius(), ...extraPrimaries()].filter((e): e is RpcEndpoint => e !== null);
  return [...primaries, ...fallbacks()];
}

/** True when nothing but public endpoints are configured. */
export function onlyFallbacksConfigured(): boolean {
  return rpcEndpoints().every((endpoint) => endpoint.tier === "fallback");
}
