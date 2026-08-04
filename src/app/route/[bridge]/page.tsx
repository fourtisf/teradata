import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DatasetJsonLd } from "@/components/JsonLd";
import { PublicPageView } from "@/components/PublicPageView";
import { getDataProvider } from "@/lib/data";
import { metaDescription } from "@/lib/prose";

/** §8 — one page per bridge. */
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const routes = await getDataProvider().listRoutes();
  return routes.map((route) => ({ bridge: route.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bridge: string }>;
}): Promise<Metadata> {
  const { bridge } = await params;
  const page = await getDataProvider().getRoutePage(bridge);
  if (!page) return { title: "Route not found" };
  const title = `${page.route} → Solana · settled arrivals`;
  const description = metaDescription(`${page.route} arrivals on Solana`, page.summary);
  return {
    title,
    description,
    alternates: { canonical: page.path },
    openGraph: { title, description, url: page.path, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RoutePageRoute({ params }: { params: Promise<{ bridge: string }> }) {
  const { bridge } = await params;
  const provider = getDataProvider();
  const page = await provider.getRoutePage(bridge);
  if (!page) notFound();

  const routes = await provider.listRoutes();

  return (
    <>
      <DatasetJsonLd
        page={page}
        description={metaDescription(`${page.route} arrivals on Solana`, page.summary)}
        simulated={provider.source === "sim"}
      />
      <PublicPageView
        page={page}
        eyebrow={`Route · matched on ${page.identifier}`}
        crumbs={[{ label: "Tare", href: "/" }, { label: "Routes" }, { label: page.route }]}
        breakdownTitle="Which origin chains it carried"
        entriesTitle={`Largest ${page.route} arrivals`}
        source={provider.source}
        links={routes
          .filter((route) => route.slug !== page.slug)
          .map((route) => (
            <a className="pg-link" key={route.slug} href={`/route/${route.slug}`}>
              {route.name}
            </a>
          ))}
      />
    </>
  );
}
