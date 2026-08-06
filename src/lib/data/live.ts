/**
 * LiveProvider — P1 onwards.
 *
 * Deliberately unimplemented. `DATA_SOURCE=live` fails loudly rather than
 * quietly falling back to simulated numbers: the entire brand rests on the
 * headline figure being defensible (§1), so a build that cannot reach the real
 * data must not serve a number at all.
 *
 * `getStatus()` is the exception and the first thing P1 wires up: §P1 asks for
 * the freshness and slot indicators to read real values, and those come from
 * the heartbeat and the arrivals table rather than from the aggregate layer
 * that is still to come. Everything else still throws, so a build pointed at
 * `live` fails on the first page it renders rather than serving a figure from
 * a half-filled database.
 *
 * When the rest is filled in it reads Postgres for aggregates and history (§11
 * — not ClickHouse), Redis for the pending-arrival buffer, and subscribes to
 * the websocket layer for the live feed.
 */

import type {
  Coverage,
  DailySeries,
  DataProvider,
  DayPage,
  DwellBreakdown,
  Entry,
  EntryQuery,
  FirstUseRow,
  FlowSummary,
  HomeSnapshot,
  IndexerStatus,
  OriginCard,
  OriginPage,
  PageRef,
  Range,
  RoutePage,
} from "@/lib/data/types";
import { indexerFacts } from "@/lib/db/arrivals";
import { livenessOf, readHeartbeat } from "@/lib/db/indexer";

/** Everything §7's status strip reads is drawn from the last 24 hours. */
const STATUS_WINDOW_MS = 24 * 60 * 60 * 1000;

function notImplemented(method: string): never {
  throw new Error(
    `LiveProvider.${method}() is not implemented. ` +
      "The ingest layer lands in P1 — run with DATA_SOURCE=sim until then.",
  );
}

export class LiveProvider implements DataProvider {
  readonly source = "live" as const;

  async getSummary(_range: Range): Promise<FlowSummary> {
    notImplemented("getSummary");
  }

  async getDailyFlows(_days: number): Promise<DailySeries> {
    notImplemented("getDailyFlows");
  }

  async getEntries(_query?: EntryQuery): Promise<Entry[]> {
    notImplemented("getEntries");
  }

  async getDwell(_range: Range): Promise<DwellBreakdown> {
    notImplemented("getDwell");
  }

  async getFirstUse(_range: Range): Promise<FirstUseRow[]> {
    notImplemented("getFirstUse");
  }

  async getOrigins(_range: Range): Promise<OriginCard[]> {
    notImplemented("getOrigins");
  }

  async getCoverage(): Promise<Coverage> {
    notImplemented("getCoverage");
  }

  /**
   * §7 — the indexer's state, the head slot, the median lag and the share of
   * value we could not trace.
   *
   * The state comes from the heartbeat rather than from how recently something
   * arrived: those are different questions, and reading the second as the first
   * calls a quiet hour an outage. See `src/lib/db/indexer.ts`.
   */
  async getStatus(): Promise<IndexerStatus> {
    const now = Date.now();
    const [heartbeat, facts] = await Promise.all([
      readHeartbeat(),
      indexerFacts(new Date(now - STATUS_WINDOW_MS)),
    ]);

    return {
      state: livenessOf(heartbeat, now),
      // The heartbeat's slot is the head we have actually reached; the
      // arrivals table only knows about slots that happened to contain one.
      lastSlot: heartbeat?.lastSlot ?? facts.lastSlot,
      medianLagMs: facts.medianLagMs,
      unattributedShare: facts.unattributedShare,
      updatedAt: heartbeat?.updatedAt ?? facts.updatedAt ?? new Date(now).toISOString(),
    };
  }

  async getHomeSnapshot(): Promise<HomeSnapshot> {
    notImplemented("getHomeSnapshot");
  }

  async getDayPage(_date: string): Promise<DayPage | null> {
    notImplemented("getDayPage");
  }

  async getOriginPage(_slug: string): Promise<OriginPage | null> {
    notImplemented("getOriginPage");
  }

  async getRoutePage(_slug: string): Promise<RoutePage | null> {
    notImplemented("getRoutePage");
  }

  async listDays(_limit: number): Promise<string[]> {
    notImplemented("listDays");
  }

  async listOrigins(): Promise<PageRef[]> {
    notImplemented("listOrigins");
  }

  async listRoutes(): Promise<PageRef[]> {
    notImplemented("listRoutes");
  }
}
