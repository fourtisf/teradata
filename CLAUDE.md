# tare

Capital arriving on Solana, and whether it stayed.

This document is the complete build spec. Hand it to Claude Code as persistent
context (copy it to `CLAUDE.md` at the repo root) and work through the phases in
order. The design prototype is `prototype-v2.html` — it is the visual source of
truth, but it uses simulated data and is not the production architecture.

---

## 1. What this is

Every other dashboard reports **gross bridge volume**. A market maker that moves
$40M into Solana and $40M back out within the hour adds $80M to that number while
leaving nothing behind.

Tare matches each arrival to the wallet that received it, watches whether the
balance survives a 24-hour window, and removes the round trips. What is left is
capital that is actually on the chain.

Our headline number is consistently **smaller** than DefiLlama's, Wormholescan's,
and every bridge explorer's. That is the product, not a bug. The entire brand
rests on the number being defensible.

### Three things nobody else does

1. **Bridges and CEX withdrawals in one figure.** Competitors split these. Traders
   ask one question: did new money enter the chain today?
2. **Net, not gross.** Round trips are detected and removed.
3. **What happened after settlement.** Bridge explorers stop at the moment funds
   land. We follow the receiving wallet's first meaningful action. This is
   structurally impossible for anyone who does not index Solana DEX activity — it
   is the widest part of the moat.

### The house rule — non-negotiable

**Tare reports measured flow. It never names who moved the money.**

Never write "Jump bridged $20M" or "Wintermute is accumulating." Wallets are
described only by what is verifiable: first seen or returning, funded from which
venue, holding what, idle for how long. Pattern-based identity attribution is a
lawsuit and a credibility collapse in one move. Enforce this at the schema level:
there is no `entity_name` column exposed on any public surface. Internal exchange
hot-wallet labels are venue labels, not firm labels, and that distinction holds.

---

## 2. Stack decisions

These are decided. Do not re-litigate them mid-build.

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)** | Mandatory. Public pages must be server-rendered — see §8. A client-only SPA kills the organic traffic engine before it starts. |
| Flow store | **ClickHouse** | Arrivals, re-export events and daily rollups. Column store handles the aggregation shapes we need. |
| App DB | **Postgres** | Accounts, subscriptions, alert rules, delivery log. |
| Cache / match buffer | **Redis** | Pending-arrival buffer keyed by bridge message ID, plus pub/sub to the websocket layer. |
| Solana ingest | **Helius gRPC / Geyser** (or webhooks) | The product promises event-to-alert under 10 seconds. RPC polling cannot hit that. Do not build on polling and plan to swap later. |
| EVM ingest | Provider RPC log subscriptions | Origin-side deposit events per bridge. |
| Client transport | Websocket | Live manifest feed. |
| Wallet connect | **None, ever** | This is a public data product. No connect button, no signature, no custody surface, no reason to hold a private key anywhere in the system. |
| Hosting | Frontend on Vercel, ingest workers on the VPS | Frontend can go live in simulated mode on day one. |

Ship with `DATA_SOURCE=sim|live`. In `sim` the site runs the prototype's generated
data so the frontend can be deployed and reviewed before ingest is ready.

---

## 3. The hard part: correlation

This is where the engineering actually is. Everything else is CRUD and charts.

### 3.1 Bridge arrivals

Bridges are asynchronous. The origin transaction and the Solana settlement are
different transactions on different chains with different hashes and a variable
delay. They must be joined by each bridge's own message identifier.

```
origin chain deposit event
  → extract (bridge, message_id, asset, amount, sender, ts)
  → write pending record to Redis, keyed bridge:message_id, TTL 6h
  → mirror to ClickHouse as status='pending'

Solana settlement instruction
  → extract (bridge, message_id, recipient, amount, slot, ts)
  → look up pending record
  → match → compute lag_ms → status='matched', confidence='matched'
```

Per-bridge identifiers to implement:

| Bridge | Identifier |
|---|---|
| Wormhole / Portal | emitter chain + emitter address + sequence (the VAA key) |
| deBridge | `submissionId` |
| Across | `depositId` + origin chain id |
| Mayan | Swift order hash |
| Allbridge | `messageId` |

Unmatched after TTL: keep the record, set `confidence='unattributed'`. Include it
in the total inbound figure, exclude it from the origin breakdown, and surface the
unattributed share on the status page. Never silently drop it and never guess an
origin to make a table look complete.

### 3.2 CEX withdrawals

There is no message ID. Matching is heuristic: a transfer out of a known exchange
hot wallet to a non-exchange address, above the size floor.

Store these as `confidence='attributed'`, a **different confidence class from
bridges**. The API exposes the confidence field. The UI does not need to shout
about it, but the status and method pages must state plainly that exchange flow is
identified by hot-wallet attribution rather than protocol-level matching.

Hot wallet labels live in the `entities` table and grow over time. This is the
part of the system that compounds: every venue, relayer and router labelled today
makes tomorrow's numbers sharper, and a competitor starting in six months starts
from zero. Treat label curation as a permanent workflow, not a one-off seed.

### 3.3 Re-export detection

For every matched arrival, watch the recipient for 24 hours.

**Counts as re-export (capital left the chain):**
- Bridged out to any chain
- Deposited into an exchange hot wallet

**Does NOT count as re-export (capital is still here):**
- Swapped into another asset — value stayed on Solana
- Deposited into lending, LP, staking or perp collateral
- Transferred to another wallet on Solana — follow **one hop** and continue
  watching there; deeper than one hop, stop and keep it classified as held

Partial exits are proportional: if 60% of the arrived value leaves, 60% is
re-exported and 40% remains in the held figure.

### 3.4 Records are mutable — design for this on day one

An entry classified `held` at 14:00 can become `re-exported` at 21:00. This is not
an edge case, it is the core mechanic, and retrofitting it later means rewriting
the aggregation layer.

- `arrivals` rows are updated in place (ClickHouse `ReplacingMergeTree` on
  `updated_at`).
- Daily rollups are recomputed for any date touched by a reclassification.
- The websocket emits `entry.reclassified` so open clients restamp the row live.
- The 24h window closes a record permanently; after that it is immutable history.

### 3.5 Dwell and first use

**Dwell** = time from settlement to the first *meaningful* outbound action.
Ignore ATA creation, dust, and fee-only transactions.

**First use** classification by program ID:

| Category | Programs |
|---|---|
| Spot swap | Jupiter, Titan, Raydium, Orca, Meteora (swap instructions) |
| Liquidity provision | Meteora, Orca, Raydium (deposit/position instructions) |
| Lending | Kamino, MarginFi, Save |
| Perp collateral | Drift, Jupiter Perps |
| Staking | Stake program, Jito, Marinade |
| Unspent | no qualifying action within the window |

Keep the program → category map in a config file, not scattered through the code.
It will change monthly.

---

## 4. Data model

```sql
-- ClickHouse
arrivals (
  id                    UUID,
  confidence            Enum('matched','attributed','unattributed'),
  bridge                LowCardinality(String),   -- or exchange name
  message_id            String,
  origin_chain          LowCardinality(String),
  origin_tx             String,
  origin_ts             DateTime64(3),
  asset                 LowCardinality(String),
  amount_native         Decimal(38,12),
  amount_usd            Decimal(18,2),
  solana_tx             String,
  solana_slot           UInt64,
  solana_ts             DateTime64(3),
  lag_ms                UInt32,
  recipient             String,
  recipient_first_seen  Bool,
  status                Enum('settling','held','deployed','reexported'),
  dwell_ms              Nullable(UInt64),
  first_use_category    LowCardinality(Nullable(String)),
  first_use_program     Nullable(String),
  first_use_ts          Nullable(DateTime64(3)),
  reexported_usd        Decimal(18,2) DEFAULT 0,
  reexported_ts         Nullable(DateTime64(3)),
  window_closed         Bool DEFAULT false,
  updated_at            DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
  ORDER BY (solana_ts, id)

daily_flows (
  date Date, origin LowCardinality(String),
  gross_usd Decimal, held_usd Decimal, reexported_usd Decimal, idle_usd Decimal,
  entry_count UInt32, updated_at DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (date, origin)

wallets (
  address String, first_seen_slot UInt64, first_funded_from LowCardinality(String),
  total_received_usd Decimal, updated_at DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY address

entities (
  address String, kind Enum('cex_hot','bridge_program','router','relayer'),
  venue LowCardinality(String), source String, confidence Float32
) ENGINE = ReplacingMergeTree ORDER BY address
```

Postgres: `users`, `subscriptions`, `alert_rules`, `alert_deliveries`, `api_keys`.

---

## 5. Design system

Taken from `prototype-v2.html`. Put these in `globals.css` as CSS custom
properties and never hardcode a colour in a component.

```css
--bg:        #0C0718;   /* page */
--surface:   #171029;   /* cards, rows, panels */
--surface-2: #1D1533;   /* hover state on surface */
--txt:       #F1EDFF;
--txt-2:     #948BB4;
--txt-3:     #6B6390;
--line:      rgba(241,237,255,.08);
--line-2:    rgba(241,237,255,.16);

--violet:     #7C5CFF;  /* accent */
--violet-lt:  #A78BFA;
--violet-dim: rgba(124,92,255,.14);
--green:      #34D399;  /* capital that stayed */
--green-dim:  rgba(52,211,153,.13);
--rose:       #F87189;  /* capital that left */
--rose-dim:   rgba(248,113,137,.13);
```

**The ratio rule, and it is the important one.** Roughly 90% of the screen is
neutral. Colour is not decoration, it carries meaning:

- **Violet** — primary button, active segment, logo, the hero portal, chart bars
  for held capital. Nothing else.
- **Green** — capital that stayed. The "Still on Solana" figure, `Held` pills,
  first-seen tags, idle capital, positive deltas. Nothing else.
- **Rose** — capital that left. `Re-exported` pills, negative ledger lines, net
  outflow bars. Nothing else.

No gradient backgrounds, no glow on more than the portal, no gradient fills on
bars. Earlier iterations of this design failed specifically because colour was
spread across too much surface area.

**Type**

| Role | Face | Usage |
|---|---|---|
| Display | Sora 600 | h1, h2, section titles, prices |
| Body | Plus Jakarta Sans 400/500/600 | prose, labels, buttons |
| Data | JetBrains Mono 400/500/600 | every number, address, hash, timestamp, eyebrow |

All numeric output uses `font-variant-numeric: tabular-nums`. Eyebrows are mono,
10.5px, `letter-spacing: .2em`, uppercase.

**Components**: 16px card radius, 1px `--line` borders, 8–11px control radius.
Row hover is a 2.5% white wash, not a border change. Transitions 220–300ms.
Reveal-on-scroll is 18px translate with 700ms ease — nothing bouncier.

---

## 6. Feature scope by phase

### P0 — Skeleton, simulated data
Next.js App Router scaffold, design tokens, full page from the prototype rendering
against a `sim` data provider. Deploy to Vercel. Everything below swaps the
provider, not the components.

### P1 — Solana ingest
Helius gRPC subscription, settlement detection, `arrivals` writes at
`confidence='unattributed'`, live websocket feed, freshness and slot indicators
wired to real values.

### P2 — Correlation
Origin-chain watchers for the five bridges in §3.1. Redis pending buffer, matching,
lag computation. CEX hot-wallet attribution and the `entities` seed set. This phase
is where the product becomes real; budget accordingly.

### P3 — Re-export and dwell
24-hour watcher, one-hop transfer following, proportional partial exits,
reclassification job, `entry.reclassified` events, daily rollup recompute. Dwell
and first-use classification.

### P4 — Product surface
Range selector (1h/24h/7d/30d), 30-day gross-vs-held chart, expandable row traces,
origin cards with sparklines, coverage and status pages, quiet-hours empty state.

### P5 — Retention
Alert rules, Telegram delivery under 10s, daily card image generated server-side
at 00:00 UTC, share endpoints.

### P6 — Public pages and API
See §8. REST + websocket, API keys, rate limits, history export.

---

## 7. Acceptance criteria for P2–P3

Do not call the correlation layer done until all of these hold:

- Median settlement lag reported matches manual spot-checks on 20 sampled entries
  across at least three different bridges.
- A deliberately constructed round trip (bridge in, bridge out within 2h) appears
  as `held` initially and flips to `re-exported` with the daily rollup adjusting.
- A swap after arrival does **not** reduce the held figure.
- A one-hop transfer to a second Solana wallet does **not** reduce the held figure,
  and that second wallet is being watched.
- Unattributed share is visible on the status page and is under 15% of total USD.
- Reclassifying an entry from three days ago recomputes that day's rollup without
  a manual job.

---

## 8. Public pages — the traffic engine

Server-render these with ISR. They are the reason the framework choice is fixed.

```
/origin/[chain]      /origin/ethereum, /origin/binance …
/route/[bridge]      /route/wormhole, /route/debridge …
/day/[date]          /day/2026-08-04
```

Each is a real page with the day's figures, a chart, the top entries, and prose
generated from the data. Sitemap, canonical URLs, OG images from the daily card
generator, JSON-LD `Dataset` markup.

If these render client-side, crawlers see an empty shell and the whole strategy
produces nothing. This is the single most expensive thing to get wrong, because it
is invisible until months of compounding traffic have already been lost.

---

## 9. API surface

```
GET  /v1/flows/summary?range=1h|24h|7d|30d
GET  /v1/flows/daily?from=&to=&origin=
GET  /v1/entries?min_usd=&origin=&status=&limit=&cursor=
GET  /v1/entries/:id            -- full trace
GET  /v1/origins?range=
GET  /v1/dwell?range=
WS   /v1/stream                 -- entry.new, entry.reclassified, entry.first_use
```

Every entry response includes `confidence`. Consumers must be able to filter to
`matched` only if they want the strictest figure.

---

## 10. Kickoff prompt for Claude Code

Paste this to start:

> Read `CLAUDE.md` in full before writing any code. Build P0 only, then stop and
> report.
>
> Scaffold a Next.js App Router project in TypeScript for Tare, a Solana
> capital-inflow tracker. Set up the design tokens from §5 in `globals.css` and
> build the full page structure from `prototype-v2.html`: nav with freshness
> indicator, hero with range selector and three figures, 30-day gross-vs-held
> chart, live manifest table with expandable row traces, dwell breakdown, first-use
> list, origin cards with sparklines, method section, alerts and daily card,
> coverage and status, pricing, footer.
>
> All data comes from a `DataProvider` interface with a `SimProvider`
> implementation that reproduces the prototype's generated data. Read
> `DATA_SOURCE` from env; `live` throws "not implemented" for now. No component
> may import data directly — everything goes through the provider so P1 swaps one
> file.
>
> Rules: no wallet connect anywhere. No hardcoded colours — tokens only. Colour
> ratio per §5, violet and green and rose each mean exactly one thing. Every
> number uses tabular-nums. Responsive to 360px. Respect
> `prefers-reduced-motion`. Visible keyboard focus on the range selector, tabs,
> expandable rows and alert toggles.
>
> When P0 runs and deploys, stop and list what you need from me for P1 (Helius
> key, RPC endpoints, ClickHouse connection).

---

## 11. Open decisions for ALFA

- Size floor: $100K in the prototype. Lower floor means more entries and more
  noise; higher means a quieter but less useful feed. Worth testing against real
  volume in P1 before fixing it.
- Re-export window: 24h assumed. Sensitivity check once real data exists — 12h and
  48h will produce visibly different headline numbers and we should know by how
  much before publishing a figure we have to defend.
### Closed

- **Brand and domain — locked.** The product is **Tare**, on `taredata.com`.
  Named after the weighing term: the deduction you make from gross to get net,
  which is the whole method. It replaced `manifest`, which was correct in meaning
  — a manifest is the document, not the cargo — but unwinnable in search against
  `manifest.json`, web app manifests and Kubernetes manifests. §8's entire plan is
  organic traffic, so a brand term nobody can rank for was disqualifying.

  Note the one word deliberately kept: the live entry table is still called **the
  manifest**. That is the shipping document, not the old brand, and it sits in the
  same port vocabulary as tare.

- **Logo — locked.** *Aperture*: two rings and a core, the hero portal reduced.
  Geometry and its constraints are documented in `src/components/Brand.tsx`, and
  the daily-card canvas draws from the same exported `MARK` constants so the shape
  cannot drift between surfaces.
