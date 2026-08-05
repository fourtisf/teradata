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
