import type { Metadata } from "next";
import { CoverageSection } from "@/components/CoverageSection";
import { Nav } from "@/components/Nav";
import { Reveal } from "@/components/Reveal";
import { SimNotice } from "@/components/SimNotice";
import { SiteFooter } from "@/components/SiteFooter";
import { getDataProvider } from "@/lib/data";
import { percent } from "@/lib/format";
import { CHANGELOG } from "@/lib/config/changelog";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Status and changelog · Tare",
  description:
    "What the indexer is doing right now, what share of inbound value we cannot attribute, " +
    "and every change to how the number is measured.",
  alternates: { canonical: "/status" },
};

/**
 * The page that makes the coverage claim checkable.
 *
 * §3.1 requires the unattributed share to be visible; §Coverage promises that
 * adding a source is announced rather than quietly backfilled. Both of those
 * are commitments to publish, so they need a page that exists.
 */
export default async function StatusPage() {
  const provider = getDataProvider();
  const [coverage, status] = await Promise.all([provider.getCoverage(), provider.getStatus()]);

  return (
    <>
      <Nav />
      {provider.source === "sim" ? <SimNotice /> : null}

      <div className="wrap" id="top">
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="/">Tare</a>
          <span aria-hidden="true">/ </span>
          <span>Status</span>
        </nav>

        <header className="pg-head">
          <span className="eyebrow">Status</span>
          <h1>What the indexer is doing, and what it is missing</h1>
          <div className="pg-prose">
            <p>
              {provider.source === "sim"
                ? "The indexer is not running. Every figure on this site is simulated until the ingest layer lands."
                : `The indexer is ${status.state}. ${percent(status.unattributedShare)} of inbound value could not be matched to an origin — it is counted in the total and excluded from the origin breakdown.`}
            </p>
            <p>
              When a source is added, historical data is backfilled and the change is recorded
              below. Numbers that move because the method changed are never presented as numbers
              that moved because the market did.
            </p>
          </div>
        </header>

        <CoverageSection coverage={coverage} status={status} source={provider.source} />

        <section>
          <Reveal className="s-head">
            <span className="eyebrow">Changelog</span>
            <h2>Every change to how the number is measured</h2>
            <p>
              Method changes, coverage additions and corrections. Cosmetic work is not listed —
              only things that could move a figure.
            </p>
          </Reveal>

          <Reveal className="log">
            {CHANGELOG.map((entry) => (
              <div className="log-row" key={`${entry.date}-${entry.title}`}>
                <span className="log-date num">{entry.date}</span>
                <span className={`log-kind log-${entry.kind}`}>{entry.kind}</span>
                <span className="log-body">
                  <b>{entry.title}</b>
                  <em>{entry.detail}</em>
                </span>
              </div>
            ))}
          </Reveal>
        </section>

        <SiteFooter />
      </div>
    </>
  );
}
