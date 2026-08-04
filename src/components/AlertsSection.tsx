import { AlertRules } from "@/components/AlertRules";
import { DailyCard } from "@/components/DailyCard";
import { Reveal } from "@/components/Reveal";
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
