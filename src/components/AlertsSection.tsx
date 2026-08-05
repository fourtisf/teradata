import { AlertRules } from "@/components/AlertRules";
import { DailyCard } from "@/components/DailyCard";
import { Reveal } from "@/components/Reveal";
import { SOCIAL } from "@/lib/config/site";
import type { FlowSummary } from "@/lib/data/types";

export function AlertsSection({ summary, date }: { summary: FlowSummary; date: string }) {
  return (
    <section>
      <Reveal className="s-head">
        <span className="eyebrow">Take it with you</span>
        <h2>Alerts and a card worth posting</h2>
        <p>
          Rules run against the same matched entries, delivered before the move is obvious.
        </p>
        {/* Placed here rather than only in the footer: this is where a reader
            has just decided they want the alerts, and the two channels do not
            carry the same thing. The sentence describes the routing, which is
            true today — it does not claim posts are flowing, which they are not
            while the figures are simulated. The site-wide notice covers that. */}
        {SOCIAL.telegram || SOCIAL.x ? (
          <p className="follow">
            {SOCIAL.telegram ? (
              <a href={SOCIAL.telegram} rel="me noreferrer" target="_blank">
                Telegram
              </a>
            ) : null}
            {SOCIAL.telegram ? " carries every movement above the floor. " : null}
            {SOCIAL.x ? (
              <a href={SOCIAL.x} rel="me noreferrer" target="_blank">
                X
              </a>
            ) : null}
            {SOCIAL.x ? " carries only the largest." : null}
          </p>
        ) : null}
      </Reveal>

      <div className="take">
        <Reveal className="card pad">
          <AlertRules />
        </Reveal>
        <Reveal className="card pad">
          <DailyCard summary={summary} date={date} />
        </Reveal>
      </div>
    </section>
  );
}
