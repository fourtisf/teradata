"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Reveal-on-scroll: 18px translate, 700ms ease, nothing bouncier (§5).
 *
 * It also drives the bar fills. Tracks render at width 0 and are given their
 * real width when the card first enters the viewport, so the bars grow in
 * rather than appearing pre-drawn. `prefers-reduced-motion` is handled in CSS —
 * the transition is stripped, the width still lands.
 */
export function Reveal({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const show = () => {
      el.classList.add("in");
      el.querySelectorAll<HTMLElement>(".fill[data-w]").forEach((fill) => {
        fill.style.width = `${fill.dataset.w}%`;
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      show();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show();
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className ? `rv ${className}` : "rv"} style={style}>
      {children}
    </div>
  );
}
