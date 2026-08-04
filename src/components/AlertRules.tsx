"use client";

import { useState, type ReactNode } from "react";

/**
 * Alert rules, with a preview of the message each one sends.
 *
 * Every message describes the flow and the wallet's verifiable properties.
 * None of them name a firm — that constraint holds in the alert copy exactly as
 * it holds in the schema (§1).
 */
interface Rule {
  key: string;
  label: ReactNode;
  message: ReactNode;
}

const RULES: Rule[] = [
  {
    key: "size",
    label: (
      <>
        Single entry over <b>$5M</b> from any source
      </>
    ),
    message: (
      <>
        <b>$6.2M</b> arrived from <b>Binance</b> at 14:21 UTC.
        <br />
        Recipient: <b>returning wallet</b> · settled in 6.4s
        <br />
        <span className="g">Still held · 4m dwell</span>
      </>
    ),
  },
  {
    key: "idle",
    label: (
      <>
        Capital that lands and stays <b>idle over 30 min</b>
      </>
    ),
    message: (
      <>
        <b>$2.8M</b> from <b>Wormhole</b> has now been idle <b>34 minutes</b>.
        <br />
        Recipient: 8KQ2…4Fda · no outbound action
        <br />
        <span className="g">Unspent capital</span>
      </>
    ),
  },
  {
    key: "fresh",
    label: (
      <>
        A <b>first-seen wallet</b> funded above $1M
      </>
    ),
    message: (
      <>
        <b>First-seen wallet</b> funded with <b>$1.4M</b> from <b>Coinbase</b>.
        <br />
        No prior Solana history · settled in 9.1s
        <br />
        <span className="g">Watching for first use</span>
      </>
    ),
  },
];

export function AlertRules() {
  const [active, setActive] = useState<string[]>(["size"]);

  const toggle = (key: string) =>
    setActive((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  const shown = RULES.find((rule) => rule.key === active[active.length - 1]);

  return (
    <>
      <h4>Alert rules</h4>
      <div className="hint">Toggle to preview the message</div>
      <div className="rules">
        {RULES.map((rule) => {
          const on = active.includes(rule.key);
          return (
            <button
              type="button"
              key={rule.key}
              className={on ? "rule on" : "rule"}
              aria-pressed={on}
              onClick={() => toggle(rule.key)}
            >
              <span className="sw" aria-hidden="true" />
              <span className="rt">{rule.label}</span>
            </button>
          );
        })}
      </div>

      <div className="tg">
        <div className="hd">
          <span className="av" aria-hidden="true" />
          <span className="nm">Tare alerts</span>
          <span className="tme">14:22 UTC</span>
        </div>
        <div className="msg" aria-live="polite">
          {shown ? (
            shown.message
          ) : (
            <span className="off">No rules active. Turn one on to see the message it sends.</span>
          )}
        </div>
      </div>
    </>
  );
}
