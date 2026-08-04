import { Reveal } from "@/components/Reveal";

interface Tier {
  name: string;
  price: string;
  period?: string;
  features: string[];
  cta: string;
  primary?: boolean;
}

const TIERS: Tier[] = [
  {
    name: "Public",
    price: "$0",
    features: [
      "Daily held figure and origin table",
      "The manifest, delayed 15 minutes",
      "Entries over $1M only",
      "Daily card",
    ],
    cta: "Open the manifest",
  },
  {
    name: "Desk",
    price: "$79",
    period: "/ month",
    features: [
      "Live manifest from $100K, no delay",
      "Full trace on every entry",
      "Dwell and first-use tracing",
      "Alert rules, Telegram under 10 seconds",
    ],
    cta: "Start",
    primary: true,
  },
  {
    name: "Data",
    price: "$490",
    period: "/ month",
    features: [
      "Everything in Desk",
      "REST and websocket feeds",
      "Full history since indexing began",
      "Re-export flags included",
    ],
    cta: "Request keys",
  },
];

export function Pricing() {
  return (
    <section id="access">
      <Reveal className="s-head">
        <span className="eyebrow">Access</span>
        <h2>Pick a seat at the port</h2>
        <p>Cancel any time. Data tier includes full matched-entry history.</p>
      </Reveal>

      <div className="tiers">
        {TIERS.map((tier) => (
          <Reveal className={tier.primary ? "card tier hot" : "card tier"} key={tier.name}>
            <span className="tn">{tier.name}</span>
            <div className="pr">
              {tier.price} {tier.period ? <small>{tier.period}</small> : null}
            </div>
            <ul>
              {tier.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            {/* Links, not wallet connections. There is no custody surface here. */}
            <a className={tier.primary ? "btn btn-primary" : "btn btn-ghost"} href="#top">
              {tier.cta}
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
