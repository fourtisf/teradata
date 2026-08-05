/**
 * Everything about the site that is not data.
 *
 * A dead social link on a product whose pitch is transparency costs more than a
 * missing one, so anything unset renders nothing rather than a guess.
 *
 * X and Telegram are the exception, and they earned it: both accounts exist and
 * both have had a message delivered through them, so they are facts rather than
 * plausible-looking handles. They live here with the brand and the domain for
 * the reason §11 gives for the logo — a value defined in one place cannot drift
 * between surfaces. The env vars still override, but the failure they used to
 * allow is gone: a build that shipped `NEXT_PUBLIC_X_URL` without the trailing
 * underscore produced a link to an account that does not exist, and nothing
 * caught it because a wrong link and a right one look identical to a build.
 */

export const SITE_NAME = "Tare";
export const SITE_TAGLINE = "Capital arriving on Solana, and whether it stayed.";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://taredata.com").replace(
  /\/$/,
  "",
);

function link(value: string | undefined, fallback: string | null = null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/** The handles, verified by having posted through them. */
export const X_HANDLE = "TareData_";
export const TELEGRAM_HANDLE = "taredata";

export const SOCIAL = {
  x: link(process.env.NEXT_PUBLIC_X_URL, `https://x.com/${X_HANDLE}`),
  telegram: link(process.env.NEXT_PUBLIC_TELEGRAM_URL, `https://t.me/${TELEGRAM_HANDLE}`),
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
