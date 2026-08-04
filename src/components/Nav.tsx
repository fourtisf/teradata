import { BrandMark } from "@/components/Brand";
import { Freshness } from "@/components/Freshness";

export function Nav() {
  return (
    <nav>
      <div className="nav-in">
        <a className="brand" href="/" aria-label="Tare home">
          <BrandMark />
          <b>Tare</b>
        </a>
        <span className="fresh">
          <span className="dot" />
          <Freshness prefix="updated " />
        </span>
        {/* No wallet connect. This is a public data product — §2. */}
        <a className="btn btn-primary" href="#waitlist">
          Watch the port
        </a>
      </div>
    </nav>
  );
}
