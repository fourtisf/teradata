"use client";

import { useEffect, useState } from "react";
import { Freshness } from "@/components/Freshness";
import { count, percent, seconds } from "@/lib/format";
import type { IndexerStatus } from "@/lib/data/types";

const STATE_LABEL: Record<IndexerStatus["state"], string> = {
  live: "Live",
  degraded: "Degraded",
  down: "Down",
};

/**
 * The status strip.
 *
 * The unattributed share is on it deliberately (§3.1, §7): arrivals that never
 * matched a message id are counted in the inbound total and excluded from the
 * origin breakdown, and the page says how much of the figure that is rather
 * than guessing an origin to make the table look complete.
 */
export function StatusStrip({ status }: { status: IndexerStatus }) {
  const [slot, setSlot] = useState(status.lastSlot);

  useEffect(() => {
    // Solana advances a slot roughly every 400ms. Two slots per 900ms keeps the
    // counter honest to that pace without repainting the strip constantly.
    const timer = setInterval(() => setSlot((current) => current + 2), 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="status">
      <div className="st">
        <div className="k">Indexer</div>
        <div className={status.state === "live" ? "v ok" : "v"}>{STATE_LABEL[status.state]}</div>
      </div>
      <div className="st">
        <div className="k">Last slot processed</div>
        <div className="v num">{count(slot)}</div>
      </div>
      <div className="st">
        <div className="k">Median settlement lag</div>
        <div className="v num">{seconds(status.medianLagMs)}</div>
      </div>
      <div className="st">
        <div className="k">Unattributed share</div>
        <div className="v num">{percent(status.unattributedShare)}</div>
      </div>
      <div className="st">
        <div className="k">Data updated</div>
        <div className="v">
          <Freshness />
        </div>
      </div>
    </div>
  );
}
