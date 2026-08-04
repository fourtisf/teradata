"use client";

import { useState } from "react";
import { CONTRACT_ADDRESS } from "@/lib/config/site";

/**
 * The token contract address.
 *
 * Built now, filled in later: pass an address and it becomes a copyable chip;
 * pass nothing and it reads "coming soon". Same principle as the data layer —
 * the shape is settled before the value exists, so announcing costs one prop
 * rather than a new component.
 *
 * Deliberately neutral. Violet, green and rose each mean exactly one thing on
 * this site (§5) and none of them mean "token", so this carries no colour.
 */
export function ContractAddress({ address = CONTRACT_ADDRESS }: { address?: string | null }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  };

  if (!address) {
    return (
      <span className="ca">
        <span className="k">CA</span>
        <span className="soon">coming soon</span>
      </span>
    );
  }

  return (
    <button type="button" className="ca ca-btn" onClick={copy} aria-label={`Copy contract address ${address}`}>
      <span className="k">CA</span>
      <span className="v">{`${address.slice(0, 6)}…${address.slice(-6)}`}</span>
      <span className="soon" aria-live="polite">
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}
