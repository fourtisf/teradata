"use client";

import { useRef, useState, type MouseEvent } from "react";
import { Reveal } from "@/components/Reveal";
import { money, shortDate } from "@/lib/format";
import type { DailySeries } from "@/lib/data/types";

const W = 1000;
const H = 260;
const PAD_TOP = 14;
const PAD_BOTTOM = 42;
const BASE = H - PAD_BOTTOM;

interface Hover {
  index: number;
  x: number;
  y: number;
}

/**
 * Thirty days of gross against what stayed.
 *
 * The gap between the two bars is the round-trip capital every other dashboard
 * counts as inflow, so the pale gross bar sits behind the solid held bar rather
 * than beside it — the difference is the message.
 *
 * Net-outflow days drop below the baseline in rose. They are not smoothed away.
 */
export function FlowChart({ series }: { series: DailySeries }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const days = series.days;
  const maxGross = Math.max(...days.map((day) => day.grossUsd), 1);
  const minHeld = Math.min(...days.map((day) => day.heldUsd), 0);

  const negRoom = Math.max(30, (Math.abs(minHeld) / maxGross) * (BASE - PAD_TOP) + 16);
  const scale = (value: number) => (value / maxGross) * (BASE - PAD_TOP - negRoom);
  const barWidth = W / days.length;
  const gap = barWidth * 0.24;

  const onMove = (index: number) => (event: MouseEvent<SVGGElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({
      index,
      x: Math.min(Math.max(event.clientX - rect.left - 60, 8), rect.width - 150),
      y: event.clientY - rect.top - 82,
    });
  };

  const hovered = hover ? days[hover.index] : undefined;

  return (
    <Reveal className="card chart-wrap">
      {/* The tooltip is positioned against this box, so it is the positioned
          ancestor rather than the padded card around it. */}
      <div className="chart-inner" ref={wrapRef}>
        <div className="chart-legend">
          <span className="lg">
            <i className="gross" /> Gross inbound
          </span>
          <span className="lg">
            <i className="net" /> Held after window
          </span>
          <span className="lg">
            <i className="neg" /> Net outflow day
          </span>
        </div>

        <svg
          className="chart"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Daily gross inbound against capital held, last ${days.length} days. Average held ${money(series.averageHeldUsd)} per day.`}
        >
          <line x1="0" y1={BASE} x2={W} y2={BASE} stroke="var(--line-3)" strokeWidth="1" />
          {days.map((day, index) => {
            const x = index * barWidth + gap / 2;
            const width = barWidth - gap;
            const grossHeight = scale(day.grossUsd);
            const heldHeight = scale(Math.abs(day.heldUsd));

            return (
              <g
                key={day.date}
                className="bar-g"
                onMouseMove={onMove(index)}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  className="hit"
                  x={index * barWidth}
                  y={0}
                  width={barWidth}
                  height={H}
                  fill="transparent"
                />
                <rect
                  x={x}
                  y={BASE - grossHeight}
                  width={width}
                  height={grossHeight}
                  fill="var(--violet-tint)"
                  rx="2"
                />
                {day.heldUsd >= 0 ? (
                  <rect
                    x={x}
                    y={BASE - heldHeight}
                    width={width}
                    height={heldHeight}
                    fill="var(--violet)"
                    rx="2"
                  />
                ) : (
                  <rect
                    x={x}
                    y={BASE}
                    width={width}
                    height={Math.min(heldHeight, negRoom - 6)}
                    fill="var(--rose)"
                    rx="2"
                  />
                )}
              </g>
            );
          })}
        </svg>

        <div
          className={hover ? "tip on" : "tip"}
          style={hover ? { left: hover.x, top: hover.y } : undefined}
          aria-hidden="true"
        >
          {hovered ? (
            <>
              <span className="d">{shortDate(hovered.date)}</span>
              <b className="gross">{money(hovered.grossUsd)} gross</b>
              <b className={hovered.heldUsd >= 0 ? "held" : "out"}>
                {hovered.heldUsd >= 0 ? "" : "−"}
                {money(Math.abs(hovered.heldUsd))}
                {hovered.heldUsd >= 0 ? " held" : " net out"}
              </b>
            </>
          ) : null}
        </div>

        <div className="chart-foot">
          <span>{days.length} days ago</span>
          <span>Average held · {money(series.averageHeldUsd)} / day</span>
          <span>Today</span>
        </div>
      </div>
    </Reveal>
  );
}
