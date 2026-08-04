import { notFound } from "next/navigation";
import { getDataProvider } from "@/lib/data";
import { OG_CONTENT_TYPE, OG_SIZE, renderCard } from "@/lib/og";

export const alt = "Capital arriving on Solana";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ bridge: string }> }) {
  const { bridge } = await params;
  const provider = getDataProvider();
  const page = await provider.getRoutePage(bridge);
  if (!page) notFound();
  return renderCard({
    kicker: `${page.route} · last 30 days`,
    summary: page.summary,
    caption: `settled through ${page.route} and is still on Solana`,
    simulated: provider.source === "sim",
  });
}
