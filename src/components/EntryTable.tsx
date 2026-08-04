"use client";

import { useState } from "react";
import { EntryRow } from "@/components/EntryRow";
import type { Entry } from "@/lib/data/types";

/**
 * The arrivals table without the stream.
 *
 * The public pages in §8 show a fixed set of entries for a day or a route, so
 * they need the row and its trace but none of the live machinery. Sharing
 * `EntryRow` keeps the trace identical on every surface — a reader who learns
 * to read it on the home page reads the same thing on `/day/2026-08-04`.
 */
export function EntryTable({ entries, caption }: { entries: Entry[]; caption?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {caption ? (
        <div className="p-top">
          <h3>{caption}</h3>
        </div>
      ) : null}

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

      <div className="rows full">
        {entries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            open={openId === entry.id}
            isNew={false}
            onToggle={() => setOpenId((current) => (current === entry.id ? null : entry.id))}
          />
        ))}
      </div>
    </div>
  );
}
