/**
 * The Solana JSON-RPC client, with ordered failover.
 *
 * One call tries each endpoint in turn until one answers, skipping any that is
 * currently failing. Three decisions in here are worth more than the code:
 *
 * **A JSON-RPC error is usually an answer, not a failure.** "Invalid params" or
 * "block not available" means the next endpoint will say the same thing, so
 * retrying is a slower way to get the same result and it spends a rate limit
 * doing it. Only the codes that mean *this node in particular cannot help* —
 * node behind, slot skipped, request timed out — move on to the next endpoint.
 *
 * **A failing endpoint is skipped, not retried into the ground.** Without a
 * breaker, every call pays a full timeout against a dead primary before
 * reaching a working fallback, so an outage at the provider turns into latency
 * everywhere rather than a clean switch.
 *
 * **Every answer says where it came from.** `endpoints.ts` explains why: a
 * public node can return a shorter history than a paid one, and a caller doing
 * something completeness-sensitive has to be able to refuse an answer that
 * arrived from one. Provenance is not decoration on this project.
 */

import { redactUrl, rpcEndpoints, type RpcEndpoint, type Tier } from "@/lib/rpc/endpoints";

export interface RpcResult<T> {
  value: T;
  /** Which endpoint answered. */
  endpoint: string;
  tier: Tier;
  /** Whether that endpoint is trusted for a complete answer. */
  complete: boolean;
  /** Endpoints that failed before this one did answer, in order. */
  skipped: string[];
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly attempts: Array<{ endpoint: string; reason: string }>,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

/**
 * Codes where another node is worth trying.
 *
 * -32001 node is behind, -32004 block not available *for this node*,
 * -32005 node is unhealthy / rate limited, -32014 block cleaned up.
 * Everything else — bad params, unsupported method — is the answer.
 */
const RETRYABLE_RPC_CODES = new Set([-32001, -32004, -32005, -32014]);

const DEFAULT_TIMEOUT_MS = Number(process.env.SOLANA_RPC_TIMEOUT_MS) || 8_000;
/** Consecutive failures before an endpoint is stood down. */
const BREAKER_THRESHOLD = Number(process.env.SOLANA_RPC_BREAKER_FAILURES) || 3;
/** How long it stays stood down. Long enough to matter, short enough to recover. */
const BREAKER_COOLDOWN_MS = Number(process.env.SOLANA_RPC_BREAKER_COOLDOWN_MS) || 30_000;

interface Health {
  failures: number;
  openUntil: number;
}

const health = new Map<string, Health>();

function isOpen(url: string, now: number): boolean {
  const state = health.get(url);
  return Boolean(state && state.openUntil > now);
}

function recordFailure(url: string, now: number): void {
  const state = health.get(url) ?? { failures: 0, openUntil: 0 };
  state.failures += 1;
  if (state.failures >= BREAKER_THRESHOLD) {
    state.openUntil = now + BREAKER_COOLDOWN_MS;
    state.failures = 0;
  }
  health.set(url, state);
}

function recordSuccess(url: string): void {
  health.delete(url);
}

interface Attempt {
  ok: boolean;
  value?: unknown;
  reason?: string;
  /** False means the answer is final and no other endpoint should be tried. */
  retryable: boolean;
}

async function callOne(
  endpoint: RpcEndpoint,
  method: string,
  params: readonly unknown[],
  timeoutMs: number,
): Promise<Attempt> {
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      // 429 and 5xx are this node's problem; a 4xx that is not 429 is ours and
      // will be the same everywhere.
      const retryable = response.status === 429 || response.status >= 500;
      return { ok: false, reason: `http ${response.status}`, retryable };
    }

    const body = (await response.json()) as {
      result?: unknown;
      error?: { code?: number; message?: string };
    };

    if (body.error) {
      const code = body.error.code ?? 0;
      return {
        ok: false,
        reason: `rpc ${code}: ${body.error.message ?? "no message"}`,
        retryable: RETRYABLE_RPC_CODES.has(code),
      };
    }
    return { ok: true, value: body.result, retryable: false };
  } catch (error) {
    // Network failure, DNS, timeout, malformed JSON. All worth another node,
    // and the message is redacted because the API key is in the URL.
    return { ok: false, reason: redactUrl((error as Error).message), retryable: true };
  }
}

export interface RpcOptions {
  timeoutMs?: number;
  /**
   * Refuse to answer from an endpoint that is not trusted for completeness.
   *
   * For a read whose whole point is "did we see everything" — a signature
   * history, a gap repair — a short answer from a public node is worse than no
   * answer, because it looks like the full one. Set this there.
   */
  requireComplete?: boolean;
  /** Injected by the check script. */
  endpoints?: RpcEndpoint[];
  now?: () => number;
}

export async function rpc<T>(
  method: string,
  params: readonly unknown[] = [],
  options: RpcOptions = {},
): Promise<RpcResult<T>> {
  const now = (options.now ?? Date.now)();
  const all = options.endpoints ?? rpcEndpoints();
  const usable = options.requireComplete ? all.filter((e) => e.complete) : all;

  if (!usable.length) {
    throw new RpcError(
      options.requireComplete
        ? `No endpoint trusted for a complete answer is configured. ${method} needs one — ` +
          "set HELIUS_API_KEY or SOLANA_RPC_URLS."
        : "No Solana RPC endpoint is configured.",
      [],
    );
  }

  const attempts: Array<{ endpoint: string; reason: string }> = [];
  const skipped: string[] = [];

  // Endpoints the breaker has stood down go to the back rather than being
  // dropped: if every endpoint is failing, one that might have recovered is
  // still better than refusing outright.
  const ordered = [
    ...usable.filter((e) => !isOpen(e.url, now)),
    ...usable.filter((e) => isOpen(e.url, now)),
  ];

  for (const endpoint of ordered) {
    const attempt = await callOne(endpoint, method, params, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    if (attempt.ok) {
      recordSuccess(endpoint.url);
      return {
        value: attempt.value as T,
        endpoint: endpoint.name,
        tier: endpoint.tier,
        complete: endpoint.complete,
        skipped,
      };
    }

    attempts.push({ endpoint: endpoint.name, reason: attempt.reason ?? "unknown" });

    if (!attempt.retryable) {
      // The node answered, and the answer was an error. Another node would say
      // the same thing — it is not this endpoint's fault and it is not a
      // failure of health.
      throw new RpcError(`${method}: ${attempt.reason}`, attempts);
    }

    recordFailure(endpoint.url, now);
    skipped.push(endpoint.name);
  }

  throw new RpcError(
    `${method}: every endpoint failed (${attempts.map((a) => `${a.endpoint} ${a.reason}`).join("; ")})`,
    attempts,
  );
}

/** The head slot. Cheap, and the one read a public endpoint is fine for. */
export async function getSlot(options: RpcOptions = {}): Promise<RpcResult<number>> {
  return rpc<number>("getSlot", [{ commitment: "confirmed" }], options);
}

/**
 * A full transaction, for decoding a settlement.
 *
 * `requireComplete` by default: a node that has pruned the block returns null,
 * and a null read as "no such transaction" would silently drop an arrival.
 */
export async function getTransaction<T>(
  signature: string,
  options: RpcOptions = {},
): Promise<RpcResult<T>> {
  return rpc<T>(
    "getTransaction",
    [signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }],
    { requireComplete: true, ...options },
  );
}

/** Clears the breaker. For the check script and for a deliberate retry. */
export function resetRpcHealth(): void {
  health.clear();
}

/** What the breaker currently thinks, for the status surface. */
export function rpcHealth(now = Date.now()): Array<{ endpoint: string; standDown: boolean }> {
  return rpcEndpoints().map((endpoint) => ({
    endpoint: endpoint.name,
    standDown: isOpen(endpoint.url, now),
  }));
}
