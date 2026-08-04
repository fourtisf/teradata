"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntryRow } from "@/components/EntryRow";
import { createEntryStream } from "@/lib/data/stream";
import { announceUpdate } from "@/lib/freshness";
import { count, money, seconds } from "@/lib/format";
import { SIZE_FLOOR_USD } from "@/lib/config/programs";
import type { ArrivalKind, DataSource, Entry } from "@/lib/data/types";

const MAX_ROWS = 14;

const FILTERS: ReadonlyArray<{ key: "all" | ArrivalKind; label: string }> = [
  { key: "all", label: "All routes" },
  { key: "bridge", label: "Bridges" },
  { key: "exchange", label: "Exchanges" },
];

export function ArrivalsFeed({
  initialEntries,
  entryCount,
  medianLagMs,
  lastSlot,
  source,
}: {
  initialEntries: Entry[];
  entryCount: number;
  medianLagMs: number;
  lastSlot: number;
  source: DataSource;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [openId, setOpenId] = useState<string | null>(null);
  const [quiet, setQuiet] = useState(false);
  const [filter, setFilter] = useState<"all" | ArrivalKind>("all");
  const [matched, setMatched] = useState(entryCount);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());

  // The stream needs the current rows to pick a reclassification target, and it
  // must not re-subscribe every time a row changes. Refs, not deps.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const openRef = useRef(openId);
  openRef.current = openId;

  useEffect(() => {
    const reduced =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const stream = createEntryStream({
      source,
      baseSlot: lastSlot,
      getWatched: () =>
        entriesRef.current.map((entry) => ({
          id: entry.id,
          status: entry.status,
          amountUsd: entry.amountUsd,
        })),
    });

    const unsubscribe = stream.subscribe((event) => {
      // A trace being read is a trace that must not move. The prototype pauses
      // the feed while one is open and so does this.
      if (openRef.current !== null) return;

      if (event.type === "entry.new") {
        setEntries((current) => [event.entry, ...current].slice(0, MAX_ROWS));
        setFreshIds((current) => new Set(current).add(event.entry.id));
        setMatched((current) => current + 1);
        announceUpdate();
        return;
      }

      if (event.type === "entry.reclassified") {
        // §3.4 — the row restamps in place. Held at 14:00, re-exported at
        // 21:00, no reload.
        setEntries((current) =>
          current.map((entry) =>
            entry.id === event.id
              ? { ...entry, status: event.status, reexportedUsd: event.reexportedUsd }
              : entry,
          ),
        );
        announceUpdate();
        return;
      }

      setEntries((current) =>
        current.map((entry) =>
          entry.id === event.id
            ? {
                ...entry,
                firstUse: event.firstUse,
                dwellMs: event.dwellMs,
                // A swap or a deposit is deployment, not departure — the value
                // stayed on Solana either way (§3.3).
                status: event.firstUse.category === "unspent" ? "held" : "deployed",
              }
            : entry,
        ),
      );
      announceUpdate();
    });

    return () => {
      unsubscribe();
      stream.close();
    };
  }, [lastSlot, source]);

  const toggle = useCallback((id: string) => {
    setOpenId((current) => (current === id ? null : id));
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.kind === filter)),
    [entries, filter],
  );

  const paused = openId !== null;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="p-top">
        <h3>Live entries</h3>
        <button
          type="button"
          className={quiet ? "mini on" : "mini"}
          aria-pressed={quiet}
          onClick={() => setQuiet((current) => !current)}
        >
          {quiet ? "Back to live feed" : "Preview quiet hours"}
        </button>
        <span className="seg" role="group" aria-label="Filter by route">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={option.key === filter ? "on" : undefined}
              aria-pressed={option.key === filter}
              onClick={() => setFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
        </span>
      </div>

      <div className="rhead">
        <span className="c-tm">Time · UTC</span>
        <span>Origin</span>
        <span className="c-rt">Route</span>
        <span>Amount</span>
        <span className="c-to">Recipient</span>
        <span className="c-dw">Dwell</span>
        <span>Status</span>
        <span />
      </div>

      <div className={["rows", paused ? "open" : "", quiet ? "quiet" : ""].filter(Boolean).join(" ")}>
        {visible.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            open={openId === entry.id}
            isNew={freshIds.has(entry.id)}
            onToggle={() => toggle(entry.id)}
          />
        ))}

        {/* Quiet hours are a real state, not an error. The port goes quiet and
            the page should say so plainly. */}
        <div className="empty">
          <div className="ic">—</div>
          <h5>The port is quiet</h5>
          <p>
            Nothing over {money(SIZE_FLOOR_USD)} has landed in the last 14 minutes. Indexing is live
            and the next entry will appear here.
          </p>
        </div>
        <div className="fade" />
      </div>

      <div className="p-bot">
        <span>
          Matched entries today <b className="num">{count(matched)}</b>
        </span>
        {paused ? (
          <span className="paused">Feed paused while a trace is open</span>
        ) : (
          <span>
            Median settlement lag <b className="num">{seconds(medianLagMs)}</b>
          </span>
        )}
      </div>
    </div>
  );
}
