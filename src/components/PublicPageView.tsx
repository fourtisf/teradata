import type { ReactNode } from "react";
import { EntryTable } from "@/components/EntryTable";
import { FlowChart } from "@/components/FlowChart";
import { Nav } from "@/components/Nav";
import { Reveal } from "@/components/Reveal";
import { SimNotice } from "@/components/SimNotice";
import { SiteFooter } from "@/components/SiteFooter";
import { count, money, percent, seconds } from "@/lib/format";
import type { BreakdownRow, DataSource, PublicPageBase } from "@/lib/data/types";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The shared body of every §8 page.
 *
 * All three — day, origin, route — are the same document: figures, prose
 * generated from those figures, the chart, a breakdown, and the entries behind
 * it. Keeping them one component means a crawler and a reader get the same
 * structure everywhere, and one fix reaches all of them.
 */
export function PublicPageView({
  page,
  eyebrow,
  crumbs,
  breakdownTitle,
  entriesTitle,
  source,
  children,
  links,
}: {
  page: PublicPageBase;
  eyebrow: string;
  crumbs: Crumb[];
  breakdownTitle: string;
  entriesTitle: string;
  source: DataSource;
  /** Extra sections, rendered between the breakdown and the entries. */
  children?: ReactNode;
  /** Sibling pages, so the internal-link graph §8 needs actually exists. */
  links?: ReactNode;
}) {
  const { summary } = page;
  const heldShare =
    summary.declaredInboundUsd > 0 ? summary.stillOnSolanaUsd / summary.declaredInboundUsd : 0;

  return (
    <>
      <Nav />
      {source === "sim" ? <SimNotice /> : null}

      <div className="wrap" id="top">
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={crumb.label}>
              {index > 0 ? <span aria-hidden="true">/ </span> : null}
              {crumb.href ? <a href={crumb.href}>{crumb.label}</a> : <span>{crumb.label}</span>}
            </span>
          ))}
        </nav>

        <header className="pg-head">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{page.title}</h1>

          <div className="hero-figs pg-figs">
            <div className="fig">
              <div className="v num">{money(summary.declaredInboundUsd)}</div>
              <div className="k">Declared inbound</div>
            </div>
            <div className="fig gd">
              <div className="v num">{money(summary.stillOnSolanaUsd)}</div>
              <div className="k">Still on Solana · {percent(heldShare, 0)}</div>
            </div>
            <div className="fig">
              <div className="v num">{money(summary.unspentUsd)}</div>
              <div className="k">Landed and unspent</div>
            </div>
          </div>

          <div className="pg-prose">
            {page.prose.map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
          </div>

          {links ? <div className="pg-links">{links}</div> : null}
        </header>

        <section>
          <Reveal className="s-head">
            <span className="eyebrow">Net inflow</span>
            <h2>Gross against what stayed</h2>
            <p>
              The gap between the two bars is round-trip capital. Bars below the line are days
              where more value left than arrived.
            </p>
          </Reveal>
          <FlowChart series={page.daily} />
        </section>

        <section>
          <Reveal className="s-head">
            <span className="eyebrow">Breakdown</span>
            <h2>{breakdownTitle}</h2>
          </Reveal>
          <Reveal>
            <Breakdown rows={page.breakdown} />
          </Reveal>
        </section>

        {children}

        <section>
          <Reveal className="s-head">
            <span className="eyebrow">Arrivals</span>
            <h2>{entriesTitle}</h2>
            <p>
              Click any line to open its trace: origin transaction, settlement, recipient, and what
              the capital did first.
            </p>
          </Reveal>
          <Reveal>
            <EntryTable entries={page.topEntries} />
          </Reveal>
          <p className="pg-foot num">
            {count(summary.entryCount)} matched entries · median settlement lag{" "}
            {seconds(summary.medianLagMs)}
          </p>
        </section>

        <SiteFooter />
      </div>
    </>
  );
}

function Breakdown({ rows }: { rows: BreakdownRow[] }) {
  const max = rows.reduce((best, row) => Math.max(best, row.usd), 0) || 1;
  return (
    <div className="brk">
      {rows.map((row) => (
        <div className="brk-row" key={row.slug}>
          <span className="nm">{row.name}</span>
          <span className="track">
            <span className="fill" data-w={Math.round((row.usd / max) * 100)} />
          </span>
          <span className="val">{money(row.usd)}</span>
        </div>
      ))}
    </div>
  );
}
