import { SITE_NAME, absoluteUrl } from "@/lib/config/site";
import type { PublicPageBase } from "@/lib/data/types";

/**
 * schema.org `Dataset` markup, per §8.
 *
 * Every figure it declares is one the page renders. `isAccessibleForFree` and
 * the measurement description are there because a dataset that does not say
 * how it was measured is worth nothing to anyone reading it programmatically —
 * which is the same argument the method section makes to humans.
 */
export function DatasetJsonLd({
  page,
  description,
  simulated,
}: {
  page: PublicPageBase;
  description: string;
  simulated: boolean;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: page.title,
    description: simulated
      ? `${description} Figures on this page are simulated and are not measurements.`
      : description,
    url: absoluteUrl(page.path),
    dateModified: page.updatedAt,
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
    measurementTechnique:
      "Bridge arrivals matched to origin deposits on each bridge's message identifier; " +
      "exchange withdrawals attributed by hot-wallet labelling; round trips removed over a " +
      "24-hour window.",
    variableMeasured: [
      {
        "@type": "PropertyValue",
        name: "Declared inbound",
        description: "Gross value arriving on Solana, before round trips are removed.",
        value: Math.round(page.summary.declaredInboundUsd),
        unitCode: "USD",
      },
      {
        "@type": "PropertyValue",
        name: "Still on Solana",
        description: "Value still on the chain when the 24-hour window closed.",
        value: Math.round(page.summary.stillOnSolanaUsd),
        unitCode: "USD",
      },
      {
        "@type": "PropertyValue",
        name: "Landed and unspent",
        description: "Value that arrived and had no qualifying outbound action.",
        value: Math.round(page.summary.unspentUsd),
        unitCode: "USD",
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Serialised, not interpolated into markup: the values are numbers and
      // strings this app produced, and JSON.stringify escapes them correctly.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
