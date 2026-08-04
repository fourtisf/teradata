# Manifest

Capital arriving on Solana, and whether it stayed.

`CLAUDE.md` is the build spec and the persistent context for this repo — read it
before changing anything. `manifest-v2.html` is the design prototype and the
visual source of truth. This README covers only what P0 actually is.

## Status: P0 complete

Next.js App Router scaffold, the design tokens from §5, and the full page from
the prototype, rendering against a simulated data provider. Nothing is measured
yet — every figure on the page is generated.

| Phase | State |
|---|---|
| P0 — skeleton, simulated data | done |
| P1 — Solana ingest | not started, see *What P1 needs* below |
| P2–P6 | not started |

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

## What is verified

Checked against a real browser at 1440px and 360px:

- No horizontal overflow at 360px.
- Visible keyboard focus on the range selector, route tabs, expandable rows and
  alert toggles; rows open with Enter and carry `aria-expanded`.
- `prefers-reduced-motion` stops the live feed and the animations, and content
  that would otherwise reveal on scroll renders visible.
- Range selector, route filter, quiet-hours preview, trace expansion, feed pause
  while a trace is open, live arrivals and live reclassification all work.
- No console errors, no failed requests.

## Constraints that are not negotiable

- **No wallet connect.** No connect button, no signature, no custody surface, no
  private key anywhere in the system.
- **No entity attribution.** Manifest reports measured flow and never names who
  moved the money. There is no `entity_name` field in the schema and there must
  never be one. Wallets are described only by what is verifiable: first seen or
  returning, funded from which venue, idle for how long.
- **Confidence is exposed, not hidden.** Bridge arrivals are `matched` on a
  protocol-level message id; exchange withdrawals are `attributed` by hot-wallet
  heuristics. Every entry carries the distinction and the trace states it.

## What P1 needs

- Helius API key and a gRPC/Geyser endpoint. RPC polling cannot hit the
  event-to-alert-under-10-seconds promise, so this is not optional.
- Origin-chain RPC endpoints with log subscriptions for the five bridges in
  §3.1.
- ClickHouse connection details, plus Postgres and Redis for P2 onwards.
- A decision on the size floor and the re-export window (§11) once there is real
  volume to test against.
