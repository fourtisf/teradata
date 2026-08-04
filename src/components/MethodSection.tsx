import { Reveal } from "@/components/Reveal";
import { exactMoney } from "@/lib/format";

/**
 * The worked example. A single wallet, one afternoon, and the gap between what
 * every other dashboard reports and what actually stayed.
 *
 * The wallet is described by what it did, never by who it might be — §1, the
 * house rule.
 */
const LEDGER = [
  { label: "Arrived from Ethereum", usd: 41_200_000, out: false },
  { label: "Arrived from Arbitrum", usd: 8_400_000, out: false },
  { label: "Returned to Ethereum", usd: -39_900_000, out: true },
  { label: "Reported as volume elsewhere", usd: 89_500_000, out: false },
];

const COUNTED_USD = 9_700_000;

export function MethodSection() {
  return (
    <section id="method">
      <Reveal className="s-head">
        <span className="eyebrow">Method</span>
        <h2>Why our number is smaller than everyone else&rsquo;s</h2>
      </Reveal>

      <div className="method">
        <Reveal className="card pad">
          <p>
            Every other dashboard reports <strong>gross bridge volume</strong>. A market maker
            moving $40M in and $40M back out within the hour adds $80M to that figure while leaving
            nothing behind.
          </p>
          <p>
            Manifest matches each arrival to the receiving wallet and watches whether the balance
            survives the window. <strong>Round trips are found and removed.</strong>
          </p>
          <p>
            That makes our headline consistently lower. It is also the only version of the number
            you can trade against.
          </p>
        </Reveal>

        <Reveal className="card pad">
          <div className="lc">One wallet · 14:02 – 15:41 UTC</div>
          {LEDGER.map((line) => (
            <div className={line.out ? "lr out" : "lr"} key={line.label}>
              <span>{line.label}</span>
              <span>{exactMoney(line.usd)}</span>
            </div>
          ))}
          <div className="lr tot">
            <span>Counted by Manifest</span>
            <span>{exactMoney(COUNTED_USD)}</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
