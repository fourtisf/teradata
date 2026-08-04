"use client";

import { useState } from "react";
import { SOCIAL, SOCIAL_LINKS } from "@/lib/config/site";

type State = { kind: "idle" | "sending" | "done" } | { kind: "error"; message: string };

/**
 * The one thing a visitor who likes this can actually do.
 *
 * Before this existed every call to action on the page pointed at `#top`. The
 * endpoint answers 501 when no destination is configured and the message says
 * so plainly, so nobody is told they signed up for something that did not
 * record them.
 */
export function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setState({ kind: "error", message: body.error ?? "Something went wrong." });
        return;
      }
      setState({ kind: "done" });
    } catch {
      setState({ kind: "error", message: "Network error. Try again shortly." });
    }
  };

  return (
    <div className="wl">
      <h4>Get told when the numbers are real</h4>
      <div className="hint">
        One email when the indexer goes live. No drip sequence, no newsletter.
      </div>

      {state.kind === "done" ? (
        <p className="wl-done" role="status">
          On the list. You will hear from us once, when there is something measured to show.
        </p>
      ) : (
        <form className="wl-form" onSubmit={submit}>
          <label className="wl-label" htmlFor="waitlist-email">
            Email
          </label>
          <input
            id="waitlist-email"
            className="wl-input"
            type="email"
            required
            autoComplete="email"
            placeholder="you@desk.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={state.kind === "error" ? "waitlist-error" : undefined}
            aria-invalid={state.kind === "error"}
          />
          <button className="btn btn-primary" type="submit" disabled={state.kind === "sending"}>
            {state.kind === "sending" ? "Sending…" : "Join the waitlist"}
          </button>
        </form>
      )}

      {state.kind === "error" ? (
        <p className="wl-error" id="waitlist-error" role="alert">
          {state.message}
        </p>
      ) : null}

      {SOCIAL_LINKS.length || SOCIAL.email ? (
        <div className="wl-links">
          <span>Or reach us at</span>
          {SOCIAL_LINKS.map((link) => (
            <a key={link.label} href={link.href} rel="me noreferrer" target="_blank">
              {link.label}
            </a>
          ))}
          {SOCIAL.email ? <a href={`mailto:${SOCIAL.email}`}>{SOCIAL.email}</a> : null}
        </div>
      ) : null}
    </div>
  );
}
