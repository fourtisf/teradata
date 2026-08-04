import { ContractAddress } from "@/components/ContractAddress";
import { SOCIAL, SOCIAL_LINKS } from "@/lib/config/site";
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
          <a href="/#method">Method</a>
          <a href="/#faq">FAQ</a>
          <a href="/status">Status</a>
          <a href="/status#changelog">Changelog</a>
          {/* Only rendered when configured — a dead social link costs more
              than a missing one on a product selling transparency. */}
          {SOCIAL_LINKS.map((link) => (
            <a key={link.label} href={link.href} rel="me noreferrer" target="_blank">
              {link.label}
            </a>
          ))}
          {SOCIAL.email ? <a href={`mailto:${SOCIAL.email}`}>Contact</a> : null}
        </span>
      </div>
    </footer>
  );
}
