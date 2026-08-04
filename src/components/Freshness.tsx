"use client";

import { useEffect, useState } from "react";
import { onUpdate } from "@/lib/freshness";

/**
 * Seconds since the last update, ticking.
 *
 * Renders "0" on the server and hydrates to the same value, then starts
 * counting. A live number cannot be baked into the HTML without tearing on
 * hydration, so the first paint is always zero and the clock starts after.
 */
export function Freshness({ prefix = "", suffix = "s ago" }: { prefix?: string; suffix?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setElapsed((value) => value + 1), 1000);
    const stop = onUpdate(() => setElapsed(0));
    return () => {
      clearInterval(tick);
      stop();
    };
  }, []);

  return (
    <span className="num">
      {prefix}
      {elapsed}
      {suffix}
    </span>
  );
}
