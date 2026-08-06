/**
 * The card image, fetched rather than re-rendered.
 *
 * `src/lib/og.tsx` already generates the daily card, already shares the mark
 * geometry with the site, and is already served at every page's
 * `opengraph-image` route. A second renderer inside the worker would be a
 * second layout to keep in step, and the two would drift the first time one of
 * them was edited alone — the same argument §11 makes for the daily-card canvas
 * drawing from the exported `MARK`.
 *
 * So the poster asks the app for the image it is already producing, over
 * loopback. If the app is down or the route fails, the post goes out as text.
 * The figures are in the words; the picture is furniture.
 */

import { CARD_ENABLED, CARD_ORIGIN } from "@/lib/social/config";

/** Telegram accepts 10MB on sendPhoto; the card is ~60KB. Anything near this is wrong. */
const MAX_BYTES = 5 * 1024 * 1024;

export async function fetchDayCard(date: string): Promise<ArrayBuffer | null> {
  if (!CARD_ENABLED) return null;
  const url = `${CARD_ORIGIN}/day/${date}/opengraph-image`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      console.warn(`[social] card ${date}: http ${response.status}`);
      return null;
    }
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      // A 200 that is not an image means the route rendered an error page, and
      // sending that as a photo would fail in a much less legible place.
      console.warn(`[social] card ${date}: expected an image, got ${type || "no content-type"}`);
      return null;
    }
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) {
      console.warn(`[social] card ${date}: ${bytes.byteLength} bytes, refusing`);
      return null;
    }
    return bytes;
  } catch (error) {
    console.warn(`[social] card ${date}: ${(error as Error).message}`);
    return null;
  }
}
