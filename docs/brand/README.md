# Social assets

Regenerate: the `__SORA__` / `__JAKARTA__` / `__MONO__` placeholders take
base64 woff2 faces. Screenshot `#avatar` and `#avatar-alt` from `x-assets.html`
and `#b2` from `x-banner.html`, at `deviceScaleFactor: 1`. The `-guides` plates
draw X's avatar overlap and safe band so the layout is checked rather than
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

X drops a ~333px avatar circle centred near (218, 500) over the 1500×500 banner,
and crops top and bottom on narrow viewports. Every text box is asserted to
clear that circle — the first draft had "Capital arriving" sitting under it, and
the geometry check caught it before the upload did. Copy ends at y=294; the
circle starts at y=325.

The wordmark carries the banner alone. The avatar sitting directly below it is
already the mark, and repeating it puts two marks a centimetre apart.

## What makes it read as premium rather than generic

Blur was doing the damage. A 70px halo behind a 26%-opacity mark reads as a
watermark — the shape looks approximate, and approximate is the opposite of an
instrument. The ring system replaces it: six concentric right-opening arcs on
one centre, every stroke crisp, weight and opacity stepping down outward, the
whole thing bleeding off three edges so it continues rather than stops. The only
glow left is on the core, which is the one element §5 permits to glow.

The rest is hierarchy. An eyebrow above the wordmark gives the block somewhere
to start; a short violet rule gives the type a floor and is the only other place
the accent appears. `taredata.com` was cut — it fell across the rings and turned
to mush at the size X actually renders this, and X shows the website under the
banner anyway. Removing beat relocating.
