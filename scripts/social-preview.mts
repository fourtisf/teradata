/**
 * Renders scheduled posts without credentials and without sending anything.
 *
 *   npm run social:preview          # a fortnight of dailies, and the weekly
 *   npm run social:preview -- --all # every variant, forced
 *
 * `--all` is the one to run after editing `compose.ts`: it renders every
 * variant on both channels and exits non-zero if any X post would break 280
 * once a t.co link is counted, or any Telegram post would break the caption
 * limit that lets the card be attached.
 *
 * The sibling of `alert-preview.mts`, and for the same reason — copy is the one
 * part of this system with no test that can tell you it is wrong, so it has to
 * be read.
 */
import { CAPTION_LIMIT } from "@/lib/alerts/telegram";
import { SimProvider } from "@/lib/data/sim";
import { VARIANTS, composeDaily, composeWeekly, dailyContext, weeklyContext } from "@/lib/social/compose";
import { dailyFigures, weeklyFigures } from "@/lib/social/figures";
import { occurrenceKey, settledDate, settledWeek } from "@/lib/social/schedule";
import { shiftDate } from "@/lib/social/time";
import type { JobSpec } from "@/lib/social/types";

const NOW = Date.parse("2026-08-07T00:05:00Z");
const X_LIMIT = 280;
const T_CO = 23;

const provider = new SimProvider({ now: () => NOW });
const rule = (s: string) => console.log(`\n${"─".repeat(76)}\n${s}\n${"─".repeat(76)}`);

let failures = 0;

/** X counts every link as 23 characters, whatever it actually is. */
function xLength(post: string): number {
  const [body = "", link = ""] = post.split("\n");
  return body.length + 1 + (link ? T_CO : 0);
}

function report(telegram: string, x: string, carded: boolean) {
  console.log(`\n▸ telegram${carded ? "  (card attached, so the text is the caption)" : ""}`);
  console.log(telegram);
  const captionOver = carded && telegram.length > CAPTION_LIMIT;
  if (captionOver) failures++;
  console.log(
    `  ${telegram.length}/${CAPTION_LIMIT} caption${captionOver ? "  ** OVER — the card would be dropped **" : ""}`,
  );

  const len = xLength(x);
  if (len > X_LIMIT) failures++;
  console.log(`\n▸ x  (${len}/${X_LIMIT}${len > X_LIMIT ? "  ** OVER **" : ""})`);
  console.log(x);
}

const DAILY_SPEC: JobSpec = { kind: "daily", atMinuteUtc: 5, weekday: null, maxLatenessMs: 0 };
const WEEKLY_SPEC: JobSpec = { kind: "weekly", atMinuteUtc: 20, weekday: 1, maxLatenessMs: 0 };

if (process.argv.includes("--all")) {
  // Force each variant rather than letting the hash choose, so a phrasing that
  // only fires on a rare day is still read before it ships.
  const figures = await dailyFigures(provider, settledDate(NOW));
  const week = await weeklyFigures(provider, settledWeek(NOW));
  if (!figures || !week) {
    console.error("The sim provider returned no figures for the settled period.");
    process.exit(1);
  }

  const outflow = {
    ...figures,
    netOutflow: true,
    summary: { ...figures.summary, stillOnSolanaUsd: 0, reexportedUsd: figures.summary.declaredInboundUsd },
  };

  rule(`daily  ·  ${VARIANTS.daily.length} variants`);
  for (const variant of VARIANTS.daily) {
    const context = dailyContext(variant.id === "net-outflow" ? outflow : figures);
    const applies = !variant.when || variant.when(context);
    console.log(`\n[${variant.id}]${applies ? "" : "  (gated off for this fixture)"}`);
    report(
      [`${variant.mark(context)} <b>${variant.title(context)}</b>`, "", variant.telegram(context).join("\n\n"), "", context.link].join("\n"),
      `${variant.x(context)}\n${context.link}`,
      true,
    );
  }

  rule(`weekly  ·  ${VARIANTS.weekly.length} variants`);
  for (const variant of VARIANTS.weekly) {
    const context = weeklyContext(week);
    const applies = !variant.when || variant.when(context);
    console.log(`\n[${variant.id}]${applies ? "" : "  (gated off for this fixture)"}`);
    report(
      [`${variant.mark(context)} <b>${variant.title(context)}</b>`, "", variant.telegram(context).join("\n\n"), "", context.link].join("\n"),
      `${variant.x(context)}\n${context.link}`,
      false,
    );
  }
} else {
  // A fortnight, as the account would actually have run it: the variant is
  // chosen by the occurrence key, so this is the real sequence a follower sees
  // and the place a repeated phrasing two days apart becomes obvious.
  rule("fourteen days, as posted");
  const end = settledDate(NOW);
  for (let i = 13; i >= 0; i--) {
    const date = shiftDate(end, -i);
    const figures = await dailyFigures(provider, date);
    if (!figures) {
      console.log(`\n${date}  — no figures, nothing would be posted`);
      continue;
    }
    // The key is the firing, which is two days after the day it describes.
    const key = occurrenceKey(DAILY_SPEC, Date.parse(`${shiftDate(date, 2)}T00:05:00Z`));
    const post = composeDaily(key, figures, "live");
    console.log(`\n${key}`);
    report(post.telegram, post.x, true);
  }

  rule("weekly");
  const week = await weeklyFigures(provider, settledWeek(NOW));
  if (week) {
    const post = composeWeekly(occurrenceKey(WEEKLY_SPEC, NOW), week, "live");
    report(post.telegram, post.x, false);
  } else {
    console.log("\nno complete week of settled days, nothing would be posted");
  }
}

console.log(
  `\n${failures ? `FAIL: ${failures} message(s) over a limit` : "Every message is inside the X and caption limits."}`,
);
process.exit(failures ? 1 : 0);
