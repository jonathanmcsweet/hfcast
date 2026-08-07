# HFCast app icon — storm cells

The mark is a field of identical rounded cells coloured on the product's violet quality
ramp, with a circular opening at the centre holding the schematic antenna symbol. Two cuts
of the field exist because two contexts crop differently.

| Cut        | Where                                              | Cells | Extent                                     |
| ---------- | -------------------------------------------------- | ----- | ------------------------------------------ |
| Compact    | Adaptive launcher icon, legacy mipmaps, monochrome | 28    | r 17.5 → 28, plus seven outliers at r 30.6 |
| Full bleed | Play Store 512, iOS 1024                           | 70    | r 20 → the edge of the 108 canvas          |

## Dropping this into an APK build

Copy `res/` over your module's `src/main/res/`. It contains only icon resources, so it
merges cleanly:

```
app/src/main/res/drawable/ic_launcher_foreground.xml
app/src/main/res/drawable/ic_launcher_monochrome.xml
app/src/main/res/drawable/ic_launcher_background.xml   (not needed — background is a colour)
app/src/main/res/drawable/ic_stat_hfcast.xml
app/src/main/res/values/ic_launcher_background.xml
app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
app/src/main/res/mipmap-{m,h,x,xx,xxx}dpi/ic_launcher.png   from png/mipmap-*/
```

Then in `AndroidManifest.xml`:

```xml
<application
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round">
```

If your `values/ic_launcher_background.xml` already exists, merge the colour rather than
overwriting the file. The legacy PNGs are only used below API 26; the adaptive icon takes
over above it.

`ic_store_foreground.xml` is **not** a launcher resource — it is the full-bleed cut used for
`play-store-512.png` and `ios-1024.png`. Do not wire it into the manifest.

## Geometry

- Canvas 108 × 108, centre 54 / 54
- Cell 7 × 7, corner radius 1.8, lattice pitch 8.5 — identical for every cell
- Circular opening: any cell whose centre falls inside the hole radius is dropped
- The compact perimeter is deliberately uneven: five cells sit outside the main ring at
  r 30.6 — offsets (2,-3) (3,-2) (3,2) (2,3) (-3,-2) (-2,-3) (-2,3) in lattice steps — and
  three are removed at (-25.5, 0), (8.5, -25.5) and (-25.5, -8.5). The outliers reach 35.5 from centre, so a circle mask clips their
  outer corners; that is intended, it reads as the field continuing past the edge
- The compact field carries a second noise term so neighbouring cells differ more in shade;
  the store field keeps the single, smoother term
- Ramp `#C9B4F7` · `#9B78E8` · `#7C4BD0` · `#4A2F7D`; core sits up and left of centre,
  with a directional bias that adds weight down and to the right. The compact field uses all
  four steps (14 / 4 / 7 / 3); the store field, whose opening removes the core, lands on the
  lower three only (0 / 8 / 39 / 23) and never reaches the brightest step
- Background `#2A1656`, flat — no drawable needed, it is a colour resource
- Glyph `#F3ECFF`: mast `54,64 → 54,53` under an inverted triangle `43,43 · 65,43 · 54,53`,
  shifted down 3.5, and 5 on the 0.9 launcher cut — its opening is tighter, so it needs more — geometrically centred reads top-heavy because the
  triangle's mass sits above the stem

### Glyph cuts

Butt caps, mitre joins — the symbol is drawn sharp, against the rounded cells.

| Context          | Scale                    | Stroke |
| ---------------- | ------------------------ | ------ |
| Store, iOS       | 1.0                      | 2.2    |
| Launcher, legacy | 0.9                      | 2.0    |
| Monochrome       | 0.9                      | 2.3    |
| Notification     | redrawn on a 24 viewport | 2.0    |

## Contents

```
res/drawable/ic_launcher_foreground.xml    compact field + glyph
res/drawable/ic_launcher_monochrome.xml    same, white with alpha
res/drawable/ic_store_foreground.xml       full-bleed field + glyph
res/drawable/ic_stat_hfcast.xml            24 dp notification, glyph only
res/values/ic_launcher_background.xml      #2A1656
res/mipmap-anydpi-v26/ic_launcher.xml      adaptive icon wiring
res/mipmap-anydpi-v26/ic_launcher_round.xml

png/icon-foreground.png                    432, transparent
png/icon-monochrome.png                    432, white + alpha
png/icon-background.png                    432, flat
png/play-store-512.png                     512, opaque, unmasked
png/ios-1024.png                           1024, opaque, no rounding
png/mipmap-{m,h,x,xx,xxx}dpi/ic_launcher.png   48 · 72 · 96 · 144 · 192
preview-sheet.png                          all of the above in one sheet

svg/ic_launcher_foreground.svg             editable source, 108 viewBox
svg/ic_launcher_monochrome.svg
svg/store_foreground.svg                   includes the #2A1656 background
svg/ic_stat_hfcast.svg                     24 viewBox
```

## Expo

This application takes the raster route, because it has no checked-in
`android/` folder for `res/` to be copied into: `expo prebuild` rewrites that
folder on every build. `app.json` therefore points at three PNGs:

```json
"icon": "./src/assets/icon.png",
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./src/assets/icon-foreground.png",
    "monochromeImage": "./src/assets/icon-monochrome.png",
    "backgroundColor": "#2A1656"
  }
}
```

`src/assets/icon.png` is the full-bleed cut at 1024, which is the same art as
`png/ios-1024.png`. It serves iOS and the web favicon, neither of which applies
a launcher mask.

## The PNGs here are generated

Every file under `png/`, and `preview-sheet.png`, is written by
`tools/build-icons.ts` from the geometry in `tools/icon-art.ts`:

```bash
node --experimental-strip-types tools/build-icons.ts
```

The drawables under `res/` stay the design of record. `test/icon.test.ts`
rebuilds every path in them from that geometry and compares the result with the
files, so a change to one side and not the other fails a test rather than
shipping. It also decodes the PNGs, which is how a delivery of sixteen
well-formed files holding noise was caught.

Change the mark by editing the drawables and the geometry together, then run
the generator. Do not hand-place PNGs here.

## Known limit

At 24 dp the triangle outline is about half a pixel and closes up. The notification icon is
therefore the glyph alone at a heavier stroke, not a shrunk copy of the mark. If a 24 dp
launcher cut is ever needed, redraw it rather than scaling this one.
