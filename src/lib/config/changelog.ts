/**
 * Method changes, coverage additions and corrections.
 *
 * Only entries that could move a published figure belong here — a reader
 * checking why yesterday's number changed should not have to scroll past
 * design work. Newest first.
 */
export interface ChangelogEntry {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  kind: "method" | "coverage" | "correction" | "release";
  title: string;
  detail: string;
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-08-04",
    kind: "release",
    title: "Public pages, per day, origin and route",
    detail:
      "Server-rendered pages for each day, origin chain and bridge, with the figures, chart and " +
      "entries behind them. Indexing stays disabled while the figures are simulated.",
  },
  {
    date: "2026-08-04",
    kind: "method",
    title: "Unspent share is quoted against held, not gross",
    detail:
      "Idle capital is reported as a share of what stayed. A denominator that includes round " +
      "trips would understate it using the very figure the method rejects.",
  },
  {
    date: "2026-08-04",
    kind: "release",
    title: "Frontend on simulated data",
    detail:
      "Every surface renders against the provider interface. No figure on the site is measured; " +
      "the status strip reads Simulated and robots are disallowed until that changes.",
  },
] as const;
