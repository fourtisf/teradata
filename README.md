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
| P1 — Solana ingest | store and schema done and tested; the Helius subscription needs a key, see *What P1 needs* |
| P2–P3 — correlation, re-export | not started |
| P4 — product surface | done ahead of schedule (range, chart, traces, coverage, status) |
| P5 — retention | daily card done as the OG generator; alert delivery and the scheduled poster done, both refused until data is real |
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
/api/telegram/webhook   Telegram delivers bot commands here, behind a secret token
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

```bash
npm run social         # the scheduled poster (see below); PM2 runs this
npm run social:check   # the scheduler's tests — clock, ledger, budget, guard
npm run social:preview # every scheduled post, rendered, nothing sent
npm run alerts:preview # every alert variant, rendered, nothing sent
npm run telegram:webhook -- --info   # where Telegram is delivering bot commands
```

```bash
createdb tare_test
POSTGRES_URL=postgres:///tare_test npm run db:check   # the store, against real SQL
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

## The scheduled poster

Alerts are reactive: something moves, the P1 ingest worker hands it over, a
message goes out. That path publishes nothing on a quiet day and nothing at all
until P1 exists, which would leave both accounts empty. `src/lib/social/` is the
other half — it fires on a clock, from figures the site already holds.

```bash
npm run social                 # the worker; the tare-social PM2 process
npm run social -- --once       # one tick and exit, for a system cron instead
npm run social -- --dry-run    # compose and decide, send nothing
npm run social -- --once --dry-run --at 2026-08-07T00:06:00Z
```

Two triggers. A **daily** recap at 00:05 UTC, and a **weekly** one on Mondays at
00:20 UTC covering the seven settled days behind it. Both go to Telegram and X.

### The daily post is not about yesterday

§P5 asks for a daily card at 00:00 UTC and the obvious reading is a recap of the
day that just ended. That reading publishes a number we would have to correct.

§3.3 watches each arrival for 24 hours. An arrival at 23:40 on the 5th has an
open window until 23:40 on the 6th, so at 00:05 on the 6th the held figure for
the 5th is provisional — and it can only move one way, down, as round trips
close. The site is allowed to show that: §3.4 makes rows mutable and the feed
restamps them in front of the reader. A post cannot. It is screenshotted, quoted
and forwarded at the value it had when it was sent.

So the daily post covers the most recent day whose windows have **all** closed.
At 00:05 on the 7th that is the 5th. The cost is a date one day further back
than a reader might expect, and the site carries today's figure live for anyone
who wants it sooner. `REEXPORT_WINDOW_HOURS` drives it, so if §11 settles on 12h
or 48h the settled date follows without a code change.

### What stops it publishing

The same simulated-data guard as the alert path — one switch, both halves — and
that switch **does not open X**. `ALERTS_ALLOW_SIMULATED=true` exists so the
delivery path can be tested into a *private* Telegram channel, where a mistake
is recoverable. There is no private tweet: `@TareData_` is public, so a test
post is public, and an invented dollar amount published under the brand is what
§1 says cannot be undone by fixing the data afterwards. `--public` overrides it
and exists so the flag is typed by someone who has read that sentence, which is
the same bargain `alert-test.mts` already makes.

Then four more, in `runner.ts`:

- **The indexer is down.** A total drawn across a gap is wrong in the direction
  that flatters us.
- **No figures for the period.** A day the provider has no page for, or a week
  missing one of its seven days. Nothing is posted rather than a `$0` that reads
  as a complete figure.
- **Already posted.** The ledger is on disk, so a restart at 00:06 does not
  repost what went out at 00:05, and a redeploy mid-month does not reset the X
  count.
- **Out of budget, or out of attempts.** Three tries per occurrence per channel.
  Delivery is at-least-once — a lost response is indistinguishable from a
  refusal — and three is enough to cross a restart while bounding the duplicate
  risk.

Missed firings are not caught up. A box that was down for a day comes back and
posts today's recap, not yesterday's under a date nobody is thinking about any
more.

### The X budget is now enforced

500 posts a month, hard, and previously documented rather than counted. That was
survivable while nothing published without a person starting it. It is not
survivable for an unattended process: an allowance spent by the 20th means the
feed is silent for eleven days, and the first sign of it is a 429 during the
exact event worth posting about.

`social/budget.ts` counts against the ledger, across both halves. Scheduled
posts may spend down to a safety margin; **alerts stop a reserve short of it**,
because a movement not announced is one gap and a month of missing recaps is the
account going quiet.

### The card, and why only Telegram gets it

`src/lib/og.tsx` already generates the daily card and already serves it at every
page's `opengraph-image` route. The poster fetches that image over loopback
rather than rendering a second copy — a second layout would drift from the first
the week either was edited alone.

Telegram gets it as a photo, because its messages disable link previews and
nothing would unfurl otherwise. X does not: it unfurls the permalink's Open
Graph tags into the same card for free, so there is no media upload to keep
working and no dependence on an API tier that may not include one. If the fetch
fails the post still goes out as text — the figures are in the words.

### The ledger

An append-only NDJSON file, one per UTC month, under `SOCIAL_LEDGER_DIR`
(`/var/lib/tare/social` on the box, outside the checkout so `git pull` cannot
touch it). A single `appendFile` of one line is atomic on POSIX, so the app and
the worker can both write it without coordinating — which read-modify-write on a
JSON file could not.

Not Postgres, on the same arithmetic §11 used to drop ClickHouse: this is forty
rows a day read by two processes that share a filesystem by construction, and a
database dependency would stop the poster starting for bookkeeping the database
is not otherwise part of. `PostLedger` is the seam for the day the app and the
worker stop sharing a disk — the same day the in-process alert dedupe has to
move to Redis.

Reads and writes fail soft. Losing the bookkeeping degrades the budget count;
throwing would lose a post.

## The bot answers as well as posts

`/today`, `/week`, `/status` and `/help`, in whatever chat asks. Everything
above this line pushes — a recap fires on a clock and goes to everyone; this is
the other direction.

A webhook rather than a `getUpdates` loop: the app is already public behind
nginx with TLS, so it is a route instead of a second polling process with a
durable offset to keep, and Telegram's own `secret_token` authenticates it so
there is no scheme to invent. Unset `TELEGRAM_WEBHOOK_SECRET` closes the route
the way an unset `ALERTS_DISPATCH_SECRET` closes the dispatch one.

```bash
openssl rand -hex 32                 # put it in .env.local, then
npm run telegram:webhook -- --info   # check what is registered first
npm run telegram:webhook -- --set
npm run telegram:webhook -- --delete
```

Telegram holds exactly one webhook per bot token, so `--set` from a laptop
points the production bot at the laptop. `--info` first, always.

**The same guard applies to answers.** A reply is one-to-one and pull-based,
which sounds safer than a broadcast and is not: it is forwarded and
screenshotted the same way. So while `DATA_SOURCE=sim` the bot says nothing is
measured yet and links to the method, rather than quoting a generated figure
with a label a screenshot drops.

Two other rules hold the surface small. Nothing a user types is echoed back —
the parser keeps the first token and discards the rest, so there is no argument
to reflect and no way to make the account post someone else's link. And the
reply goes to the chat that asked, never to `TELEGRAM_CHAT_ID`, which would
publish one person's question to every subscriber.

### Checking it

```bash
npm run social:check     # the clock, the ledger, the budget, the guard
ALERTS_ALLOW_SIMULATED=true npm run social:check   # …and that X stays shut
npm run social:preview   # a fortnight of dailies and the weekly, as they would post
npm run social:preview -- --all   # every variant forced, including the rose one
```

`social:check` is run both ways on purpose. `ALERTS_ALLOW_SIMULATED` is read at
module load so the script cannot move it, and each setting has its own thing to
prove: closed, every channel is refused; open, X is still held back for being
public and `--public` is what lifts it.

`social:check` drives ninety days of ten-minute ticks through the real schedule
and asserts one occurrence per day, twelve hours of lateness and no more, and
that a three-day outage yields one post rather than three. `social:preview`
exits non-zero if any X post would break 280 once a t.co link is counted, or any
Telegram post would break the caption limit that lets the card be attached.

## The store

`src/lib/db/` is the write side of P1 — what the Helius subscription lands on
once there is a key for it. The transport is replaceable; the rules are not, so
they live here rather than in the worker, and every one of them is enforced in
SQL rather than trusted to a caller:

- **A replay cannot double-count.** `arrivals` is upserted on
  `(solana_tx, instruction_index)`. A restarted stream re-delivers whole slots,
  and the transaction alone is the wrong key — one bridge settlement can carry
  several transfers, and keying on the transaction would lose all but the first.
- **A replay cannot weaken what is known.** An arrival already matched to its
  origin deposit stays matched; a row already priced stays priced.
- **An unpriced arrival is stored as null, never `$0`.** §11 closed this: a zero
  understates the headline while looking like a complete figure.
- **A closed window stays closed.** §3.4 makes a row mutable for 24 hours and
  history afterwards, so a late re-export or first-use write is refused rather
  than silently moving a published day.
- **Partial exits are proportional.** `reexported_usd` accumulates and clamps at
  what arrived; only a full exit makes the arrival a re-export.

`indexer_state` is a separate signal from all of that, and the reason is worth
stating: deriving "is the indexer up" from how recently something arrived calls
a quiet Sunday an outage and calls a stalled stream healthy for as long as its
backlog lasts. The worker stamps a heartbeat on every slot it processes,
whether or not anything arrived in it, and liveness is the age of that stamp.

```bash
createdb tare_test
POSTGRES_URL=postgres:///tare_test npm run db:check
```

The check applies `deploy/postgres/schema.sql` first, so the schema is verified
by being used rather than by being read. It refuses a connection string that
does not say `test`, because it truncates.

`LiveProvider.getStatus()` is wired to those tables — §P1's "freshness and slot
indicators wired to real values". **Every other method still throws**, so a
build pointed at `live` fails on the first page it renders rather than serving a
figure from a half-filled database.

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
- **Postgres and Redis**, both on the VPS. Redis also retires the
  in-process alert dedupe and the one-instance PM2 constraint.
- **Origin-chain reads** for the five bridges in §3.1 — the bridges' own APIs to
  start, EVM log subscriptions where volume justifies owning the read.
- **An entity seed set** for §3.2. Dune bootstraps it; curation is permanent.
- A decision on the size floor and the re-export window (§11) once there is real
  volume to test against.
