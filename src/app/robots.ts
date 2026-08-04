import type { MetadataRoute } from "next";
import { getDataProvider } from "@/lib/data";
import { SITE_URL } from "@/lib/config/site";

/**
 * Indexing is off while the figures are simulated.
 *
 * §8's whole strategy is organic traffic, so blocking crawlers is not a
 * decision taken lightly — but the alternative is letting a search engine index
 * invented dollar amounts on canonical URLs and serve them as measurements.
 * §1 stakes the brand on the headline being defensible; ranking for fabricated
 * numbers spends that credibility permanently and is not recoverable by fixing
 * the data later.
 *
 * Setting DATA_SOURCE=live turns indexing on with no other change.
 */
export default function robots(): MetadataRoute.Robots {
  if (getDataProvider().source === "sim") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
