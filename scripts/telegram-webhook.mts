/**
 * Registers, inspects and removes the bot's webhook.
 *
 *   npm run telegram:webhook -- --info
 *   npm run telegram:webhook -- --set
 *   npm run telegram:webhook -- --set --url https://staging.example.com
 *   npm run telegram:webhook -- --delete
 *
 * Telegram holds exactly one webhook per bot token, so `--set` from a laptop
 * points the production bot at the laptop. `--info` first, always.
 *
 * The secret is not a nicety. Without `secret_token` the endpoint is an
 * unauthenticated way to make the account speak, and Telegram's delivery IPs
 * are not a control worth relying on.
 */
import { TELEGRAM } from "@/lib/alerts/config";
import { SITE_URL } from "@/lib/config/site";
import { TELEGRAM_WEBHOOK_SECRET } from "@/lib/social/config";

const argv = process.argv.slice(2);
const has = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (!TELEGRAM.token) {
  console.error("TELEGRAM_BOT_TOKEN is not set.");
  process.exit(1);
}

const api = async (method: string, body?: unknown) => {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM.token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000),
  });
  return (await response.json()) as { ok: boolean; result?: unknown; description?: string };
};

if (has("delete")) {
  const result = await api("deleteWebhook");
  console.log(result.ok ? "Webhook removed. The bot will not receive messages." : `FAIL ${result.description}`);
  process.exit(result.ok ? 0 : 1);
}

if (has("set")) {
  if (!TELEGRAM_WEBHOOK_SECRET) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not set, and the route refuses without it.");
    console.error("Generate one:  openssl rand -hex 32");
    process.exit(1);
  }
  const base = (value("url") ?? SITE_URL).replace(/\/$/, "");
  const url = `${base}/api/telegram/webhook`;
  const result = await api("setWebhook", {
    url,
    secret_token: TELEGRAM_WEBHOOK_SECRET,
    // Only messages. Every other update type would be delivered, parsed and
    // dropped, and each one is a request the route has to answer for nothing.
    allowed_updates: ["message"],
    // A backlog of commands from while the app was down is stale by the time it
    // arrives, and answering all of it at once looks like a malfunction.
    drop_pending_updates: true,
  });
  console.log(result.ok ? `Webhook set to ${url}` : `FAIL ${result.description}`);
  process.exit(result.ok ? 0 : 1);
}

const info = await api("getWebhookInfo");
if (!info.ok) {
  console.error(`FAIL ${info.description}`);
  process.exit(1);
}
const r = info.result as {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
};
console.log(`url                   ${r.url || "(none — the bot receives nothing)"}`);
console.log(`pending updates       ${r.pending_update_count ?? 0}`);
if (r.last_error_message) {
  console.log(`last error            ${r.last_error_message}`);
  console.log(`  at                  ${new Date((r.last_error_date ?? 0) * 1000).toISOString()}`);
}
