import { notFound } from "next/navigation";
import { getDataProvider } from "@/lib/data";
import { OG_CONTENT_TYPE, OG_SIZE, renderCard } from "@/lib/og";

export const alt = "Capital arriving on Solana";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  const provider = getDataProvider();
  const page = await provider.getOriginPage(chain);
  if (!page) notFound();
  return renderCard({
    kicker: `${page.origin} · last 30 days`,
    summary: page.summary,
    caption: `arrived from ${page.origin} and is still on Solana`,
    simulated: provider.source === "sim",
  });
}
