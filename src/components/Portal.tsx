import { money } from "@/lib/format";
import type { OriginCard } from "@/lib/data/types";

const CHIP_POSITIONS = ["c1", "c2", "c3", "c4"] as const;

/**
 * The port of entry. The one place in the design allowed to glow (§5) — the
 * halo, the core and the rings are the whole budget for it.
 */
export function Portal({ origins }: { origins: OriginCard[] }) {
  const chips = origins.slice(0, 4);

  return (
    <div className="portal">
      <div className="halo" />
      <svg className="streams" viewBox="0 0 500 460" aria-hidden="true">
        <path d="M18 92 C 150 120, 195 190, 246 226" />
        <path style={{ animationDelay: "-.9s" }} d="M6 250 C 130 258, 180 236, 246 230" />
        <path style={{ animationDelay: "-1.6s" }} d="M486 148 C 372 176, 306 200, 254 226" />
        <path style={{ animationDelay: "-2.2s" }} d="M470 386 C 372 330, 300 262, 254 234" />
      </svg>
      <div className="rings">
        <i className="ring" />
        <i className="ring" />
        <i className="ring" />
        <i className="ring" />
        <i className="ring" />
      </div>
      <div className="core" />
      {chips.map((origin, index) => (
        <span key={origin.name} className={`chip ${CHIP_POSITIONS[index]}`}>
          {origin.name} <b className="num">{money(origin.netUsd)}</b>
        </span>
      ))}
    </div>
  );
}
