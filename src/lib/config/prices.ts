/**
 * Asset → price-source identifier.
 *
 * Kept in config rather than scattered through the ingest code for the same
 * reason §3.5 keeps the program map here: it changes, and it should change in
 * one reviewable place.
 *
 * The list is short on purpose. The size floor is $100K, and arrivals above
 * that floor are overwhelmingly stables, SOL and wrapped majors — the long tail
 * does not clear it. Adding a row here is cheap; guessing a price is not.
 */

/** CoinGecko coin ids. `null` means deliberately unpriced, not forgotten. */
export const COINGECKO_IDS: Readonly<Record<string, string>> = {
  SOL: "solana",
  ETH: "ethereum",
  WETH: "weth",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
  USDC: "usd-coin",
  USDT: "tether",
  PYUSD: "paypal-usd",
  USDS: "usds",
  JUP: "jupiter-exchange-solana",
  JTO: "jito-governance-token",
  RAY: "raydium",
  BONK: "bonk",
  WIF: "dogwifcoin",
  PYTH: "pyth-network",
  MSOL: "msol",
  JITOSOL: "jito-staked-sol",
  BNSOL: "binance-staked-sol",
} as const;

/** Every asset we ask for in one request. Order is irrelevant; it is a set. */
export const TRACKED_ASSETS: readonly string[] = Object.keys(COINGECKO_IDS);

/**
 * How long a quote is reused before another request goes out.
 *
 * This is a budget decision, not a correctness one. CoinGecko's free Demo plan
 * allows 10,000 calls a month, and one `/simple/price` call covers every asset
 * above at once:
 *
 *   cache 60s   → 43,200 calls/month   over budget by 4x
 *   cache 300s  →  8,640 calls/month   87% of budget, no room for anything else
 *   cache 600s  →  4,320 calls/month   43% of budget          ← this
 *
 * The cost is that a quote can be up to ten minutes old. On a stablecoin that
 * is nothing; on SOL in a fast hour it is a few tenths of a percent. That error
 * is recorded rather than hidden — every row stores `price_ts`, so how stale
 * the quote was is a fact anyone can check rather than an assumption they have
 * to make.
 */
export const PRICE_CACHE_MS = Number(process.env.PRICE_CACHE_MS) || 600_000;

/** Quotes older than this are refused outright rather than used. */
export const PRICE_MAX_STALE_MS = Number(process.env.PRICE_MAX_STALE_MS) || 1_800_000;
