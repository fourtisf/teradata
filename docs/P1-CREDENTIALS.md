# What real data needs

Everything required to move `DATA_SOURCE` from `sim` to `live`, in the order it
is needed. Nothing here asks for a private key or a signing wallet, and nothing
ever will — §2 rules that surface out of the system entirely.

Prices and plan names are approximate and were correct at the time of writing.
Confirm each one before paying for it.

---

## 1. Solana ingest — blocks P1

### Helius, gRPC/Geyser

| Variable | Example | Notes |
|---|---|---|
| `HELIUS_API_KEY` | `4a1f…` | one key, both endpoints below |
| `HELIUS_GRPC_ENDPOINT` | `laserstream-mainnet-ewr.helius-rpc.com` | pick the region nearest the VPS |
| `HELIUS_RPC_URL` | `https://mainnet.helius-rpc.com/?api-key=…` | backfill, `getTransaction`, gap repair |

**The gRPC stream is not on the free tier.** This is the one line item that
cannot be worked around: §2 fixes the choice because the product promises
event-to-alert under ten seconds, and RPC polling cannot hit that. Budget for a
business-tier subscription, expect it in the hundreds of dollars a month, and
check the current price before committing.

The RPC URL is separate from the stream and does real work — a gRPC consumer
that falls behind or restarts needs to re-fetch the slots it missed, and every
settlement needs its full transaction pulled to read the instruction data.

**Alternatives, if Helius pricing does not work:** Triton One, QuickNode
Yellowstone, or Shyft all serve the same Yellowstone gRPC protocol, so the
consumer code is portable. Do not substitute a polling provider.

### What to subscribe to

Nothing to buy, but decide it before writing the consumer: transaction
subscriptions filtered to the bridge programs in §3.1 plus the token program,
not a full firehose. A firehose on Solana is expensive to receive and expensive
to reason about.

---

## 2. Origin chains — blocks P2

The five bridges in §3.1 reach Solana from seven EVM chains between them:
Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche.

**Two ways to get the origin side, and they are not equivalent.**

### Option A — per-chain log subscriptions (what §2 specifies)

| Variable | Notes |
|---|---|
| `ALCHEMY_API_KEY` | one key covers every chain above; `eth_subscribe` logs on the growth tier |

Also possible: Infura, QuickNode, Ankr. One provider across all seven is worth
more than a cheaper mix — seven different reconnect behaviours is seven
different failure modes at 3am.

This is the version that owes nothing to anyone. The deposit event is read from
the chain, so the correlation is ours end to end.

### Option B — bridge APIs

| Bridge | Source |
|---|---|
| Wormhole | Wormholescan API, or run a Guardian spy and read VAAs directly |
| deBridge | public stats/API by `submissionId` |
| Across | public API by `depositId` |
| Mayan | explorer API by Swift order hash |
| Allbridge | public API by `messageId` |

Mostly free and dramatically less infrastructure. The cost is that the join key
now comes from the bridge's own service, which means their rate limits, their
lag, and their outage becomes an unattributed spike on our status page.

**Recommendation:** start on B to get P2 producing numbers, and move Wormhole —
the largest share — to a Guardian spy first, because it is the one where the
volume justifies the work. Track which bridges are on which method on the status
page, since it is a real difference in evidence quality and §1 says we surface
those rather than smooth them over.

---

## 3. Prices — not in the spec, and the schema does not work without it

`arrivals` has `amount_native` and `amount_usd`. Converting between them needs a
price **at the settlement timestamp**, not spot at the time the row is read.
Using spot means every historical figure silently rewrites itself as the market
moves, and the headline number stops being reproducible — which is the one
property §1 says the whole brand rests on.

| Variable | Source | Covers |
|---|---|---|
| — | **Pyth** on-chain price accounts | SOL, ETH, BTC, USDC, USDT, majors. Free, already on Solana, and readable at a historical slot. |
| `BIRDEYE_API_KEY` | Birdeye | the long tail, and Solana-native tokens Pyth does not carry. Paid, starts modest. |
| `COINGECKO_API_KEY` | CoinGecko Pro | fallback and reconciliation. Optional. |

**Recommendation:** Pyth for majors, Birdeye for everything else, and store the
price used on the row so a figure can always be re-derived from what it was
actually computed with rather than from what the price is today. Flagging this
as a spec gap rather than quietly picking one: §11 should record the decision.

---

## 4. Storage

Self-hosting all three on the existing VPS is reasonable, given the ingest
workers are already going there per §2.

| Variable | Notes |
|---|---|
| `CLICKHOUSE_URL` `CLICKHOUSE_USER` `CLICKHOUSE_PASSWORD` | wants 4GB RAM minimum, more once `arrivals` grows. ClickHouse Cloud if the VPS is small. |
| `POSTGRES_URL` | small — accounts, subscriptions, alert rules. Neon or Supabase free tier is plenty. |
| `REDIS_URL` | the pending-arrival buffer (§3.1) and the pub/sub the websocket reads. Tiny. |

**What I need from you:** the VPS RAM and disk. If it is a 4GB box running the
Next.js app as well, ClickHouse goes elsewhere.

Redis also fixes a known limitation: alert dedupe and cooldown are in-process
today, which is why `ecosystem.config.cjs` pins one PM2 instance. Two instances
would double-post.

---

## 5. Entity labels — §3.2, and the part that compounds

CEX withdrawals have no message id. They are identified by a transfer out of a
**known** hot wallet, so the label set is the product. There is no clean feed to
buy for Solana.

| Source | Reality |
|---|---|
| `DUNE_API_KEY` | best seed set. Community-maintained Solana label tables, and one query exports a starting list. Free tier is enough to bootstrap. |
| Solscan / SolanaFM public labels | scrapeable, decent coverage of the top venues, no API guarantee |
| `ARKHAM_API_KEY` | good coverage, paid, and their labels name firms — **take venue labels only and drop the rest at the ingest boundary.** §1 is not negotiable and a label that arrives from a vendor does not get an exemption. |
| Manual curation | unavoidable, permanent, and the moat |

Ten venues covers most of the volume. Get those right before chasing the tail.

---

## 6. Already configured

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `X_API_KEY`, `X_API_SECRET`,
`X_ACCESS_TOKEN`, `X_ACCESS_SECRET`, `ALERTS_DISPATCH_SECRET`,
`WAITLIST_WEBHOOK_URL`. See `.env.example`.

Alerts stay refused until `DATA_SOURCE=live` regardless of these being set.

---

## Order to buy in

1. **Helius gRPC + RPC.** Nothing else is useful without it. P1 ships on this alone.
2. **Prices.** P1 cannot write a USD figure without it.
3. **ClickHouse.** Somewhere to put the rows.
4. **Bridge APIs** (free) → P2 correlation starts producing matched arrivals.
5. **Dune** → the entity seed set, and CEX flow joins the headline figure.
6. **EVM RPC** → replaces the bridge APIs where the volume justifies owning the
   read.

Steps 1–3 are the whole of P1 and turn the headline number from generated into
measured. Everything after that makes it sharper.
