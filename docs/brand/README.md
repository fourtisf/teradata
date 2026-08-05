# Social assets

Regenerate: the `__SORA__` / `__JAKARTA__` / `__MONO__` placeholders take
base64 woff2 faces. Screenshot `#avatar` and `#avatar-alt` from `x-assets.html`
and `#b4` from `x-banner.html`, at `deviceScaleFactor: 1`. The `#b4g` plate
draws X's avatar overlap and safe band so the layout is checked rather than
assumed.

| File | Size | Use |
|---|---|---|
| `x-avatar-violet.png` | 400×400 | X profile picture — **recommended** |
| `x-avatar.png` | 400×400 | Alternative, mark on the brand ground |
| `x-banner.png` | 1500×500 | X header |
| `x-banner.html` | — | Banner generator, with the guides plate |
| `x-avatar-sizes.png` | — | Both avatars at 96/48/32px, why violet wins |

## Why the avatar inverts the locked mark

`src/components/Brand.tsx` locks the mark to violet on transparent, no
container. That holds everywhere it is placed on our own surfaces.

An avatar is not one of those surfaces. X renders it as a 48px circle in a
timeline and 32px in replies, against a ground we do not control, beside
hundreds of others. On the brand's near-black the mark has no edge and sinks
into a dark timeline; on violet it reads as a solid disc with the aperture cut
out of it and holds at 32px. Same geometry, same single colour, no gradient —
only figure and ground swap, on the one surface where presence beats fidelity.

## Banner layout constraints

X puts two things on top of a 1500×500 banner, and both are asserted by the
`#b4g` guides plate rather than eyeballed:

- **A ~334px avatar circle** centred near (218, 500), so its top edge is y=333.
  Nothing in the left column may go below that. The copy block ends at y=324.
- **A top-and-bottom crop on narrow viewports**, leaving y 60–440. The v3
  banner put its deepest outflow bar at y=468 and lost the rose bars on a
  phone — the one colour on the plate that carries an argument. v4 bottoms out
  at 424.

The wordmark carries the banner alone. The avatar sitting directly below it is
already the mark, and repeating it puts two marks a centimetre apart.

## What makes it read as premium rather than generic

Four passes got here, and every one of them removed something.

**Blur went first.** A 70px halo behind a 26%-opacity mark reads as a watermark.
The shape looks approximate, and approximate is the opposite of an instrument.

**Then the rings went.** Crisp by that point, but still decoration — a shape
that could belong to any company. What replaced them is the product's own
chart. No competitor reporting gross volume can put that on a banner, which is
the whole argument for using it.

**Then the pairing went, which was the real fix.** Gross and held were drawn as
two bars side by side. At thirty days they fell to 8px and the plate read as a
barcode; at sixteen the gap inside a pair was still too close to the gap
between pairs, so the eye grouped the wrong two bars and the chart said the
opposite of what it meant.

Stacking them in one column solves it and says more. The solid violet is what
stayed. The pale block above it is the difference — **which is the tare**, the
deduction the company is named after, drawn instead of captioned. On the three
outflow days there is no solid segment at all and a rose bar hangs below the
line. Nothing is labelled and no figure appears: it is the shape of the method,
not a claim about a number.

**What is left is alignment.** Left and right margins are both 112px. The
legend's right edge sits on the chart's right edge. The tagline breaks to two
lines, which gives the left block a shape instead of a long thin line and keeps
its right edge at x=512, so the chart starts at 566 with no vertical
negotiation at all. The eyebrow gives the block somewhere to start and the
short violet rule gives the type a floor; those two are the only places the
accent appears, and rose appears only where it means what it always means.
`taredata.com` was cut — it turned to mush at the size X renders this, and X
shows the website under the banner anyway.

One relationship worth keeping if this is redrawn: the chart starts at x=566,
clear of where X's avatar circle ends at x=385. The empty bottom-left is not
empty on a real profile — the avatar fills it, so it is composed around rather
than left over.
