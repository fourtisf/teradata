import { getDataProvider } from "@/lib/data";
import { OG_CONTENT_TYPE, OG_SIZE, renderCard } from "@/lib/og";
import { longDate } from "@/lib/format";

export const alt = "Tare — capital arriving on Solana, and whether it stayed";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const provider = getDataProvider();
  const [summary, status] = await Promise.all([provider.getSummary("24h"), provider.getStatus()]);
  return renderCard({
    kicker: longDate(status.updatedAt),
    summary,
    caption: "arrived on Solana today and is still here",
    simulated: provider.source === "sim",
  });
}
