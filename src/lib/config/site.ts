/**
 * Everything about the site that is not data.
 *
 * Links default to `null` rather than to a plausible-looking handle. A dead
 * social link on a product whose pitch is transparency costs more than a
 * missing one, so an unset value hides the link instead of shipping a guess.
 */

export const SITE_NAME = "Tare";
export const SITE_TAGLINE = "Capital arriving on Solana, and whether it stayed.";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://taredata.com").replace(
  /\/$/,
  "",
);

function link(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const SOCIAL = {
  x: link(process.env.NEXT_PUBLIC_X_URL),
  telegram: link(process.env.NEXT_PUBLIC_TELEGRAM_URL),
  github: link(process.env.NEXT_PUBLIC_GITHUB_URL),
  email: link(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
} as const;

export const SOCIAL_LINKS = (
  [
    ["X", SOCIAL.x],
    ["Telegram", SOCIAL.telegram],
    ["GitHub", SOCIAL.github],
  ] as const
).flatMap(([label, href]) => (href ? [{ label, href }] : []));

/**
 * The token contract address. Null until it exists — `ContractAddress` renders
 * "coming soon" and flips to a copyable chip the moment this is set.
 */
export const CONTRACT_ADDRESS = link(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS);

/**
 * Where waitlist signups go. Any endpoint that accepts a JSON POST works —
 * a form service, a webhook, a queue. Unset means the signup route answers 501
 * and the form says so, rather than accepting an address into nowhere.
 */
export const WAITLIST_WEBHOOK_URL = process.env.WAITLIST_WEBHOOK_URL?.trim() || null;

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
