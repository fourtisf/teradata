import { Reveal } from "@/components/Reveal";
import { money, percent } from "@/lib/format";
import type { DwellBreakdown } from "@/lib/data/types";

/**
 * Short dwell means the capital arrived with a plan. Long dwell means it is
 * still waiting — and still available.
 */
export function DwellSection({ dwell }: { dwell: DwellBreakdown }) {
  return (
    <section>
      <Reveal className="s-head">
        <span className="eyebrow">Dwell</span>
        <h2>How long it sits before it moves</h2>
        <p>
          Short dwell means the capital arrived with a plan. Long dwell means it is still waiting —
          and still available.
        </p>
      </Reveal>

      <div className="grid2">
        <Reveal className="card pad">
          <h4>Time to first move</h4>
          <div className="hint">Share of today&rsquo;s inflow by dwell window</div>
          {dwell.buckets.map((bucket) => (
            <div className="bar-row" key={bucket.label}>
              <span>{bucket.label}</span>
              <span className="track">
                {/* Idle capital is green: it is the part that stayed. */}
                <span
                  className={bucket.idle ? "fill g" : "fill"}
                  data-w={Math.round(bucket.share * 100)}
                />
              </span>
              <span className="v">{money(bucket.usd)}</span>
            </div>
          ))}
        </Reveal>

        <Reveal className="card spot">
          <div className="big num">{percent(dwell.unspentShare)}</div>
          <div className="cap">of today&rsquo;s inflow, unspent</div>
          <p>
            {money(dwell.unspentUsd)} landed today and has not moved. Idle capital is the only
            inflow figure that is forward-looking — everything else has already been spent.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
