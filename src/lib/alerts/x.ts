/**
 * X delivery.
 *
 * POST /2/tweets, signed with OAuth 1.0a user context. Written against node's
 * crypto rather than pulling in an X client: the whole protocol here is a
 * sorted parameter string, an HMAC-SHA1 and a header.
 *
 * Free tier allows 500 posts a month. `config.ts` sets X's thresholds an order
 * of magnitude above Telegram's for that reason, and the dispatcher applies a
 * cooldown on top.
 */

import { createHmac, randomBytes } from "node:crypto";
import { X_CREDENTIALS } from "@/lib/alerts/config";
import type { DeliveryResult } from "@/lib/alerts/types";

const ENDPOINT = "https://api.twitter.com/2/tweets";

export function xConfigured(): boolean {
  const c = X_CREDENTIALS;
  return Boolean(c.consumerKey && c.consumerSecret && c.accessToken && c.accessSecret);
}

/** RFC 3986. encodeURIComponent leaves four characters OAuth wants encoded. */
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function authorizationHeader(method: string, url: string): string {
  const c = X_CREDENTIALS;
  const params: Record<string, string> = {
    oauth_consumer_key: c.consumerKey!,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: c.accessToken!,
    oauth_version: "1.0",
  };

  // A JSON body is not part of the signature — only the oauth_* parameters and
  // any query string are, which is why nothing about the tweet text appears here.
  const parameterString = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key]!)}`)
    .join("&");

  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(parameterString)].join(
    "&",
  );
  const signingKey = `${percentEncode(c.consumerSecret!)}&${percentEncode(c.accessSecret!)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  const header = { ...params, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(header)
      .sort()
      .map((key) => `${percentEncode(key)}="${percentEncode(header[key as keyof typeof header]!)}"`)
      .join(", ")
  );
}

export async function sendX(text: string): Promise<DeliveryResult> {
  if (!xConfigured()) return { channel: "x", ok: false, reason: "not configured" };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: authorizationHeader("POST", ENDPOINT),
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8000),
    });

    const body = (await response.json().catch(() => ({}))) as {
      data?: { id?: string };
      detail?: string;
      title?: string;
    };

    if (!response.ok) {
      // 429 here means the monthly cap, not a burst limit — worth reading as such.
      const reason = body.detail ?? body.title ?? `http ${response.status}`;
      return { channel: "x", ok: false, reason };
    }
    return { channel: "x", ok: true, id: body.data?.id };
  } catch (error) {
    return { channel: "x", ok: false, reason: (error as Error).message };
  }
}
