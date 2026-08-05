/**
 * CoinGecko, free Demo plan.
 *
 * Chosen over reading Pyth's on-chain accounts because the ingest layer is
 * real-time: we see a settlement within seconds of it landing, so the price we
 * need is the current one, and there is no historical lookup to do. That turns
 * a Solana account-read problem into one HTTP request.
 *
 * The whole design is shaped by one number — 10,000 calls a month. See
 * `PRICE_CACHE_MS` for the arithmetic. Three consequences:
 *
 * 1. **One request covers every asset.** `/simple/price` takes a comma-joined
 *    list, so the call count is a function of the cache window alone and does
 *    not grow with how many assets we track or how busy the chain is.
 * 2. **Single-flight.** Twenty arrivals in the same second must not become
 *    twenty requests. Concurrent callers await the one in progress.
 * 3. **A stale quote is refused, not stretched.** If the source is down, the
 *    cache is allowed to age up to PRICE_MAX_STALE_MS and then we return null
 *    and say we could not price it, rather than quietly using a price from an
 *    hour ago.
 */

import {
  COINGECKO_IDS,
  PRICE_CACHE_MS,
  PRICE_MAX_STALE_MS,
  TRACKED_ASSETS,
} from "@/lib/config/prices";
import type { PriceQuote, PriceSource } from "@/lib/prices/types";

const ENDPOINT = "https://api.coingecko.com/api/v3/simple/price";
/** Demo keys are served from the public host with a header. Pro uses its own. */
const PRO_ENDPOINT = "https://pro-api.coingecko.com/api/v3/simple/price";

interface Snapshot {
  /** CoinGecko id → USD. */
  prices: Record<string, number>;
  at: number;
}

export class CoinGeckoPrices implements PriceSource {
  readonly name = "coingecko";

  #snapshot: Snapshot | null = null;
  #inFlight: Promise<Snapshot | null> | null = null;

  readonly #apiKey: string | null;
  readonly #pro: boolean;
  readonly #now: () => number;

  constructor(options: { apiKey?: string | null; pro?: boolean; now?: () => number } = {}) {
    this.#apiKey = (options.apiKey ?? process.env.COINGECKO_API_KEY ?? "").trim() || null;
    this.#pro = options.pro ?? process.env.COINGECKO_PLAN === "pro";
    this.#now = options.now ?? Date.now;
  }

  configured(): boolean {
    // The keyless public endpoint still answers, but CoinGecko throttles it
    // hard and without warning. A worker that depends on it will look fine in
    // testing and drop quotes under load, so treat the free Demo key as
    // required rather than optional.
    return this.#apiKey !== null;
  }

  async prime(): Promise<void> {
    await this.#refresh();
  }

  async quote(asset: string): Promise<PriceQuote | null> {
    const id = COINGECKO_IDS[asset.toUpperCase()];
    if (!id) return null;

    const now = this.#now();
    let snapshot = this.#snapshot;

    if (!snapshot || now - snapshot.at >= PRICE_CACHE_MS) {
      snapshot = (await this.#refresh()) ?? snapshot;
    }
    if (!snapshot) return null;

    const ageMs = this.#now() - snapshot.at;
    // The source is down and the cache has gone cold. Say so.
    if (ageMs > PRICE_MAX_STALE_MS) return null;

    const usd = snapshot.prices[id];
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return null;

    return { usd, source: this.name, at: new Date(snapshot.at).toISOString(), ageMs };
  }

  /** One request for every tracked asset, shared by every concurrent caller. */
  #refresh(): Promise<Snapshot | null> {
    this.#inFlight ??= this.#fetchSnapshot().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #fetchSnapshot(): Promise<Snapshot | null> {
    const ids = TRACKED_ASSETS.map((a) => COINGECKO_IDS[a]!);
    const url = new URL(this.#pro ? PRO_ENDPOINT : ENDPOINT);
    url.searchParams.set("ids", [...new Set(ids)].join(","));
    url.searchParams.set("vs_currencies", "usd");

    const headers: Record<string, string> = { accept: "application/json" };
    if (this.#apiKey) {
      headers[this.#pro ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = this.#apiKey;
    }

    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      // 429 here is the monthly or per-minute allowance. Keep the old snapshot
      // and let it age — PRICE_MAX_STALE_MS decides when it stops being usable.
      if (!response.ok) return null;

      const body = (await response.json()) as Record<string, { usd?: number }>;
      const prices: Record<string, number> = {};
      for (const [id, value] of Object.entries(body)) {
        if (typeof value?.usd === "number") prices[id] = value.usd;
      }
      if (Object.keys(prices).length === 0) return null;

      this.#snapshot = { prices, at: this.#now() };
      return this.#snapshot;
    } catch {
      return null;
    }
  }
}

/**
 * Converts a native amount to USD, or refuses.
 *
 * Returns null rather than 0 when the asset cannot be priced, because a $0
 * arrival understates the headline while looking like a complete figure. The
 * caller writes the row either way and counts the unpriced share on the status
 * page — the same treatment §3.1 gives an unmatched arrival.
 */
export async function toUsd(
  source: PriceSource,
  asset: string,
  amountNative: number,
): Promise<{ usd: number; quote: PriceQuote } | null> {
  const quote = await source.quote(asset);
  if (!quote) return null;
  return { usd: amountNative * quote.usd, quote };
}
