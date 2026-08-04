# Social assets

Regenerate: open `x-assets.html` (the `__SORA__` / `__JAKARTA__` / `__MONO__`
placeholders take base64 woff2 faces) and screenshot `#avatar`, `#avatar-alt`
and `#banner` at `deviceScaleFactor: 1`. `#banner-guides` draws X's avatar
overlap and safe band so the layout can be checked rather than assumed.

| File | Size | Use |
|---|---|---|
| `x-avatar-violet.png` | 400×400 | X profile picture — **recommended** |
| `x-avatar.png` | 400×400 | Alternative, mark on the brand ground |
| `x-banner.png` | 1500×500 | X header |
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

X drops the avatar over roughly x 50–400, y 325–500 of the 1500×500 banner, and
crops top and bottom on narrow viewports. All copy sits above y=300 and inside
x 112–720. The wordmark carries the banner alone — the avatar sitting directly
below it is already the mark, and repeating it puts two marks a centimetre
apart.
