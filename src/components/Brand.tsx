/**
 * The mark — Aperture. The hero portal reduced to two rings and a core: capital
 * that has come through and settled inside.
 *
 * Drawn on a 32-unit grid so the geometry is stated at the size it has to
 * survive. Three things matter and none of them are negotiable without redrawing
 * the mark:
 *
 * 1. The core sits at the rings' centre (11.4, 16), and the whole form is
 *    optically centred in the box — art runs 7.9–24.2 horizontally. Centre the
 *    *viewBox* instead and the core reads as sitting beside the arcs, which
 *    turns the mark into a broadcast icon.
 * 2. Depth comes from stroke weight (2.6 inner, 1.9 outer), never from opacity.
 *    A 40%-alpha hairline disappears at 16px; a thinner solid stroke does not.
 *    The two gaps — core to inner ring, inner to outer ring — are both 2.4
 *    units, so the rings still separate at 16px instead of blurring into one
 *    thick stroke.
 * 3. No container, no ring, no glow. Violet on transparent reads on both light
 *    and dark browser chrome, so one asset covers every surface.
 *
 * Violet only. Green and rose already mean something (§5).
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M11.4 4.2a11.8 11.8 0 0 1 0 23.6"
        stroke="var(--violet)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M11.4 8.8a7.2 7.2 0 0 1 0 14.4"
        stroke="var(--violet)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="11.4" cy="16" r="3.5" fill="var(--violet)" />
    </svg>
  );
}

/** The mark's geometry, so the daily-card canvas draws the same shape. */
export const MARK = {
  grid: 32,
  cx: 11.4,
  cy: 16,
  coreRadius: 3.5,
  innerRadius: 7.2,
  innerWidth: 2.6,
  outerRadius: 11.8,
  outerWidth: 1.9,
} as const;
