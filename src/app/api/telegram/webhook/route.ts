import { NextResponse } from "next/server";
import { sendTelegram } from "@/lib/alerts/telegram";
import { getDataProvider } from "@/lib/data";
import { parseCommand, replyTo } from "@/lib/social/commands";
import { TELEGRAM_WEBHOOK_SECRET } from "@/lib/social/config";
import { getPosterState } from "@/lib/social/state";

/**
 * Where Telegram delivers messages sent to the bot.
 *
 * A webhook rather than a `getUpdates` loop: the app is already public behind
 * nginx with TLS, so this is a route instead of a second polling process with
 * a durable offset to keep. Telegram's own `secret_token` authenticates it, so
 * there is no scheme to invent either.
 *
 * The reply goes to the chat that asked, never to `TELEGRAM_CHAT_ID` — sending
 * one person's answer to the broadcast channel would publish their question to
 * every subscriber.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram redelivers an update it did not get a prompt 200 for, and a retry
 * of a command it already answered is a second identical message in the chat.
 * In-process, which is right for one instance — the same constraint, and the
 * same eventual move to Redis, as the alert dedupe.
 */
const answered = new Map<number, number>();
const DEDUPE_MS = 10 * 60_000;

/** One command per chat per few seconds. Not a security control, a manners one. */
const lastCommand = new Map<number, number>();
const COOLDOWN_MS = 3_000;

function sweep(now: number) {
  for (const [id, at] of answered) if (now - at > DEDUPE_MS) answered.delete(id);
  for (const [id, at] of lastCommand) if (now - at > DEDUPE_MS) lastCommand.delete(id);
}

interface Update {
  update_id?: number;
  message?: { chat?: { id?: number }; text?: string };
}

export async function POST(request: Request) {
  if (!TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "TELEGRAM_WEBHOOK_SECRET is not set; the webhook is closed." },
      { status: 501 },
    );
  }
  if (request.headers.get("x-telegram-bot-api-secret-token") !== TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  // Telegram only needs to know the update was taken. Every decision below is
  // ours, and a non-200 would make it redeliver something we chose to ignore.
  const ack = (handled: string) => NextResponse.json({ ok: true, handled });

  const chatId = update.message?.chat?.id;
  const text = update.message?.text;
  if (typeof chatId !== "number" || typeof text !== "string") return ack("ignored");

  const command = parseCommand(text);
  if (!command) return ack("not a command");

  const now = Date.now();
  sweep(now);

  if (typeof update.update_id === "number" && answered.has(update.update_id)) {
    return ack("duplicate");
  }
  if (now - (lastCommand.get(chatId) ?? 0) < COOLDOWN_MS) return ack("cooling down");

  const provider = getDataProvider();
  const poster = await getPosterState(now);
  const reply = await replyTo(command, provider, poster);
  const sent = await sendTelegram(reply, chatId);

  // Both records are written on success and neither on failure, which is what
  // makes Telegram's retry work. Marking the update answered before sending
  // would swallow the retry of a send that failed; starting the chat cooldown
  // before sending would block it, since a retry arrives inside the cooldown by
  // definition. The cost is the usual at-least-once one: a send that succeeded
  // but whose response we lost is answered twice.
  if (sent.ok) {
    if (typeof update.update_id === "number") answered.set(update.update_id, now);
    lastCommand.set(chatId, now);
  }
  return ack(sent.ok ? command : `failed: ${sent.reason}`);
}
