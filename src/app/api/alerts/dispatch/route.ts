import { NextResponse } from "next/server";
import { DISPATCH_SECRET } from "@/lib/alerts/config";
import { dispatchAlert, previewAlert } from "@/lib/alerts/dispatch";
import { getDataProvider } from "@/lib/data";
import type { AlertEvent, AlertKind } from "@/lib/alerts/types";
import type { Entry } from "@/lib/data/types";

/**
 * Where the P1 ingest worker hands movements to the alert layer.
 *
 * The worker runs beside the app on the VPS, so this is a local POST behind a
 * shared secret rather than a queue. When the websocket layer in §2 lands, this
 * route and that publisher read the same event shape.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: AlertKind[] = ["arrival", "reexport", "idle", "first_seen"];

export async function POST(request: Request) {
  if (!DISPATCH_SECRET) {
    return NextResponse.json(
      { error: "ALERTS_DISPATCH_SECRET is not set; the dispatch route is closed." },
      { status: 501 },
    );
  }
  // Constant-time is overkill for a local call, but an unauthenticated route
  // that posts to a public timeline is not a thing to leave open.
  if (request.headers.get("authorization") !== `Bearer ${DISPATCH_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: { kind?: string; entry?: Entry; movedUsd?: number; detail?: string; dryRun?: boolean };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { kind, entry, movedUsd, detail, dryRun } = payload;
  if (!kind || !KINDS.includes(kind as AlertKind)) {
    return NextResponse.json({ error: `kind must be one of ${KINDS.join(", ")}` }, { status: 400 });
  }
  if (!entry || typeof entry.id !== "string" || typeof entry.amountUsd !== "number") {
    return NextResponse.json({ error: "entry must be an arrivals record." }, { status: 400 });
  }

  const event: AlertEvent = {
    kind: kind as AlertKind,
    entry,
    movedUsd: typeof movedUsd === "number" ? movedUsd : entry.amountUsd,
    detail,
    at: new Date().toISOString(),
  };

  const source = getDataProvider().source;
  const result = await dispatchAlert(event, { dataSource: source, dryRun });
  return NextResponse.json({ ...result, preview: previewAlert(event, source) });
}
