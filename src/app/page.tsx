import { AlertsSection } from "@/components/AlertsSection";
import { CoverageSection } from "@/components/CoverageSection";
import { DwellSection } from "@/components/DwellSection";
import { FirstUseSection } from "@/components/FirstUseSection";
import { FlowChart } from "@/components/FlowChart";
import { Hero } from "@/components/Hero";
import { ManifestFeed } from "@/components/ManifestFeed";
import { MethodSection } from "@/components/MethodSection";
import { Nav } from "@/components/Nav";
import { OriginsSection } from "@/components/OriginsSection";
import { Pricing } from "@/components/Pricing";
import { Reveal } from "@/components/Reveal";
import { SiteFooter } from "@/components/SiteFooter";
import { getDataProvider } from "@/lib/data";

/**
 * The manifest is a live surface: it is rendered per request rather than cached,
 * so the freshness indicator and the feed are not counting up from a stale
 * snapshot. The ISR'd public pages in §8 — /origin, /route, /day — are P6 and
 * have the opposite requirement.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const provider = getDataProvider();
  const snapshot = await provider.getHomeSnapshot();
  const today = snapshot.summaries["24h"];

  return (
    <>
      <Nav />

      <div className="wrap" id="top">
        <Hero summaries={snapshot.summaries} origins={snapshot.origins} />

        <section>
          <Reveal className="s-row">
            <div className="s-head" style={{ marginBottom: 0 }}>
              <span className="eyebrow">Net inflow</span>
              <h2>Thirty days of gross against what stayed</h2>
              <p>
                The gap between the two bars is the round-trip capital every other dashboard counts
                as inflow.
              </p>
            </div>
          </Reveal>
          <FlowChart series={snapshot.daily} />
        </section>

        <section>
          <Reveal className="s-head">
            <span className="eyebrow">The manifest</span>
            <h2>Every entry over $100K, as it lands</h2>
            <p>
              Click any line to open its trace: origin transaction, settlement, recipient, and what
              the capital did first.
            </p>
          </Reveal>
          <Reveal>
            <ManifestFeed
              initialEntries={snapshot.entries}
              entryCount={today.entryCount}
              medianLagMs={today.medianLagMs}
              lastSlot={snapshot.status.lastSlot}
              source={provider.source}
            />
          </Reveal>
        </section>

        <DwellSection dwell={snapshot.dwell} />
        <FirstUseSection rows={snapshot.firstUse} />
        <OriginsSection origins={snapshot.origins} />
        <MethodSection />
        <AlertsSection summary={today} date={snapshot.status.updatedAt} />
        <CoverageSection coverage={snapshot.coverage} status={snapshot.status} />
        <Pricing />
        <SiteFooter />
      </div>
    </>
  );
}
