import { ContractAddress } from "@/components/ContractAddress";
import { Reveal } from "@/components/Reveal";

export function SiteFooter() {
  return (
    <footer>
      {/* The house rule, stated on the page and not only in the spec. */}
      <Reveal className="card note">
        <span className="eyebrow">House rule</span>
        <p>
          Tare reports measured flow. It does not name who moved the money. Wallets are
          described by what can be verified — first seen or returning, funded from where, holding
          what — never by a firm&rsquo;s name inferred from a pattern.
        </p>
      </Reveal>

      <div className="fbot">
        <span>Tare · Capital arriving on Solana</span>
        <ContractAddress />
        <span className="flinks">
          <a href="#method">Method</a>
          <a href="#coverage">Coverage</a>
          <a href="#coverage">Status</a>
          <a href="#top">Changelog</a>
          <a href="#top">Contact</a>
        </span>
      </div>
    </footer>
  );
}
