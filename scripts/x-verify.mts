/**
 * Checks the four X credentials without publishing anything.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/x-verify.mts
 *
 * The obvious test is to post something and delete it. The account is public,
 * so that test is visible to everyone for as long as it takes to notice — and
 * a deleted post is still a post that existed. This signs a read instead.
 *
 * What it proves: the consumer key, consumer secret, access token and access
 * secret are valid together, and the app is attached to the right account.
 *
 * What it cannot prove: that the app has write permission. X grants that at the
 * app level, and an access token minted *before* permissions were set to
 * "Read and write" stays read-only for its whole life — the console shows
 * Read and write while the token does not have it. That failure surfaces as a
 * 403 on the first real post with a message that never mentions the cause. If
 * this script passes and posting still 403s, regenerate the access token and
 * secret; nothing else needs to change.
 */
import { authorizationHeader, xConfigured } from "@/lib/alerts/x";

if (!xConfigured()) {
  console.error("Not configured. X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and");
  console.error("X_ACCESS_SECRET must all be set in the environment.");
  process.exit(1);
}

const URL_ME = "https://api.twitter.com/2/users/me";

const response = await fetch(URL_ME, {
  headers: { authorization: authorizationHeader("GET", URL_ME) },
  signal: AbortSignal.timeout(8000),
});

const body = (await response.json().catch(() => ({}))) as {
  data?: { id?: string; name?: string; username?: string };
  detail?: string;
  title?: string;
};

if (!response.ok) {
  console.error(`FAIL  http ${response.status} — ${body.detail ?? body.title ?? "no detail"}`);
  if (response.status === 401) {
    console.error("401 is the four credentials not being valid together.");
    console.error("A common cause is copying the OAuth 2.0 Client ID or Secret");
    console.error("into these fields — this path is OAuth 1.0a and does not use them.");
  }
  process.exit(1);
}

console.log(`OK    authenticated as @${body.data?.username} (${body.data?.name})`);
console.log(`      user id ${body.data?.id}`);
console.log("");
console.log("Credentials are valid. Write permission is separate and cannot be");
console.log("checked without posting — if the first real post returns 403,");
console.log("regenerate the access token and secret after setting the app to");
console.log("Read and write.");
