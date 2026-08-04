import { Reveal } from "@/components/Reveal";
import { money } from "@/lib/format";
import type { FirstUseRow } from "@/lib/data/types";

/**
 * The widest part of the moat (§1.3): bridge explorers stop at settlement, this
 * is the part after. Structurally impossible for anyone who does not index
 * Solana DEX activity.
 */
export function FirstUseSection({ rows }: { rows: FirstUseRow[] }) {
  return (
    <section>
      <Reveal className="s-head">
        <span className="eyebrow">First use</span>
        <h2>Where it went after landing</h2>
        <p>
          Bridge explorers stop at settlement. This is the part after, traced by following the
          receiving wallet&rsquo;s first meaningful action.
        </p>
      </Reveal>

      <Reveal className="dlist">
        {rows.map((row, index) => (
          <div className="dcard" key={row.category}>
            <span className="rank num">{String(index + 1).padStart(2, "0")}</span>
            <span className="nm">
              {row.name}
              <em>{row.detail}</em>
            </span>
            <span className="track">
              <span
                className={row.category === "unspent" ? "fill g" : "fill"}
                data-w={Math.round(row.share * 100)}
              />
            </span>
            <span className="val">{money(row.usd)}</span>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
