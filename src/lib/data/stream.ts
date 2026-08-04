/**
 * The live feed transport, §9 `WS /v1/stream`.
 *
 * P0 runs a simulated stream in the browser. P1 replaces `openSimStream` with a
 * websocket client and the feed component does not change: it is already
 * written against `entry.new`, `entry.reclassified` and `entry.first_use`.
 *
 * The feed component must not generate rows itself. Everything it renders comes
 * either from the server snapshot or from this stream, which is why the sim
 * generator is imported here rather than there.
 */

import { PROGRAM_GROUPS, FIRST_USE_LABELS } from "@/lib/config/programs";
import { makeEntry } from "@/lib/data/sim";
import { createRng } from "@/lib/rng";
import type { DataSource, EntryStatus, EntryStream, StreamEvent } from "@/lib/data/types";

export interface StreamOptions {
  source: DataSource;
  /** Slot the server last reported, so simulated rows stay in step with it. */
  baseSlot: number;
  /**
   * Rows currently on screen and still inside their 24h window. Sim-only: it is
   * how the simulated stream chooses something to reclassify. The live socket
   * pushes ids from the server and ignores this.
   */
  getWatched: () => Array<{ id: string; status: EntryStatus; amountUsd: number }>;
  /** Milliseconds between simulated arrivals. */
  arrivalIntervalMs?: number;
}

export function createEntryStream(options: StreamOptions): EntryStream {
  if (options.source === "live") {
    throw new Error(
      "Live stream is not implemented. The websocket layer lands in P1 — " +
        "run with DATA_SOURCE=sim until then.",
    );
  }
  return openSimStream(options);
}

function openSimStream(options: StreamOptions): EntryStream {
  const { baseSlot, getWatched, arrivalIntervalMs = 3300 } = options;
  const listeners = new Set<(event: StreamEvent) => void>();

  // Seeded from the mount, not from the server seed: this stream only ever runs
  // after hydration, so it cannot desynchronise the rendered markup.
  const rng = createRng((Date.now() ^ 0x9e3779b9) >>> 0);
  const emit = (event: StreamEvent) => listeners.forEach((listener) => listener(event));

  const timers: ReturnType<typeof setInterval>[] = [];

  timers.push(
    setInterval(() => {
      emit({ type: "entry.new", entry: makeEntry(rng, Date.now(), baseSlot) });
    }, arrivalIntervalMs),
  );

  // §3.4 — an entry classified `held` at 14:00 can become `reexported` at
  // 21:00. The feed has to restamp the row in place rather than wait for a
  // reload, so the sim exercises that path on a loop.
  timers.push(
    setInterval(() => {
      const candidates = getWatched().filter((entry) => entry.status !== "reexported");
      if (!candidates.length) return;
      const target = rng.pick(candidates);
      emit({
        type: "entry.reclassified",
        id: target.id,
        status: "reexported",
        // Partial exits are proportional (§3.3): sometimes only part of the
        // arrival leaves, and the rest stays in the held figure.
        reexportedUsd: rng.chance(0.35)
          ? target.amountUsd * (0.4 + rng.next() * 0.5)
          : target.amountUsd,
      });
    }, 10_500),
  );

  timers.push(
    setInterval(() => {
      const settling = getWatched().filter((entry) => entry.status === "settling");
      if (!settling.length) return;
      const target = rng.pick(settling);
      const group = rng.pick(PROGRAM_GROUPS.filter((g) => g.programs.length > 0));
      const program = rng.pick(group.programs);
      const dwellMs = Math.ceil(rng.next() * 9) * 60_000;
      emit({
        type: "entry.first_use",
        id: target.id,
        dwellMs,
        firstUse: {
          category: group.category,
          program,
          label: FIRST_USE_LABELS[group.category](program),
          ts: new Date(Date.now() + dwellMs).toISOString(),
        },
      });
    }, 7_000),
  );

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      timers.forEach(clearInterval);
      listeners.clear();
    },
  };
}
