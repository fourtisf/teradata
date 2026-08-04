/**
 * LiveProvider — P1 onwards.
 *
 * Deliberately unimplemented. `DATA_SOURCE=live` fails loudly rather than
 * quietly falling back to simulated numbers: the entire brand rests on the
 * headline figure being defensible (§1), so a build that cannot reach the real
 * data must not serve a number at all.
 *
 * When this is filled in it reads ClickHouse for aggregates and history, Redis
 * for the pending-arrival buffer, and subscribes to the websocket layer for the
 * live feed. See §2 and §4.
 */

import type {
  Coverage,
  DailySeries,
  DataProvider,
  DwellBreakdown,
  Entry,
  EntryQuery,
  FirstUseRow,
  FlowSummary,
  HomeSnapshot,
  IndexerStatus,
  OriginCard,
  Range,
} from "@/lib/data/types";

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

  async getStatus(): Promise<IndexerStatus> {
    notImplemented("getStatus");
  }

  async getHomeSnapshot(): Promise<HomeSnapshot> {
    notImplemented("getHomeSnapshot");
  }
}
