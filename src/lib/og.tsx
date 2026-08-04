import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { MARK } from "@/components/Brand";
import { money, percent } from "@/lib/format";
import { SITE_NAME } from "@/lib/config/site";
import type { FlowSummary } from "@/lib/data/types";

/**
 * The share card, server-rendered.
 *
 * P5 wants a daily card generated at 00:00 UTC; this is that generator, reused
 * as the Open Graph image for every page. Same layout as the canvas preview on
 * the home page, same mark geometry from `MARK`, so the card a person downloads
 * and the card that appears in a link preview cannot drift apart.
 *
 * Colours are literal here because satori has no cascade to read tokens from.
 * They are the §5 values and must be changed together with globals.css.
 */
const BG = "#0C0718";
const SURFACE = "#171029";
const LINE = "rgba(241,237,255,0.16)";
const TXT = "#F1EDFF";
const TXT_2 = "#948BB4";
const TXT_3 = "#6B6390";
const GREEN = "#34D399";
const VIOLET = "#7C5CFF";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * Read from disk, not via fetch: the Node runtime has no `file://` fetch, and
 * the documented `fetch(new URL(..., import.meta.url))` pattern is edge-only.
 * `next.config.ts` pins these files into the traced output so the lookup also
 * works on a serverless deploy, where the build directory is not the CWD.
 *
 * The faces are subsetted to Latin — a full JetBrains Mono is 112KB and the
 * card only ever renders digits, currency symbols and venue names.
 */
async function fonts() {
  const load = (file: string) =>
    readFile(fileURLToPath(new URL(`./fonts/${file}`, import.meta.url)));
  const [sora, mono600, mono400] = await Promise.all([
    load("sora-600.ttf"),
    load("mono-600.ttf"),
    load("mono-400.ttf"),
  ]);
  return [
    { name: "Sora", data: sora, weight: 600 as const, style: "normal" as const },
    { name: "Mono", data: mono600, weight: 600 as const, style: "normal" as const },
    { name: "Mono", data: mono400, weight: 400 as const, style: "normal" as const },
  ];
}

/** The mark, in satori-safe SVG. Same numbers as `MARK`, no cascade needed. */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${MARK.grid} ${MARK.grid}`} fill="none">
      <path
        d={`M${MARK.cx} ${MARK.cy - MARK.outerRadius}a${MARK.outerRadius} ${MARK.outerRadius} 0 0 1 0 ${MARK.outerRadius * 2}`}
        stroke={VIOLET}
        strokeWidth={MARK.outerWidth}
        strokeLinecap="round"
      />
      <path
        d={`M${MARK.cx} ${MARK.cy - MARK.innerRadius}a${MARK.innerRadius} ${MARK.innerRadius} 0 0 1 0 ${MARK.innerRadius * 2}`}
        stroke={VIOLET}
        strokeWidth={MARK.innerWidth}
        strokeLinecap="round"
      />
      <circle cx={MARK.cx} cy={MARK.cy} r={MARK.coreRadius} fill={VIOLET} />
    </svg>
  );
}

export interface CardInput {
  /** e.g. "04 Aug 2026" or "Wormhole · last 30 days". */
  kicker: string;
  summary: FlowSummary;
  /** The line under the headline figure. */
  caption: string;
  /** Stamped across the card while the figures are invented. */
  simulated: boolean;
}

export async function renderCard(input: CardInput): Promise<ImageResponse> {
  const { kicker, summary, caption, simulated } = input;
  const leftAgain =
    summary.declaredInboundUsd > 0 ? summary.reexportedUsd / summary.declaredInboundUsd : 0;

  const stats: Array<[string, string]> = [
    [money(summary.declaredInboundUsd), "declared inbound"],
    [percent(leftAgain, 0), "left again"],
    [money(summary.unspentUsd), "still unspent"],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: BG,
          padding: 56,
          fontFamily: "Mono",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: SURFACE,
            border: `2px solid ${LINE}`,
            borderRadius: 20,
            padding: "44px 48px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Mark size={38} />
            <span style={{ fontFamily: "Sora", fontSize: 28, color: TXT, marginLeft: 12 }}>
              {SITE_NAME}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 20, color: TXT_3 }}>{kicker}</span>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <span style={{ fontSize: 104, fontWeight: 600, color: GREEN, lineHeight: 1.05 }}>
              {money(summary.stillOnSolanaUsd)}
            </span>
            <span style={{ fontSize: 27, color: TXT_2, marginTop: 14 }}>{caption}</span>
          </div>

          <div style={{ display: "flex", borderTop: `1px solid ${LINE}`, paddingTop: 26 }}>
            {stats.map(([value, label]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", width: 330 }}>
                <span style={{ fontSize: 40, fontWeight: 600, color: TXT }}>{value}</span>
                <span style={{ fontSize: 21, color: TXT_3, marginTop: 6 }}>{label}</span>
              </div>
            ))}
          </div>

          {simulated ? (
            <span style={{ fontSize: 17, color: TXT_3, marginTop: 22 }}>
              Preview — every figure on this card is simulated.
            </span>
          ) : null}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}
