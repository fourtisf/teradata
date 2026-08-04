/**
 * Says plainly that the numbers are invented.
 *
 * Every figure on this page comes from `SimProvider` while `DATA_SOURCE=sim`.
 * That was harmless while the build was an internal review, but the page now
 * carries a token teaser and gets shared, and financial figures presented
 * without a marker read as measurements. §1 stakes the entire brand on the
 * headline number being defensible — publishing invented figures unlabelled
 * would spend that credibility before the indexer has earned any of it.
 *
 * Renders only in sim mode, so it disappears on its own in P1.
 */
export function SimNotice() {
  return (
    <div className="simbar" role="status">
      <div className="wrap simbar-in">
        <b>Preview</b>
        <span>
          Every figure below is simulated. Nothing on this page is measured until the indexer lands.
        </span>
      </div>
    </div>
  );
}
