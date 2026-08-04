import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DwellSection } from "@/components/DwellSection";
import { FirstUseSection } from "@/components/FirstUseSection";
import { DatasetJsonLd } from "@/components/JsonLd";
import { PublicPageView } from "@/components/PublicPageView";
import { getDataProvider } from "@/lib/data";
import { longDate } from "@/lib/format";
import { metaDescription } from "@/lib/prose";

/**
 * §8 — one page per day, server-rendered with ISR.
 *
 * The window closes on a day's figures 24 hours after its last arrival, so a
 * past day is immutable history (§3.4) and can be cached hard. Today is still
 * moving, which is what the hourly revalidate is for.
 */
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const days = await getDataProvider().listDays(30);
  return days.map((date) => ({ date }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const page = await getDataProvider().getDayPage(date);
  if (!page) return { title: "Day not found" };
  const title = `Solana capital inflow · ${longDate(`${page.date}T00:00:00.000Z`)}`;
  const description = metaDescription(
    `Solana inflow on ${longDate(`${page.date}T00:00:00.000Z`)}`,
    page.summary,
  );
  return {
    title,
    description,
    alternates: { canonical: page.path },
    openGraph: { title, description, url: page.path, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DayPageRoute({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const provider = getDataProvider();
  const page = await provider.getDayPage(date);
  if (!page) notFound();

  const pretty = longDate(`${page.date}T00:00:00.000Z`);

  return (
    <>
      <DatasetJsonLd
        page={page}
        description={metaDescription(`Solana inflow on ${pretty}`, page.summary)}
        simulated={provider.source === "sim"}
      />
      <PublicPageView
        page={{ ...page, title: `Capital arriving on Solana, ${pretty}` }}
        eyebrow={`Day · ${page.date}`}
        crumbs={[
          { label: "Tare", href: "/" },
          { label: "Days", href: "/#arrivals" },
          { label: page.date },
        ]}
        breakdownTitle="Where the day's inflow came from"
        entriesTitle="Largest arrivals that day"
        source={provider.source}
        links={
          <>
            {page.previousDate ? (
              <a className="pg-link" href={`/day/${page.previousDate}`} rel="prev">
                ← {page.previousDate}
              </a>
            ) : null}
            {page.nextDate ? (
              <a className="pg-link" href={`/day/${page.nextDate}`} rel="next">
                {page.nextDate} →
              </a>
            ) : null}
          </>
        }
      >
        <DwellSection dwell={page.dwell} />
        <FirstUseSection rows={page.firstUse} />
      </PublicPageView>
    </>
  );
}
