import type { ReactNode } from "react";
import { Reveal } from "@/components/Reveal";

/**
 * The objections a trading desk raises in the first thirty seconds.
 *
 * Each answer concedes the limit rather than talking around it. A flow number
 * is only worth as much as the honesty about its edges, and that applies to
 * the sales copy as much as the coverage section.
 */
const QUESTIONS: Array<{ q: string; a: ReactNode }> = [
  {
    q: "What does re-exported mean?",
    a: (
      <>
        Money that arrived on Solana and then <strong>left the chain again</strong> — bridged out to
        another chain, or sent back into an exchange. It came in, it did not stay, so we subtract it.
        Three things that look similar are <em>not</em> re-exports, because the value is still here:
        swapping into another token, putting it into lending, an LP or staking, and sending it to
        another Solana wallet. If only part of the arrival leaves, only that part is subtracted.
      </>
    ),
  },
  {
    q: "What does idle capital mean?",
    a: (
      <>
        Money that arrived and has done <strong>nothing at all</strong> since — not swapped, not
        deposited anywhere, not sent on. It is sitting in the wallet exactly where it landed. It is
        the only figure on this site that points forward rather than back: every other number is
        money that has already been committed, and this one is buying power that has not been spent
        yet.
      </>
    ),
  },
  {
    q: "Why is your number smaller than DefiLlama's?",
    a: (
      <>
        Because theirs is gross and ours is net. A market maker moving $40M in and $40M back out
        adds $80M to a gross figure and nothing to ours. Neither number is wrong — they answer
        different questions, and only one of them is &ldquo;did new money arrive&rdquo;.
      </>
    ),
  },
  {
    q: "How do you know a transfer is an exchange withdrawal?",
    a: (
      <>
        We do not know it, we attribute it. A transfer out of a labelled hot wallet to a
        non-exchange address, above the size floor, is recorded as{" "}
        <code>confidence: attributed</code> — a weaker class than a bridge arrival, which is
        matched on the bridge&rsquo;s own message identifier. Every entry carries which one it is,
        and the API lets you filter to matched only.
      </>
    ),
  },
  {
    q: "What if I disagree with the 24-hour window?",
    a: (
      <>
        Reasonable — 12h and 48h produce visibly different headline numbers. The window is a
        stated assumption, not a discovered constant, and the sensitivity check against real volume
        is a published open decision rather than something buried. The API returns per-entry
        timestamps so you can re-cut it yourself.
      </>
    ),
  },
  {
    q: "A wallet swapped its arrival for SOL. Did the capital stay?",
    a: (
      <>
        We count it as stayed, because the value is still on Solana — it changed asset, it did not
        leave. The honest limit: we follow the receiving wallet, not the chain&rsquo;s net position,
        and we stop after one hop. If the counterparty on that swap bridged out, we did not see it.
      </>
    ),
  },
  {
    q: "What do you not cover?",
    a: (
      <>
        OTC settlement, peer-to-peer transfers, smaller regional exchanges and anything under the
        size floor. These are excluded from the headline rather than estimated. Arrivals we cannot
        match at all are counted in the total, kept out of the origin breakdown, and their share is
        published on the status page.
      </>
    ),
  },
  {
    q: "Do you name the wallets?",
    a: (
      <>
        Never. Wallets are described only by what is verifiable — first seen or returning, funded
        from which venue, idle for how long. There is no firm-name field in the schema and there
        will not be one. Pattern-based identity attribution is a lawsuit and a credibility collapse
        in one move.
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="faq">
      <Reveal className="s-head">
        <span className="eyebrow">Questions</span>
        <h2>The objections, answered</h2>
        <p>Including the ones where the honest answer is a limit rather than a feature.</p>
      </Reveal>

      <div className="faq">
        {QUESTIONS.map((item) => (
          <Reveal className="faq-item" key={item.q}>
            <details>
              <summary>
                <span>{item.q}</span>
                <span className="faq-mark" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq-a">{item.a}</div>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
