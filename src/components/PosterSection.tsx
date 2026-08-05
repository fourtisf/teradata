import { Reveal } from "@/components/Reveal";
import { SOCIAL } from "@/lib/config/site";
import { count, utcTime } from "@/lib/format";
import { spokenDate, spokenDay } from "@/lib/social/time";
import type { PosterState, PublishedRecap } from "@/lib/social/state";
import type { DataSource } from "@/lib/data/types";

/** "00:05 UTC, 6 August 2026". */
function when(atMs: number): string {
  const iso = new Date(atMs).toISOString();
  return `${utcTime(iso)} UTC, ${spokenDate(iso.slice(0, 10))}`;
}

function published(recap: PublishedRecap): string {
  const channels = recap.channels
    .map((channel) => (channel === "x" ? "X" : "Telegram"))
    .join(" and ");
  // "3 August 2026" for a day, "26 July – 1 August 2026" for a week: the year
  // is stated once, at the end, where it is not doing any work twice.
  const period =
    recap.from === recap.to
      ? spokenDate(recap.to)
      : `${spokenDay(recap.from)} – ${spokenDate(recap.to)}`;
  return `${period} · ${channels}`;
}

/**
 * What the two accounts have published, and when the next one is due.
 *
 * On the status page for the same reason the unattributed share is (§3.1, §7):
 * it is a limit of the product stated where a reader can check it. Someone who
 * follows X and sees three posts in a week where Telegram had twenty should be
 * able to find out that the free tier allows 500 a month and the recaps have
 * first call on them — rather than conclude the feed is broken.
 */
export function PosterSection({ state, source }: { state: PosterState; source: DataSource }) {
  const simulated = source === "sim";

  return (
    <section id="feed">
      <Reveal className="s-head">
        <span className="eyebrow">The feed</span>
        <h2>What gets posted, and when</h2>
        <p>
          A recap every day, and one a week. Both are published to{" "}
          {SOCIAL.telegram ? <a href={SOCIAL.telegram} rel="me noreferrer" target="_blank">Telegram</a> : "Telegram"}
          {" and "}
          {SOCIAL.x ? <a href={SOCIAL.x} rel="me noreferrer" target="_blank">X</a> : "X"} by a
          scheduled process, not by hand.
        </p>
      </Reveal>

      <Reveal className="card pad">
        <div className="pg-prose">
          <p>
            {simulated
              ? "Nothing has been published and nothing will be until the figures are measured. " +
                "The poster runs and refuses on every firing: a page can carry a label saying it is " +
                "simulated, and a forwarded message cannot."
              : "The daily recap covers the most recent day whose 24-hour windows have all closed — " +
                "not yesterday. A held figure is provisional until every arrival that day has been " +
                "watched for the full window, and it can only move down as round trips close. The " +
                "site restamps a row in front of you when that happens. A post cannot be restamped, " +
                "so it waits for a number that will not move."}
          </p>
          <p>
            X carries the same two recaps and only the largest single movements. Its free tier
            allows 500 posts a month, so the recaps are given first call on the allowance and
            movement alerts stop earlier — a movement not announced is one gap in the record, a
            month with no recaps is the account going quiet.
          </p>
        </div>

        <div className="status">
          <div className="st">
            <div className="k">Last daily recap</div>
            <div className="v">
              {state.lastDaily ? published(state.lastDaily) : simulated ? "None — simulated" : "None yet"}
            </div>
          </div>
          <div className="st">
            <div className="k">Last weekly recap</div>
            <div className="v">
              {state.lastWeekly ? published(state.lastWeekly) : simulated ? "None — simulated" : "None yet"}
            </div>
          </div>
          {state.next.map((entry) => (
            <div className="st" key={entry.kind}>
              <div className="k">Next {entry.kind} due</div>
              <div className="v">{when(entry.atMs)}</div>
            </div>
          ))}
          <div className="st">
            <div className="k">X posts this month</div>
            <div className="v num">
              {state.available ? `${count(state.xUsedThisMonth)} / ${count(state.xCap)}` : "—"}
            </div>
          </div>
        </div>

        {!state.available ? (
          <small>
            The record of what has been published is not readable from here, so the figures above
            are blank rather than zero. It is written by the process that posts, and this page is
            being served from somewhere that does not share a disk with it.
          </small>
        ) : null}
      </Reveal>
    </section>
  );
}
