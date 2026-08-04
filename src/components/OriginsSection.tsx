import { Reveal } from "@/components/Reveal";
import { money, signedPercent } from "@/lib/format";
import type { OriginCard } from "@/lib/data/types";

const SPARK_W = 100;
const SPARK_H = 26;

/** Min-max normalised path across the card, inset so the stroke is not clipped. */
function sparkPath(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = SPARK_W / (values.length - 1);

  return values
    .map((value, index) => {
      const x = index * step;
      const y = SPARK_H - 3 - ((value - min) / span) * (SPARK_H - 6);
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function OriginsSection({ origins }: { origins: OriginCard[] }) {
  return (
    <section>
      <Reveal className="s-head">
        <span className="eyebrow">Origins</span>
        <h2>Net inflow by source, after re-exports</h2>
        <p>
          Each card carries its own seven-day shape, so a spike is visible without opening anything.
        </p>
      </Reveal>

      <Reveal className="ogrid">
        {origins.map((origin) => (
          <div className="ocard" key={origin.name}>
            <div className="nm">{origin.name}</div>
            <div className="vl num">{money(origin.netUsd)}</div>
            {/* Green only when the delta is positive — it means more capital
                stayed than the seven-day average. A fall is neutral, not rose:
                rose is reserved for capital that left. */}
            <div className={origin.deltaPct > 0 ? "dl up" : "dl"}>
              {signedPercent(origin.deltaPct)} vs 7d avg
            </div>
            <svg className="spark" viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" aria-hidden="true">
              <path
                d={sparkPath(origin.spark)}
                fill="none"
                stroke={origin.deltaPct > 0 ? "var(--green)" : "var(--txt-3)"}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
