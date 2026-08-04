import { Reveal } from "@/components/Reveal";
import { StatusStrip } from "@/components/StatusStrip";
import type { Coverage, DataSource, IndexerStatus } from "@/lib/data/types";

/** A flow number is only worth as much as the honesty about its edges. */
export function CoverageSection({
  coverage,
  status,
  source,
}: {
  coverage: Coverage;
  status: IndexerStatus;
  source: DataSource;
}) {
  return (
    <section id="coverage">
      <Reveal className="s-head">
        <span className="eyebrow">Coverage</span>
        <h2>What we index, and what we don&rsquo;t</h2>
        <p>A flow number is only worth as much as the honesty about its edges.</p>
      </Reveal>

      <div className="cov">
        <Reveal className="card pad">
          <h4>Indexed today</h4>
          <div className="chips">
            {coverage.indexed.map((name) => (
              <span className="cchip" key={name}>
                <i />
                {name}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal className="card pad">
          <h4>Not covered yet</h4>
          <div className="chips">
            {coverage.notCovered.map((name) => (
              <span className="cchip no" key={name}>
                <i />
                {name}
              </span>
            ))}
          </div>
          <small>
            These are excluded from the headline figure rather than estimated. When a source is
            added, historical data is backfilled and the change is noted on the status page.
          </small>
        </Reveal>
      </div>

      <Reveal>
        <StatusStrip status={status} source={source} />
      </Reveal>
    </section>
  );
}
