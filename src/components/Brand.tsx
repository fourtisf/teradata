/**
 * The mark: a port of entry — arriving waves on the left, the settled body on
 * the right. Violet, and violet is not used for anything decorative elsewhere.
 */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <rect width="26" height="26" rx="8" fill="var(--violet)" />
      <path
        d="M5.6 8.4A6.6 6.6 0 0 1 5.6 17.6"
        stroke="var(--bg)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M9.4 10.2a3.4 3.4 0 0 1 0 5.6"
        stroke="var(--bg)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17.2" cy="13" r="3.1" fill="var(--bg)" />
    </svg>
  );
}
