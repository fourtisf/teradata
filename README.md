# Tare

Capital arriving on Solana, and whether it stayed. Live at **taredata.com**.

`CLAUDE.md` is the build spec and the persistent context for this repo — read it
before changing anything. `prototype-v2.html` is the design prototype and the
visual source of truth. This README covers only what P0 actually is.

## Status

Nothing is measured yet. **Every figure on this site is generated**, the status
strip reads `Simulated`, a preview banner says so on every page, and
`robots.txt` disallows everything until `DATA_SOURCE=live`.

| Phase | State |
|---|---|
| P0 — skeleton, simulated data | done |
| P1 — Solana ingest | not started, see *What P1 needs* below |
| P2–P3 — correlation, re-export | not started |
| P4 — product surface | done ahead of schedule (range, chart, traces, coverage, status) |
| P5 — retention | daily card done as the OG generator; alert delivery to Telegram and X done, refused until data is real |
| P6 — public pages | pages, sitemap, JSON-LD and OG done; REST/WS API not started |

### Routes

```
/                       the live surface, rendered per request
/day/[date]             §8, ISR 1h, last 30 days, 404 outside the window
/origin/[chain]         §8, ISR 1h, one per origin chain or venue
/route/[bridge]         §8, ISR 1h, one per bridge
/status                 indexer state, unattributed share, changelog
/api/waitlist           POST { email }, forwards to WAITLIST_WEBHOOK_URL
/api/alerts/dispatch    POST an alert event, behind ALERTS_DISPATCH_SECRET
/opengraph-image        the daily card, and one per public page
/sitemap.xml /robots.txt
```

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

```bash
npm run build          # production build
npm start              # serve the production build
npm run typecheck      # tsc --noEmit
```

Deploys to Vercel with no configuration. `DATA_SOURCE` defaults to `sim`, so a
fresh deploy renders the full page immediately.

## The one seam that matters

Every figure on every surface comes from a `DataProvider`. **No component
imports a data module.** Server components ask the provider, then pass shaped
values down as props.

```
src/lib/data/
  types.ts    the contract — domain types, DataProvider, stream events
  index.ts    getDataProvider(), reads DATA_SOURCE   ← P1 changes this file
  sim.ts      SimProvider, reproduces the prototype's generated data
  live.ts     LiveProvider, throws "not implemented" on every method
  stream.ts   the live feed transport (§9 WS /v1/stream)
```

`DATA_SOURCE=live` fails loudly rather than falling back to simulated numbers.
The headline figure has to be defensible, so a build that cannot reach the real
data must not serve a number at all.

The feed component is already written against the three websocket events the
live socket will send — `entry.new`, `entry.reclassified`, `entry.first_use` —
so P1 replaces the transport, not the UI. `entry.reclassified` is the one that
matters: §3.4 says a row classified `held` at 14:00 can become `reexported` at
21:00, and the row restamps in place rather than waiting for a reload.

### Simulated data is deterministic

The prototype used `Math.random()`, which cannot survive server rendering — the
server and the client would generate different numbers and every figure would
flash on hydration. `SimProvider` draws from a seeded PRNG instead. `SIM_SEED`
pins it, so review builds and screenshots are reproducible.

One deliberate difference from the prototype: net-outflow days are drawn up
front rather than rolled at 13% per day, because a month with none in it leaves
the rose bar — the state the entire method section argues for — unreviewable.

## Design system

Tokens live in `src/app/globals.css`. **No component hardcodes a colour.** If a
value is missing, add a token.

The ratio rule from §5 holds: roughly 90% of the screen is neutral, and violet,
green and rose each mean exactly one thing — active/held, capital that stayed,
capital that left. Fonts are loaded through `next/font` and exposed as
`--font-display`, `--font-body`, `--font-mono`, so components never name a font
either.

## The public pages

§8 is the growth strategy, so the machinery is real even though the figures are
not: server-rendered with ISR, canonical URLs, `Dataset` JSON-LD, a generated OG
card per page, and prose written from the same numbers the page displays. Every
sentence in `src/lib/prose.ts` restates a figure that is rendered next to it.

**Indexing is off while the data is simulated.** `robots.ts` disallows everything
and the sitemap is empty in `sim` mode. Ranking for invented dollar amounts would
spend the credibility the whole product rests on, and it is not recoverable by
fixing the data afterwards. Setting `DATA_SOURCE=live` turns both on with no
other change.

## Alerts

`src/lib/alerts/` delivers movements to Telegram and X. Four kinds — `arrival`,
`reexport`, `idle`, `first_seen` — and the ingest worker in P1 POSTs them to
`/api/alerts/dispatch` behind a shared secret.

**Nothing is delivered while `DATA_SOURCE=sim`.** The dispatcher refuses before
it formats anything. A page can carry a "simulated" label a reader can see; a
Telegram message is forwarded and a tweet is screenshotted, both with the label
gone. `ALERTS_ALLOW_SIMULATED=true` unlocks delivery for testing into a private
channel, and every message is then prefixed `[SIMULATED]` at format time, where
no transport can drop it.

Thresholds are per channel because the constraints are not the same. Telegram is
a subscriber feed and can carry every qualifying movement. X's free tier allows
**500 posts a month**, so its thresholds start an order of magnitude higher and
it carries a 30-minute cooldown on top — otherwise the post budget, rather than
editorial judgement, decides what gets published.

### The copy varies

A feed that posts one sentence with a different number every time reads as a
bot, and a bot is not worth following. `src/lib/alerts/copy.ts` holds fifteen
phrasings across the four kinds. Each carries a condition, so only the ones that
are true of the event are offered — `partial-exit` needs a partial exit,
`slow-settle` needs a bridge arrival above the median lag, `unspent-large` needs
size. One is then chosen by hashing the entry id.

Deterministic rather than random, for two reasons: a retry after a transport
error produces the identical message rather than a second different one, and a
reviewer can reproduce exactly what went out.

The voice is short, and understood on the first read by someone whose English is
their second or third language — which is most of this audience. Number first,
one idea per sentence, common words. *"$39.9M came in from Ethereum. Four hours
later it left Solana again. It came in and it went out, so we count it as zero
new money."*

Three things get in the way of that, and all three are banned:

- **Terms of art** — *re-exported*, *idle capital*, *dwell*, *inflow*. They
  belong on the site next to a definition, and in the API. An alert arrives
  alone on a phone with no page around it.
- **Idioms** — *caught off the hot wallet*, *dry powder*, *round trip*. Fluent,
  and opaque to anyone who did not grow up with them. "We recognised the
  exchange's wallet" and "money waiting to be spent" say the same thing and need
  nothing explained.
- **Volume** — no exclamation, no all-caps, no rocket, no adjective doing work
  the number is already doing.

The schema words still travel: the footer states in plain English how the origin
was established, then names the confidence class in brackets, so a reader learns
the word rather than bouncing off it. Most variants also write their own header,
because one repeated category label across every post is most of what makes a
feed look automated.

§1 does not relax because the register got simpler. *Whale*, *smart money* and
*aped in* are guesses about who is acting and why — exactly the guesses that
turn a measurement into a defamation risk — so the copy describes the flow and
what is verifiable about the wallet, and nothing else. The dispatcher also
refuses a `first_seen` event whose entry marks the recipient as returning,
because every phrasing of that alert opens by asserting the wallet is new.

Preview the copy without credentials and without sending:

```bash
npx tsx --tsconfig tsconfig.json scripts/alert-preview.mts          # a spread
npx tsx --tsconfig tsconfig.json scripts/alert-preview.mts --all    # every variant
```

`--all` is the one to run after editing `copy.ts`: it renders all fifteen on
both channels and exits non-zero if any X body would break 280 once a t.co link
is added.

Dedupe and cooldown are in-process, which is right for exactly one PM2 instance
and wrong for two — §2 already specifies Redis for the pub/sub layer and this
moves there with it. `ecosystem.config.cjs` runs one instance for that reason.

## What is verified

Checked against a real browser at 1440px, 920px and 360px:

- No horizontal overflow at 360px on any route.
- Visible keyboard focus on the range selector, route tabs, expandable rows and
  alert toggles; rows open with Enter and carry `aria-expanded`.
- `prefers-reduced-motion` stops the live feed and the animations, and content
  that would otherwise reveal on scroll renders visible.
- Range selector, route filter, quiet-hours preview, trace expansion, feed pause
  while a trace is open, live arrivals and live reclassification all work.
- All 43 pages prerender; OG routes return valid 1200×630 PNGs; unknown slugs and
  out-of-window dates 404.
- The 30-day series sums exactly to the 30-day headline, and its last day equals
  the 24-hour headline, so the chart, the hero and `/day/<today>` agree.
- No console errors, no failed requests.
- Alerts: the simulated-data guard refuses both channels; thresholds route $5M
  to Telegram only and $50M to both; a repeat of the same entry is deduped; X
  cools down for 30 minutes while Telegram does not. Checked against stubbed
  transports, so the branch decisions are exercised rather than the network.

## Constraints that are not negotiable

- **No wallet connect.** No connect button, no signature, no custody surface, no
  private key anywhere in the system.
- **No entity attribution.** Tare reports measured flow and never names who
  moved the money. There is no `entity_name` field in the schema and there must
  never be one. Wallets are described only by what is verifiable: first seen or
  returning, funded from which venue, idle for how long.
- **Confidence is exposed, not hidden.** Bridge arrivals are `matched` on a
  protocol-level message id; exchange withdrawals are `attributed` by hot-wallet
  heuristics. Every entry carries the distinction and the trace states it.

## What P1 needs

`docs/P1-CREDENTIALS.md` is the full list — what each credential costs, what it
blocks, and the order to acquire them in. The short version:

- **Helius gRPC/Geyser, plus an RPC url.** Not on the free tier and not
  substitutable with polling; §2 fixes the choice because of the under-10s
  promise. This alone is most of P1.
- **A CoinGecko free Demo key.** `amount_native → amount_usd` needs the price *at
  settlement*, which is a gap in the spec rather than a line item in it. The
  free tier works because ingest is real-time — there is no historical lookup
  to do — and one request covers every tracked asset, so the monthly call count
  depends on the cache window alone. `src/lib/prices/` and §11 have the detail.
- **ClickHouse**, plus Postgres and Redis from P2. Redis also retires the
  in-process alert dedupe and the one-instance PM2 constraint.
- **Origin-chain reads** for the five bridges in §3.1 — the bridges' own APIs to
  start, EVM log subscriptions where volume justifies owning the read.
- **An entity seed set** for §3.2. Dune bootstraps it; curation is permanent.
- A decision on the size floor and the re-export window (§11) once there is real
  volume to test against.
