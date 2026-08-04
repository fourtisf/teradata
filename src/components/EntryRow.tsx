import { count, dwell, money, seconds, shortAddress, utcTime } from "@/lib/format";
import type { Entry, EntryStatus } from "@/lib/data/types";

const STATUS_LABEL: Record<EntryStatus, string> = {
  settling: "Settling",
  held: "Held",
  deployed: "Deployed",
  reexported: "Re-exported",
};

const CONFIDENCE_LABEL = {
  matched: "matched",
  attributed: "attributed",
  unattributed: "unattributed",
} as const;

export function EntryRow({
  entry,
  open,
  isNew,
  onToggle,
}: {
  entry: Entry;
  open: boolean;
  isNew: boolean;
  onToggle: () => void;
}) {
  const traceId = `trace-${entry.id}`;
  const className = ["entry", open ? "open" : "", isNew ? "new" : ""].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <button
        type="button"
        className="row"
        aria-expanded={open}
        aria-controls={traceId}
        onClick={onToggle}
      >
        <span className="tm">{utcTime(entry.solanaTs)}</span>
        <span className="org">{entry.origin}</span>
        <span className="c-rt">{entry.route}</span>
        <span className="amt">{money(entry.amountUsd)}</span>
        <span className="c-to">
          {/* Never a firm name. Only what is verifiable about the wallet. */}
          <span className={entry.recipient.firstSeen ? "tagx first" : "tagx"}>
            {entry.recipient.firstSeen ? "first seen" : "returning"}
          </span>
        </span>
        <span className="c-dw">{dwell(entry.dwellMs)}</span>
        <span>
          <span className={`pill s-${entry.status}`}>
            <i />
            {STATUS_LABEL[entry.status]}
          </span>
        </span>
        <span className="caret" aria-hidden="true">
          ›
        </span>
      </button>

      <div className="trace" id={traceId} role="region" aria-label={`Trace for ${money(entry.amountUsd)} from ${entry.origin}`}>
        <div className="tsteps">
          <div className="ts">
            <div className="n">1 · Origin</div>
            <div className="m">{entry.origin}</div>
            <div className="d">{entry.originRef}</div>
          </div>
          <div className="ts">
            <div className="n">2 · Route</div>
            <div className="m">{entry.route}</div>
            <div className="d">{entry.routeRef}</div>
          </div>
          <div className="ts">
            <div className="n">3 · Settlement</div>
            <div className="m">Solana slot {count(entry.solanaSlot)}</div>
            <div className="d ok">landed in {seconds(entry.lagMs)}</div>
          </div>
          <div className="ts">
            <div className="n">4 · Recipient</div>
            <div className="m num">{shortAddress(entry.recipient.address)}</div>
            <div className="d">{entry.recipient.historyNote}</div>
          </div>
          <div className="ts">
            <div className="n">5 · First use</div>
            <div className="m">{entry.firstUse?.label ?? "Awaiting first action"}</div>
            <div className="d">
              {entry.dwellMs === null ? "not yet moved" : `after ${dwell(entry.dwellMs)}`}
            </div>
          </div>
        </div>
        <div className="trace-note">
          <span>
            Counted as <code>{STATUS_LABEL[entry.status].toLowerCase()}</code> · confidence{" "}
            {/* §3.2 — exchange flow is hot-wallet attribution, not protocol-level
                matching, and the row says so rather than implying otherwise. */}
            <code>{CONFIDENCE_LABEL[entry.confidence]}</code> · reclassified automatically if the
            balance leaves within 24h
          </span>
        </div>
      </div>
    </div>
  );
}
