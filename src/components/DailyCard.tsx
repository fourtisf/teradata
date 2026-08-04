"use client";

import { useRef } from "react";
import { BrandMark } from "@/components/Brand";
import { isoDate, longDate, money, percent } from "@/lib/format";
import type { FlowSummary } from "@/lib/data/types";

/**
 * The daily card. P5 generates this server-side at 00:00 UTC and serves it as
 * the OG image; P0 draws the same layout in a canvas so the shape is settled
 * before the generator is written.
 *
 * Colours are read from the CSS custom properties rather than repeated here —
 * canvas needs literal strings, but the tokens stay the only source (§5).
 */
export function DailyCard({ summary, date }: { summary: FlowSummary; date: string }) {
  const displayRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const monoRef = useRef<HTMLDivElement>(null);

  const leftAgain = summary.reexportedUsd / summary.declaredInboundUsd;

  const download = () => {
    const root = getComputedStyle(document.documentElement);
    const token = (name: string) => root.getPropertyValue(name).trim();
    const familyOf = (el: Element | null, fallback: string) =>
      el ? getComputedStyle(el).fontFamily : fallback;

    const display = familyOf(displayRef.current, "sans-serif");
    const body = familyOf(bodyRef.current, "sans-serif");
    const mono = familyOf(monoRef.current, "monospace");

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = token("--bg");
    ctx.fillRect(0, 0, 1200, 675);
    ctx.fillStyle = token("--surface");
    ctx.fillRect(64, 64, 1072, 547);
    ctx.strokeStyle = token("--line-2");
    ctx.lineWidth = 2;
    ctx.strokeRect(64, 64, 1072, 547);

    ctx.fillStyle = token("--violet");
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(112, 120, 34, 34, 10);
    else ctx.rect(112, 120, 34, 34);
    ctx.fill();

    ctx.fillStyle = token("--txt");
    ctx.font = `600 26px ${display}`;
    ctx.fillText("Manifest", 162, 146);

    ctx.fillStyle = token("--txt-3");
    ctx.font = `400 20px ${mono}`;
    ctx.fillText(longDate(date), 962, 146);

    ctx.fillStyle = token("--green");
    ctx.font = `600 104px ${mono}`;
    ctx.fillText(money(summary.stillOnSolanaUsd), 112, 320);

    ctx.fillStyle = token("--txt-2");
    ctx.font = `400 28px ${body}`;
    ctx.fillText("arrived on Solana today and is still here", 112, 368);

    ctx.strokeStyle = token("--line-2");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(112, 430);
    ctx.lineTo(1088, 430);
    ctx.stroke();

    const stats: Array<[string, string]> = [
      [money(summary.declaredInboundUsd), "declared inbound"],
      [percent(leftAgain, 0), "left again"],
      [money(summary.unspentUsd), "still unspent"],
    ];

    stats.forEach(([value, label], index) => {
      const x = 112 + index * 330;
      ctx.fillStyle = token("--txt");
      ctx.font = `600 40px ${mono}`;
      ctx.fillText(value, x, 500);
      ctx.fillStyle = token("--txt-3");
      ctx.font = `400 22px ${body}`;
      ctx.fillText(label, x, 536);
    });

    const link = document.createElement("a");
    link.download = `manifest-${isoDate(date)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <>
      <h4>Daily card</h4>
      <div className="hint">One image, generated at 00:00 UTC</div>

      <div className="sharecard">
        <div className="sh-top">
          <BrandMark size={18} />
          <b ref={displayRef}>Manifest</b>
          <span className="num">{longDate(date)}</span>
        </div>
        <div className="sh-big num" ref={monoRef}>
          {money(summary.stillOnSolanaUsd)}
        </div>
        <div className="sh-lb" ref={bodyRef}>
          arrived on Solana today and is still here
        </div>
        <div className="sh-sub">
          <div>
            <b className="num">{money(summary.declaredInboundUsd)}</b>declared inbound
          </div>
          <div>
            <b className="num">{percent(leftAgain, 0)}</b>left again
          </div>
          <div>
            <b className="num">{money(summary.unspentUsd)}</b>still unspent
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: "100%", marginTop: 16 }}
        onClick={download}
      >
        Download image
      </button>
    </>
  );
}
