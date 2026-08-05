/**
 * Telegram delivery.
 *
 * The Bot API over plain fetch — no SDK. sendMessage is one POST, and a
 * dependency that wraps one POST is a dependency to keep patched forever.
 */

import { TELEGRAM } from "@/lib/alerts/config";
import type { DeliveryResult } from "@/lib/alerts/types";

export function telegramConfigured(): boolean {
  return Boolean(TELEGRAM.token && TELEGRAM.chatId);
}

export async function sendTelegram(text: string): Promise<DeliveryResult> {
  if (!telegramConfigured()) {
    return { channel: "telegram", ok: false, reason: "not configured" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM.chatId,
        text,
        parse_mode: "HTML",
        // The permalink is for the reader to follow, not for Telegram to
        // unfurl into a card that buries the figure.
        disable_web_page_preview: true,
      }),
      // §P5 promises event-to-alert under ten seconds. A transport allowed to
      // hang for thirty defeats that on its own.
      signal: AbortSignal.timeout(8000),
    });

    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };

    if (!response.ok || !body.ok) {
      return {
        channel: "telegram",
        ok: false,
        reason: body.description ?? `http ${response.status}`,
      };
    }
    return { channel: "telegram", ok: true, id: String(body.result?.message_id ?? "") };
  } catch (error) {
    return { channel: "telegram", ok: false, reason: (error as Error).message };
  }
}

/** Telegram's own limit on a photo caption. Longer and the API rejects the call. */
export const CAPTION_LIMIT = 1024;

/**
 * The same message with the daily card above it.
 *
 * Telegram is the one channel where the image is worth uploading: the text
 * message sets `disable_web_page_preview`, so a link does not unfurl into
 * anything, and the card is what makes the post readable in a scroll. X gets
 * the card for free by unfurling the permalink's Open Graph tags, which is why
 * `sendX` has no media path and no multipart upload to keep working.
 *
 * The caller decides what to do with a failure, and `runner.ts` deliberately
 * does not retry it as a plain message in the same pass: a timeout after
 * Telegram accepted the photo looks exactly like a rejection, so the fallback
 * would turn a lost response into a guaranteed second copy.
 */
export async function sendTelegramPhoto(
  caption: string,
  image: ArrayBuffer,
): Promise<DeliveryResult> {
  if (!telegramConfigured()) {
    return { channel: "telegram", ok: false, reason: "not configured" };
  }
  if (caption.length > CAPTION_LIMIT) {
    return { channel: "telegram", ok: false, reason: `caption is ${caption.length} chars` };
  }

  try {
    const form = new FormData();
    form.append("chat_id", TELEGRAM.chatId!);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([image], { type: "image/png" }), "tare-card.png");

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM.token}/sendPhoto`, {
      method: "POST",
      body: form,
      // Longer than sendMessage's eight seconds because this one carries an
      // upload. Scheduled posts are not on the under-10s path — that promise is
      // about a movement reaching a phone, not about a recap of a closed day.
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };

    if (!response.ok || !body.ok) {
      return {
        channel: "telegram",
        ok: false,
        reason: body.description ?? `http ${response.status}`,
      };
    }
    return { channel: "telegram", ok: true, id: String(body.result?.message_id ?? "") };
  } catch (error) {
    return { channel: "telegram", ok: false, reason: (error as Error).message };
  }
}
