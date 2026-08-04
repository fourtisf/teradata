import { notFound } from "next/navigation";
import { getDataProvider } from "@/lib/data";
import { OG_CONTENT_TYPE, OG_SIZE, renderCard } from "@/lib/og";
import { longDate } from "@/lib/format";

export const alt = "Capital arriving on Solana";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const provider = getDataProvider();
  const page = await provider.getDayPage(date);
  if (!page) notFound();
  return renderCard({
    kicker: longDate(`${page.date}T00:00:00.000Z`),
    summary: page.summary,
    caption: "arrived on Solana that day and was still here",
    simulated: provider.source === "sim",
  });
}
