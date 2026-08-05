/**
 * The price seam.
 *
 * §4 gives `arrivals` both `amount_native` and `amount_usd` and names nothing
 * to convert between them. This is that missing piece, behind an interface for
 * the same reason `DataProvider` is one: the source will change, and when it
 * does it should change in one file rather than everywhere a dollar figure is
 * computed.
 *
 * The rule the interface exists to enforce: **a price is a measurement with a
 * timestamp, not a number**. Converting at read time means every historical
 * figure silently rewrites itself as the market moves, and the headline stops
 * being reproducible — which is the one property §1 says the whole product
 * rests on. So a quote carries when it was observed, and the row stores it.
 */

export interface PriceQuote {
  /** USD per whole unit of the asset. */
  usd: number;
  /** Which source answered. Stored on the row so a figure can be re-derived. */
  source: string;
  /** ISO 8601. When the quote was observed, not when it was used. */
  at: string;
  /** How old the quote already was when handed over. */
  ageMs: number;
}

export interface PriceSource {
  readonly name: string;
  /**
   * The current price of one asset.
   *
   * `null` means we cannot price it — an unlisted asset, a source outage, a
   * quote too stale to trust. **Callers must not fall back to zero.** An
   * arrival counted at $0 understates the headline while looking like a
   * complete figure, which is worse than an arrival we openly could not price.
   * §3.1 already has the pattern for this: keep the record, mark it, and
   * publish the share on the status page.
   */
  quote(asset: string): Promise<PriceQuote | null>;

  /** Warm the cache. Called once at worker start so the first arrival is fast. */
  prime?(): Promise<void>;
}
