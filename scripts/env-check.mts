/**
 * Which credentials are set, and what each missing one blocks.
 *
 *   npm run env:check
 *   npm run env:check -- --strict   # exit non-zero if anything live-critical is missing
 *
 * It reads `.env.local` the same way the poster does, so it reports the state
 * the processes will actually see rather than the state of your shell.
 *
 * **No value is ever printed** — not a prefix, not a masked form. A length and
 * "set" is enough to answer "did it get through", and anything more is a
 * credential in a terminal that gets screenshotted into a chat.
 */
import { getDataProvider } from "@/lib/data";
import { rpcEndpoints, onlyFallbacksConfigured } from "@/lib/rpc/endpoints";

type Need = "required" | "live" | "optional";

interface Credential {
  name: string;
  /** What it is for, in one line. */
  what: string;
  /** What does not work without it. */
  blocks: string;
  need: Need;
  /** Any one of these being set satisfies the entry. */
  alternatives?: string[];
}

const GROUPS: Array<{ title: string; note?: string; items: Credential[] }> = [
  {
    title: "Running the site",
    items: [
      {
        name: "DATA_SOURCE",
        what: "sim or live",
        blocks: "nothing — defaults to sim",
        need: "optional",
      },
      {
        name: "NEXT_PUBLIC_SITE_URL",
        what: "canonical and Open Graph origin",
        blocks: "nothing — defaults to the production domain. Inlined at build time.",
        need: "optional",
      },
    ],
  },
  {
    title: "Publishing (P5) — the poster and the bot",
    note: "Nothing publishes while DATA_SOURCE=sim, whatever is set here.",
    items: [
      {
        name: "TELEGRAM_BOT_TOKEN",
        what: "from @BotFather",
        blocks: "every Telegram post, alert and bot reply",
        need: "live",
      },
      {
        name: "TELEGRAM_CHAT_ID",
        what: "the broadcast channel, -100…",
        blocks: "recaps and alerts. Bot replies still work without it.",
        need: "live",
      },
      {
        name: "TELEGRAM_WEBHOOK_SECRET",
        what: "authenticates Telegram's webhook deliveries",
        blocks: "/today, /week, /status — the route answers 501",
        need: "optional",
      },
      { name: "X_API_KEY", what: "OAuth 1.0a consumer key", blocks: "every X post", need: "live" },
      { name: "X_API_SECRET", what: "OAuth 1.0a consumer secret", blocks: "every X post", need: "live" },
      { name: "X_ACCESS_TOKEN", what: "OAuth 1.0a user token, Read and Write", blocks: "every X post", need: "live" },
      { name: "X_ACCESS_SECRET", what: "OAuth 1.0a user secret", blocks: "every X post", need: "live" },
      {
        name: "ALERTS_DISPATCH_SECRET",
        what: "shared secret the ingest worker presents",
        blocks: "/api/alerts/dispatch — the route answers 501",
        need: "live",
      },
    ],
  },
  {
    title: "Storage",
    items: [
      {
        name: "POSTGRES_URL",
        what: "the flow store and the app tables",
        blocks: "every live read and every ingest write",
        need: "live",
      },
      {
        name: "REDIS_URL",
        what: "§3.1 pending-arrival buffer, and the dedupe that is in-process today",
        blocks: "P2 correlation. Nothing yet.",
        need: "optional",
      },
    ],
  },
  {
    title: "Solana ingest (P1)",
    note: "The gRPC stream is not substitutable — §2 fixes it because polling cannot meet the under-10s promise.",
    items: [
      {
        name: "HELIUS_API_KEY",
        what: "the paid Geyser stream, and the RPC reads",
        blocks: "the entire ingest layer",
        need: "live",
      },
      {
        name: "HELIUS_GRPC_ENDPOINT",
        what: "laserstream-mainnet-<region>.helius-rpc.com",
        blocks: "the settlement stream",
        need: "live",
      },
      {
        name: "HELIUS_RPC_URL",
        what: "overrides the URL derived from the key",
        blocks: "nothing — derived from HELIUS_API_KEY when unset",
        need: "optional",
      },
      {
        name: "SOLANA_RPC_URLS",
        what: "additional trusted RPC endpoints, comma-separated",
        blocks: "nothing — but with no primary at all, completeness-sensitive reads refuse",
        need: "optional",
      },
      {
        name: "SOLANA_RPC_FALLBACK_URLS",
        what: "last-resort public endpoints",
        blocks: "nothing — defaults to Solana's public endpoint",
        need: "optional",
      },
    ],
  },
  {
    title: "Prices",
    items: [
      {
        name: "COINGECKO_API_KEY",
        what: "free Demo plan; the keyless endpoint is throttled without warning",
        blocks: "amount_native → amount_usd. Arrivals store unpriced, never $0.",
        need: "live",
      },
    ],
  },
  {
    title: "Later phases",
    items: [
      { name: "ALCHEMY_API_KEY", what: "EVM origin-chain reads", blocks: "P2 origin watchers", need: "optional" },
      { name: "DUNE_API_KEY", what: "hot-wallet label seed set", blocks: "P2 exchange attribution", need: "optional" },
      { name: "WAITLIST_WEBHOOK_URL", what: "where signups go", blocks: "/api/waitlist — answers 501", need: "optional" },
    ],
  },
];

const strict = process.argv.includes("--strict");
const isSet = (name: string) => Boolean(process.env[name]?.trim());
const provider = getDataProvider();

let set = 0;
let total = 0;
let missingLive = 0;

const MARK = { yes: "  set", no: "  ———" };

for (const grouping of GROUPS) {
  console.log(`\n${grouping.title}`);
  if (grouping.note) console.log(`  ${grouping.note}`);
  console.log("");
  for (const item of grouping.items) {
    total++;
    const present = isSet(item.name) || (item.alternatives ?? []).some(isSet);
    if (present) set++;
    else if (item.need === "live") missingLive++;

    const length = process.env[item.name]?.trim().length ?? 0;
    // The length, never the value. Enough to tell a pasted key from a truncated
    // one, and useless to anyone reading over a shoulder.
    const detail = present ? `${length} chars` : item.need === "live" ? "needed for live" : "optional";
    console.log(`  ${present ? MARK.yes : MARK.no}  ${item.name.padEnd(26)} ${detail}`);
    if (!present) console.log(`        ${item.blocks}`);
  }
}

console.log(`\n${"─".repeat(72)}`);
console.log(`data source        ${provider.source}`);
console.log(`credentials set    ${set} of ${total}`);

const endpoints = rpcEndpoints();
console.log(`solana rpc         ${endpoints.map((e) => `${e.name}(${e.tier})`).join(", ")}`);
if (onlyFallbacksConfigured()) {
  console.log(`                   public only — completeness-sensitive reads will refuse`);
}

if (provider.source === "sim") {
  console.log("");
  console.log("DATA_SOURCE=sim, so none of the above is required. Nothing publishes,");
  console.log("nothing is indexed, and every figure on the site is generated.");
} else if (missingLive) {
  console.log("");
  console.log(`${missingLive} credential(s) needed for live are missing. The lines above say what each blocks.`);
}

process.exit(strict && provider.source === "live" && missingLive ? 1 : 0);
