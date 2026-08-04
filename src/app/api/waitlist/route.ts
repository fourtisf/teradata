import { NextResponse } from "next/server";
import { WAITLIST_WEBHOOK_URL } from "@/lib/config/site";

/**
 * Waitlist signups.
 *
 * Forwards to whatever endpoint `WAITLIST_WEBHOOK_URL` points at — a form
 * service, a webhook, a queue. With nothing configured it answers 501 and the
 * form says so, rather than accepting an address, showing a tick and dropping
 * it. A signup that silently goes nowhere is worse than no form at all.
 */
export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (typeof email !== "string" || !EMAIL.test(email.trim()) || email.length > 320) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  }

  if (!WAITLIST_WEBHOOK_URL) {
    return NextResponse.json(
      { error: "Signups are not wired up yet. Set WAITLIST_WEBHOOK_URL to turn this on." },
      { status: 501 },
    );
  }

  try {
    const forwarded = await fetch(WAITLIST_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), source: "taredata.com", at: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
    });
    if (!forwarded.ok) throw new Error(`upstream ${forwarded.status}`);
  } catch {
    // Never report success we cannot stand behind.
    return NextResponse.json({ error: "Could not record that. Try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
