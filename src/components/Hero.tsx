import { ContractAddress } from "@/components/ContractAddress";
import { Portal } from "@/components/Portal";
import { RangeFigures } from "@/components/RangeFigures";
import type { FlowSummary, OriginCard, Range } from "@/lib/data/types";

export function Hero({
  summaries,
  origins,
}: {
  summaries: Record<Range, FlowSummary>;
  origins: OriginCard[];
}) {
  return (
    <div className="hero">
      <div>
        <span className="tagline">
          <span className="dot" /> Live · Solana port of entry
        </span>
        <h1>Capital arriving on Solana, and whether it stayed.</h1>
        <p className="sub">
          Bridges and exchange withdrawals, matched to the wallet that received them and followed
          after landing. Round trips are removed, so the number you see is money that is actually
          here.
        </p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#waitlist">
            Start watching
          </a>
          <a className="btn btn-ghost" href="#method">
            How it&rsquo;s measured
          </a>
        </div>
        <div className="ca-row">
          <ContractAddress />
        </div>
        <RangeFigures summaries={summaries} />
      </div>

      <Portal origins={origins} />
    </div>
  );
}
