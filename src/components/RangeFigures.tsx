"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { RANGES, type FlowSummary, type Range } from "@/lib/data/types";

/**
 * The range selector and the three headline figures.
 *
 * All four ranges arrive from the server in one snapshot, so switching is
 * instant and does not put a loading state in front of the number the whole
 * product is about.
 */
export function RangeFigures({ summaries }: { summaries: Record<Range, FlowSummary> }) {
  const [range, setRange] = useState<Range>("24h");
  const summary = summaries[range];

  return (
    <>
      <div className="range-bar">
        <span className="lb" id="range-label">
          Range
        </span>
        <span className="seg" role="group" aria-labelledby="range-label">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              className={option === range ? "on" : undefined}
              aria-pressed={option === range}
              onClick={() => setRange(option)}
            >
              {option}
            </button>
          ))}
        </span>
      </div>

      <div className="hero-figs">
        <div className="fig">
          <div className="v num">{money(summary.declaredInboundUsd)}</div>
          <div className="k">Declared inbound</div>
        </div>
        {/* The headline. Deliberately smaller than every other dashboard's. */}
        <div className="fig gd">
          <div className="v num">{money(summary.stillOnSolanaUsd)}</div>
          <div className="k">Still on Solana</div>
        </div>
        <div className="fig">
          <div className="v num">{money(summary.unspentUsd)}</div>
          <div className="k">Landed and unspent</div>
        </div>
      </div>
    </>
  );
}
