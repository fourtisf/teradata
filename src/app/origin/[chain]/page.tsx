import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DatasetJsonLd } from "@/components/JsonLd";
import { PublicPageView } from "@/components/PublicPageView";
import { getDataProvider } from "@/lib/data";
import { metaDescription } from "@/lib/prose";

/** §8 — one page per origin chain or venue. */
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const origins = await getDataProvider().listOrigins();
  return origins.map((origin) => ({ chain: origin.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chain: string }>;
}): Promise<Metadata> {
  const { chain } = await params;
  const page = await getDataProvider().getOriginPage(chain);
  if (!page) return { title: "Origin not found" };
  const title = `${page.origin} → Solana · capital inflow`;
  const description = metaDescription(`Inflow from ${page.origin}`, page.summary);
  return {
    title,
    description,
    alternates: { canonical: page.path },
    openGraph: { title, description, url: page.path, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function OriginPageRoute({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  const provider = getDataProvider();
  const page = await provider.getOriginPage(chain);
  if (!page) notFound();

  const [origins, routes] = await Promise.all([provider.listOrigins(), provider.listRoutes()]);

  return (
    <>
      <DatasetJsonLd
        page={page}
        description={metaDescription(`Inflow from ${page.origin}`, page.summary)}
        simulated={provider.source === "sim"}
      />
      <PublicPageView
        page={page}
        eyebrow={`Origin · ${page.attribution}`}
        crumbs={[{ label: "Tare", href: "/" }, { label: "Origins" }, { label: page.origin }]}
        breakdownTitle={
          page.kind === "bridge" ? "Which routes carried it" : "What arrived, by asset"
        }
        entriesTitle={`Largest arrivals from ${page.origin}`}
        source={provider.source}
        links={
          <>
            {origins
              .filter((origin) => origin.slug !== page.slug)
              .map((origin) => (
                <a className="pg-link" key={origin.slug} href={`/origin/${origin.slug}`}>
                  {origin.name}
                </a>
              ))}
            {page.kind === "bridge"
              ? routes.map((route) => (
                  <a className="pg-link" key={route.slug} href={`/route/${route.slug}`}>
                    {route.name}
                  </a>
                ))
              : null}
          </>
        }
      />
    </>
  );
}
