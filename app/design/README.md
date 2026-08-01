# Handoff: HFCast — reach-first propagation screen

## Overview

HFCast forecasts shortwave (HF) radio propagation for amateur operators and answers one
question: **which radio band will reach this place, at what time of day?**

This handoff covers a redesign of the app's single main screen plus its first-run flow. The
screen is now **map-first**: an azimuthal-equidistant globe centred on the operator, washed
with predicted reliability, above a 9 × 24 band/hour grid. It adds a spacing scale, a type
scale, a dark theme, a German locale, a first-run location flow that accepts four input
formats, an optional destination sidebar, and an accessible table alternative to the heatmap.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing
intended look and behaviour, not production code to copy. The target codebase is an existing
**React Native (Expo) app using react-native-paper (Material Design 3)** with data and
framework already in place. The task is to **recreate these designs in that app** using its
established patterns: flexbox only (no CSS grid, no cascade, no pseudo-elements), spacing and
type as plain numbers in style objects, `react-native-svg` for the map, `ScrollView horizontal`
for chip rows.

Everything below is specified so it can be implemented from this README alone.

## Fidelity

**High-fidelity.** Colours, spacing, type sizes, line heights, radii, copy and interaction
timings are final and should be matched. The one deliberate exception: the propagation model in
the prototype is a plausible stand-in (formulas included below so the UI can be exercised) —
the real app has its own data layer, and the UI should bind to that.

---

## Design tokens

### Colour — light theme

| Token             | Hex                                     | Use                                                  |
| ----------------- | --------------------------------------- | ---------------------------------------------------- |
| `page`            | `#F7F8FC`                               | screen background                                    |
| `card`            | `#FFFFFF`                               | raised surfaces                                      |
| `inset`           | `#F7F8FC`                               | recessed panels inside cards (readouts, stat tiles)  |
| `line`            | `#E2E5F0`                               | hairline borders — these carry elevation             |
| `line2`           | `#CBD0E1`                               | stronger borders, control outlines                   |
| `ink`             | `#12151F`                               | primary text, selection outlines                     |
| `inkInv`          | `#F7F8FC`                               | text on `ink` fills                                  |
| `text2`           | `#39415A`                               | secondary text                                       |
| `text3`           | `#65708C`                               | captions                                             |
| `text4`           | `#8590AB`                               | labels, axis, footnotes                              |
| `accent`          | `#0E7490`                               | interactive: selected chip, links, slider            |
| `accentInk`       | `#ECFDFF`                               | text on `accent`                                     |
| `amberBg`         | `#FFE7BE`                               | —                                                    |
| `amberFg`         | `#573A00`                               | —                                                    |
| `amberNum`        | `#A85D00`                               | solar flux value **and** selected-hour column marker |
| `ionoBg`          | `#ECFDFF`                               | measured-data card                                   |
| `ionoTitle`       | `#03303D`                               | —                                                    |
| `ionoSub`         | `#0E7490`                               | —                                                    |
| `tagBg` / `tagFg` | `#A5EEFA` / `#0B4C5C`                   | MEASURED chip                                        |
| `discBg`          | `#EEF0F7`                               | disclaimer surface                                   |
| `shadow`          | `0 24px 48px -24px rgba(18,21,31,0.28)` | device frame only                                    |

### Colour — dark theme

Surfaces step the neutral ramp and are **not** tinted with the primary hue; hairline borders
carry elevation (this was an explicit product decision — do not use Material's tinted
elevation).

| Token                              | Hex                                  |
| ---------------------------------- | ------------------------------------ |
| `page`                             | `#0B0D14`                            |
| `card`                             | `#12151F`                            |
| `inset`                            | `#1A1F2E`                            |
| `line`                             | `#272D40`                            |
| `line2`                            | `#39415A`                            |
| `ink`                              | `#F7F8FC`                            |
| `inkInv`                           | `#0B0D14`                            |
| `text2`                            | `#CBD0E1`                            |
| `text3`                            | `#AAB2C8`                            |
| `text4`                            | `#8590AB`                            |
| `accent`                           | `#22D3EE`                            |
| `accentInk`                        | `#03303D`                            |
| `amberBg` / `amberFg`              | `#573A00` / `#FFDFA0`                |
| `amberNum`                         | `#FFC24B`                            |
| `ionoBg` / `ionoTitle` / `ionoSub` | `#03303D` / `#CFF5FC` / `#A5EEFA`    |
| `tagBg` / `tagFg`                  | `#0E7490` / `#ECFDFF`                |
| `discBg`                           | `#1A1F2E`                            |
| `shadow`                           | `0 24px 48px -24px rgba(0,0,0,0.62)` |

### Propagation quality ramp (four ordinal states)

Quality is a **four-state ordinal scale**, not a gradient: `reliable · patchy · weak · closed`.
It maps to contrast against the page, so it survives greyscale and every form of colour
blindness. **Brighter against a dark page, darker against a light one** — the ramp inverts
between themes.

| State    | Light bg / fg         | Dark bg / fg          | Threshold |
| -------- | --------------------- | --------------------- | --------- |
| Reliable | `#43267A` / `#F3ECFF` | `#C9B4F7` / `#2A1656` | ≥ 70      |
| Patchy   | `#7C4BD0` / `#F5F0FF` | `#7C4BD0` / `#F5F0FF` | 45–69     |
| Weak     | `#C9B4F7` / `#2A1656` | `#4A2F7D` / `#E0D7FA` | 20–44     |
| Closed   | `#F1EFF8` / `#65708C` | `#1A1F2E` / `#8590AB` | < 20      |

The **globe** uses a slightly wider-spaced version of the same ramp, because the white
coastlines and the fill opacity compress perceived contrast:

| State    | Light     | Dark      | Fill opacity |
| -------- | --------- | --------- | ------------ |
| Reliable | `#3B1F72` | `#D6C6FA` | 0.95         |
| Patchy   | `#8A5FDC` | `#9B78E8` | 0.88         |
| Weak     | `#C9B4F7` | `#4A2F7D` | 0.80         |
| Closed   | `#F1EFF8` | `#1A1F2E` | 0.60         |

Map line work: coastlines `#FFFFFF` light / `#8590AB` dark at 0.9px; cell separators
`#FFFFFF` light / `#0B0D14` dark at 0.5px, 0.55 opacity; distance rings + terminator dashed
`#FFFFFF` light / `#AAB2C8` dark; night side fill `#12151F` at 0.14 (light) / `#000000` at
0.45 (dark). All strokes must be non-scaling under zoom (`vector-effect: non-scaling-stroke`
in the prototype → in `react-native-svg`, divide stroke widths by the current zoom scale).

### Spacing scale

Six steps, all multiples of 4 so they drop straight into style objects as numbers. **Gaps grow
as the relationship weakens.**

| Name  | px | Applies to                                                 |
| ----- | -- | ---------------------------------------------------------- |
| `xs`  | 4  | label ↔ its value, inside a chip                           |
| `sm`  | 8  | dense table rows, swatch ↔ text, chip gaps, stat tile gaps |
| `md`  | 12 | elements inside a card, grid label column gap              |
| `lg`  | 16 | card padding, screen gutters                               |
| `xl`  | 24 | between cards                                              |
| `2xl` | 32 | bottom of scroll                                           |

Screen padding: `4px 16px 32px` on phone (top is deliberately tight — the header sits close to
the band selector), `8px 20px 32px` on tablet. Card padding 16, card radius 20, inset-panel
radius 12, chip radius 12, device frame radius 28.

### Type scale

One family — **IBM Plex Sans** — with tabular figures everywhere numbers appear
(`fontVariant: ['tabular-nums']`). Numbers differ from labels by weight and tracking, not by
family. Plex ships Arabic and JP siblings for the other locales.

| Role                   | Size / line-height                | Weight  | Tracking | Replaces (M3)  |
| ---------------------- | --------------------------------- | ------- | -------- | -------------- |
| Location name (header) | 20 / 24                           | 700     | −0.3     | titleLarge     |
| Card headline          | 22 / 28                           | 600     | −0.3     | headlineSmall  |
| Answer sentence        | 17 / 24                           | 500     | 0        | titleMedium    |
| Card title             | 17 / 24                           | 600     | 0        | titleMedium    |
| Stat value             | 28 / 32                           | 600     | −0.5     | headlineSmall  |
| Number, medium         | 20 / 24                           | 600     | 0        | titleLarge     |
| Body / input           | 15–17 / 20–24                     | 400–600 | 0        | bodyLarge      |
| Caption                | 13 / 18                           | 400–600 | 0        | bodySmall      |
| Label (uppercase)      | 11 / 14                           | 600     | +0.8     | labelSmall     |
| Axis / micro           | 11 / 14                           | 600     | 0        | —              |
| Setup title            | 28 / 34 (phone), 34 / 40 (tablet) | 600     | −0.6     | headlineMedium |

**Never below 11px** — the app is used outdoors in direct sunlight. Line heights run 1.4–1.5;
add +2px at body size and below for Japanese. German runs ~35% longer: every label slot wraps
rather than truncates and no chip has a fixed width (frame `1d` in
`HFCast Screen.dc.html` is the German stress test).

---

## Screens / views

### 1. Launch splash

Full-frame photograph (aurora borealis over the North Atlantic, ISS Expedition 42, NASA,
public domain) with a bottom scrim `linear-gradient(rgba(11,13,20,0) 30%, rgba(11,13,20,.72)
62%, #0B0D14 100%)`. Content pinned to the bottom third: kicker label "HF propagation", 32/36
600 headline "Which band gets you there", a 4px progress track, a step label, and a credit
line at 10/14.

Four load steps cycle in ~500ms increments: `Solar flux → Nearest ionosonde → Path model →
Your bands`, then the whole overlay cross-fades out over 700ms. **In production, drive the
fade from actual readiness, not a timer.** Bundle the JPEG as an asset (2× frame size, EXIF
stripped) so launch works offline.

Implementation note: the overlay must cover the entire frame while its **content** is confined
to one device-height pane — otherwise live screen content shows beside it on a long scroll.

### 2. First-run location pane (required, full screen)

Order: kicker label · 28/34 title "Where are you transmitting from?" · 15/22 subtitle · GPS
button · "or type it in" divider · text field · five example chips · live feedback panel ·
footnote · actions.

- **GPS button**: primary fill, 52px min height, radius 14, label left / "GPS" right.
- **Field**: 52px, radius 14, 1px `line2` border, 17px text, placeholder "Town, coordinates,
  grid square, or ///what3words".
- **Example chips** (36px, radius 10, 13px 600): `Denver, CO` · `39.74, -104.99` ·
  `39°44′N 104°59′W` · `DM79mr` · `///daring.lion.race`. Tapping one fills the field.
- **Feedback panel** (radius 12, 56px min): three lines — recognised format label, resolved
  name, then coordinates + grid square. Background signals status: `discBg` neutral,
  `ionoBg` valid, `amberBg` error.
- **Actions**: secondary "Skip for now" → falls back to **Greenwich** (`-0.0014, 51.4779`,
  UTC+0 — the prime meridian, where UTC starts) and goes straight to the main screen with no
  further prompting. Primary "Continue" is disabled (opacity .45) until input resolves.

**Returning users** (opened from the header) get a ✕ in the pane header, Escape to dismiss,
the secondary button relabelled **"Cancel"** (no mutation), and the primary relabelled "Use
this location". Changing location **preserves an existing destination** — re-derive distance
and bearing rather than clearing it.

### 3. Destination sidebar (optional)

Slides in from the right — 344px wide on phone (max 92%), 420px on tablet, device height,
`card` background, 1px left border, `-24px 0 48px -24px rgba(11,13,20,.35)` shadow,
`transform: translateX(101% → 0)` over 280ms `cubic-bezier(.32,.72,0,1)`, with a
`rgba(11,13,20,.45)` scrim fading over 260ms.

Opens automatically after the user _sets_ a location (not after Skip). Contains: title + ✕,
subtitle, the same four-format field, feedback panel whose note reads "9,600 km from
Greenwich, London · bearing 32°", five preset destination buttons (44px), then **"No
destination"** (secondary) and **"Aim at this"** (primary). Closes on Aim, ✕, scrim tap, or
when the user taps a square on the map instead.

### 4. Main screen

Vertical scroll. Phone order: header → band selector → map card → path header → grid card →
legend → sun card → disclaimer. Tablet puts the map in a left column with the path header,
legend and sun card in a right column, and the grid spans full width below.

**Header** — no wordmark. Left: location name (20/24 700) with an `accent` "Change ▾"
affordance, whole thing a 44px touch target opening the location pane. Right: an **OFFLINE**
chip (10/14 700, `inset` background, 1px `line2`, ring dot) shown only when disconnected, and
refresh / more icons. Long-press (420ms) or tap the chip toggles a dark tooltip below the
header explaining that the forecast is historical: _"No connection, so this is history rather
than measurement: monthly averages for July, anchored to the last readings at 11:40. It cannot
see a solar storm that started since then — treat the numbers as typical, not current."_

**Band selector** — label "BAND" then nine chips (`80m 60m 40m 30m 20m 17m 15m 12m 10m`) in a
horizontally scrollable row, 44 × 44 minimum, radius 12, 15px 600 tabular. Selected: `accent`
fill with `accentInk` text. Unselected: `card` fill, `text2`, 1px `line`. Must be a real
horizontal scroller — nine chips exceed phone width.

**Map card**

- Headline 22/28 "Where can I reach?" + caption "Tap a square to aim the forecast below at it."
- **Readout panel** (`inset`, radius 12): one 17/24 sentence plus a quality badge. With
  nothing selected it states the recommendation — _"40m is your best bet right now — it
  reaches about 85% of directions, holding until about 23:00."_ (or "…is your best bet to
  Chicago, IL, holding until about 19:00." with a destination). While a cell is
  hovered/tapped: _"40m reaches near Chicago, IL at 14:00 — about 75% chance of contact."_
- **Globe**: `d3.geoAzimuthalEquidistant` centred on the operator, `clipAngle 179.5`, fit to
  the box. 15° latitude × 22.5° longitude cells on phone (176 cells), 10° × 15° on tablet
  (384). Each cell is a geodesic polygon filled from the globe ramp. Overlays: dashed distance
  rings at 1000/2000/4000/8000/12000 km (labelled on tablet), the day/night terminator as a
  90° circle around the antisolar point, white coastlines from Natural Earth (`world-atlas`
  countries-110m), an amber `#FFC24B` home dot, and — when a destination exists — a great-circle
  line to a pale destination dot.
- **Zoom**: pinch, drag-pan, wheel, and double-tap to zoom 2× at the tap point (shift-double
  to zoom out); scale 1–10×, pan clamped to the map. Plus 44px `+` / `−` / fit-frame-icon
  buttons bottom-right for one-handed use. Markers and ring labels scale down as zoom
  increases so they hold their apparent size.
- **Clock**: label "Local time at {place}", value "14:00 local · 20:00 UTC" (both zones —
  operators work in UTC), then a 44px-tall slider, `accent` thumb, 0–23 step 1.
- Map SVG height caps at 322px phone / 400px tablet portrait / **300px tablet landscape** —
  the landscape cap is what keeps the card above the fold on a 1280×800 Pixel Tablet.

**Path header** — 22/28 title "{home} → {destination}" or "No destination set"; caption with
distance, bearing and hop count, or "Showing how much of the world each band reaches from
{home}"; then a 40px secondary button "Set a destination" / "Change destination".

**Grid card** — the dense one.

- Readout panel (`inset`): label ("NOW · 14:00 · 40M" or "{band} at {hour}"), value
  ("85% of directions reachable" / "about 75% chance of contact to Chicago, IL"), badge. A
  hairline below it, then the **usable-window rail**.
- **Usable-window rail**: a 3–30 MHz log-scale axis, 6px track, with the open span
  (LUF → MUF) filled in `accent` at 0.3 opacity and a 2px tick per band — the selected band's
  tick is 3px `accent`, in-window ticks `text2`, out-of-window `line2`. End labels "3 MHz" /
  "30 MHz" at 11px. Right-aligned numbers read "Floor 7.3 · ceiling 43.5 MHz". The whole rail
  is a button: tap expands one sentence naming MUF and LUF in parentheses. This is how expert
  numbers stay available without appearing in any headline.
- **Unit label** — mandatory, because the grid's quantity changes with mode:
  `CHANCE OF CONTACT, %` with a destination, `DIRECTIONS REACHABLE, %` without one. Beside it,
  a "Show as table" toggle.
- **Heatmap**: 9 rows × 24 cells. 36px band label column, 4px gap, cells `flex: 1` with 1px
  gaps, 22px tall on phone / 26–28px on tablet, radius 3. Tapping a cell sets that band and
  hour and moves the map. The **selected hour** is marked by a single 2px `amberNum` rectangle
  around the whole column (not per-cell borders), plus an amber tick above the grid and an
  amber hour label below. Hovered cell gets a 2px `ink` outline. Hour axis labels every 4 hours
  at 11px.
- **Table alternative**: "Show as table" swaps the heatmap for a real table — `<caption>`,
  `scope="col"` hour headers, `scope="row"` band headers, sticky band column, each cell
  carrying the rounded number with the plain-word state as its accessible name, background
  from the same ramp. The visual heatmap is `aria-hidden` so assistive tech gets exactly one
  structure. In React Native: an accessible `FlatList`/`View` table with
  `accessibilityLabel="{band}, {hour}, {value} percent, {state}"` per cell.
- Footnote: "Hours are local time at {place}." plus, offline, "Hours after 18:00 are July
  averages, not today's measurements."

**Legend** (collapsible, open by default) — four rows, each with two 20px swatches (globe
wash, then grid fill), the plain-word state name at 15/20 600 in an 88px column, and a
description: _You should get through · Comes and goes · Only with patience · Not this band, not
now._ Footnote explains darker = more reliable and why it holds in greyscale.

**Sun card** (collapsible, collapsed by default; freshness tag stays visible on the collapsed
header) — four stat tiles (`inset`, radius 12) in a wrapping row: Solar flux `168` in
`amberNum`, Sunspots `112`, Disturbance `K 2`, Trend 24 h `+6`. Amber is reserved for the
solar-driven value. Below them the measured-ionosonde row: a `MEASURED` chip, title "Nearest
ionosonde · 8.1 MHz", and a sentence naming the distance and age.

**Disclaimer** (collapsible, collapsed) — title "Live data, not climatology", body naming the
sources and time, plus the station assumption: _"Assumes 100 W into a dipole 10 m up. A better
antenna beats these numbers; a compromise antenna will not reach them."_

### 5. Offline variants

Every data-freshness surface has one. The pattern is **state the timestamp and the
consequence**, never just "offline".

| Surface               | Online                                      | Offline                                                                                                        |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Header chip           | hidden                                      | `OFFLINE` + long-press explanation                                                                             |
| Sun card tag          | `UPDATED 14:02`, neutral                    | `AS OF 11:40`, amber                                                                                           |
| Solar flux / sunspots | "High — bands open higher than usual"       | "Measured 11:40, about 2 h old"                                                                                |
| Disturbance           | "Quiet — no storm degrading paths"          | "Last reading 11:40 — a storm since then would be invisible"                                                   |
| Trend 24 h            | `+6` "Improving slowly"                     | `—` "Needs a connection", greyed                                                                               |
| Ionosonde             | `MEASURED`, `ionoBg` card, "12 minutes ago" | `LAST MEASURED`, `inset` card with **dashed** border, "· 11:38", "2 h 24 min old… the ionosphere has moved on" |
| Disclaimer            | "Live data, not climatology"                | "Saved data · monthly averages after 18:00" + why                                                              |
| Grid footnote         | hours only                                  | + July-averages caveat                                                                                         |

The K-index tile matters most: a cached quiet reading is the most dangerous number in the app,
so it says outright that a storm since then would be invisible.

---

## Interactions & behaviour

- **One band selector and one clock drive every module.** Selecting a band recolours the globe,
  moves the rail tick and highlights the grid row. Moving the clock recolours the globe, moves
  the terminator, moves the amber column and updates the rail numbers.
- **Tapping a globe cell** sets the destination (named "near {place}" when within 900km of a
  known location, otherwise "{compass} · {distance}"), draws the great-circle path, and closes
  the destination sidebar if open.
- **Tapping a grid cell** sets band + hour and moves the map and clock to match.
- **Percentages are rounded to the nearest 5** and phrased "about 75%" — the model does not
  support 1% resolution.
- Collapsible sections animate nothing; they toggle with a `+` / `−` caret and
  `aria-expanded`.
- Splash: 4 steps ≈ 2.3s, then 700ms cross-fade. Sidebar: 280ms. Zoom button steps: 220–260ms.
  Honour reduce-motion by disabling the sidebar transition and cross-fade.

## State management

```
home:      { name, lon, lat, tz, isDefault }   // required; defaults to Greenwich
target:    { name, lon, lat, tz } | null       // optional destination
band:      '40m'                               // default
hour:      0..23                               // local at home
offline:   boolean
theme:     'light' | 'dark'
lang:      'en' | 'de' | 'es' | 'ja' | 'ar'
mapHover:  cell | null
gridHover: { band, hour } | null
tableMode: boolean
ready:     boolean                             // first-run complete
zoom:      { scale, translate }
```

Persist `home`, `target`, `band`, `theme`, `lang` and the last successful forecast payload.
Changing `home` invalidates the coverage cache, re-derives every cell's distance and bearing,
re-centres the projection and resets zoom to fit.

## The model (stand-in — replace with the real data layer)

Provided so the UI can be exercised and so the copy thresholds make sense. All angles in
degrees, distances in km.

```
sun(lon,lat,utc)  = max(0, sin(lat)·sin(dec) + cos(lat)·cos(dec)·cos(((utc-12)·15 + lon)))
obliquity(d)      = 1 + 0.95·min(1.25, d/3200)
MUF(mid,d,utc)    = (6 + 20·sun(mid)^0.6) · obliquity(d)
LUF(utc)          = 2.2 + 6.4·(0.5·sun(mid) + 0.5·sun(home))^0.8
FOT               = 0.85·MUF

reliability(f):
  v = f ≤ FOT ?  100 − 30·((FOT−f)/FOT)^1.3
              :  100·exp(−3.2·(f−FOT)/FOT) − 12
  v −= (0.5·sun(mid) + 0.5·sun(home))·95 / f^1.15        // daytime D-layer absorption
  v += (1 − sun(mid))·18 / max(1, f/6)                   // quiet night on the low bands
  skip = 420 + 130·f;  if d < skip: v −= 70·(1 − d/skip) // skip zone grows with frequency
  v −= 6·max(0, ceil(d/3400) − 1)                        // hop loss
  if d > 16000: v −= 14
  if d < 200:   v = max(v, 92 − 0.1·d − 1.0·f)           // groundwave carries the local path
  clamp 0..99
```

**Coverage** (used when no destination is set): sample 24 bearings × 10 distances
(500–17000 km) from home and report the share of samples scoring ≥ 45. Cache per band+hour;
invalidate when `home` changes. Taking the max instead of a share saturates at "reliable" for
every band and hour and says nothing.

## Location input — four formats

One field parses all four; the UI names the format it recognised and echoes the resolved
coordinates plus grid square.

1. **Place name** — fuzzy match; production should hit a geocoder.
2. **Coordinates** — decimal `39.74, -104.99` or DMS `39°44′N 104°59′W`.
3. **Maidenhead grid square** — 4 or 6 characters, `/^[A-R]{2}[0-9]{2}([A-X]{2})?$/`. Decode:
   `lon = (c0−'A')·20 − 180 + digit2·2`, `lat = (c1−'A')·10 − 90 + digit3`, plus
   `(c4−'A')·2/24 + 1/24` and `(c5−'A')·1/24 + 0.5/24` for 6-character, else centre of the
   square. Label the real precision: ~150 km for 4 characters, ~4 km for 6.
4. **what3words** — `/^\/{0,3}\w+\.\w+\.\w+$/`; five squares are hard-coded in the prototype.
   Production calls their API once and stores the result as coordinates.

Timezone falls back to `round(lon/15)` when unknown.

## Localisation & RTL

Five languages: English, German, Spanish, Japanese, Arabic. Every string in the prototype comes
from a dictionary with `{0}` placeholders; English and German are complete — use the German
keys as the length stress test. Numbers format through the locale (`de-DE` uses comma
decimals: "Untergrenze 7,3 · Obergrenze 43,5 MHz").

Arabic mirrors the whole layout. Points to watch: the destination sidebar slides from the
_left_; the "Change ▾" caret and all chevrons flip; the grid's band label column moves to the
right and the hour axis runs right-to-left; the map itself does **not** mirror (geography is
not directional), but the compass words and bearings must localise. Use RN's `I18nManager`
and logical `start`/`end` spacing rather than `left`/`right`.

## Accessibility

- Every interactive element is a real button with an accessible name — including the
  usable-window rail (`aria-expanded` + `aria-controls` → `accessibilityState={{expanded}}`),
  the offline chip, and the zoom controls.
- The heatmap has a **table alternative**, and the visual grid is hidden from assistive tech.
  This is a requirement, not an enhancement.
- Touch targets ≥ 44px: chips, slider, zoom buttons, location header, preset buttons.
- Text never below 11px; contrast checked on both themes (the four-state ramp is ordinal by
  lightness, so it also survives greyscale and colour blindness).
- Escape / back dismisses the location pane for returning users without mutating state.
- Honour reduce-motion.

## Responsive behaviour & fold data

Frames verified in the prototype, with content height measured against each device's usable
viewport (device height − 48px for status bar and gesture area):

| Device                 | Viewport   | Usable | Screens of scroll                          |
| ---------------------- | ---------- | ------ | ------------------------------------------ |
| Pixel 8                | 412 × 915  | 867    | 4                                          |
| Moto G (2025)          | 360 × 802  | 754    | 4                                          |
| iPhone 15              | 393 × 852  | 804    | 4                                          |
| iPad 10.9 portrait     | 820 × 1180 | 1132   | 2                                          |
| iPad Pro 11 landscape  | 1194 × 834 | 786    | 3                                          |
| Pixel Tablet landscape | 1280 × 800 | 752    | 2 (map card bottom at 739px — just clears) |

Phone is a single column. Tablet portrait: map + right column (path header, legend, sun), grid
full width. Tablet landscape: same split with the map capped at 300px tall so the card clears
a 752px fold.

## Known gaps / decisions still open

1. **Reverse geocoding** for arbitrary map taps beyond the built-in gazetteer needs a service.
2. **Tablet landscape could reach a single screen** by moving the grid into the right column.
3. The globe and the grid use two spacings of the same purple ramp; if that proves confusing,
   collapse to one and distinguish the selected band another way.
4. Spanish, Japanese and Arabic dictionaries are not written yet.
5. Antenna and power are stated as an assumption, not asked. A one-time question in setup would
   be better.

## Assets

- **Launch photograph** — "ISS-42 Aurora borealis over North Atlantic Ocean", NASA, public
  domain, via Wikimedia Commons. Fetched at 1200px in the prototype; bundle at 2× frame size
  with EXIF stripped. Credit line kept in the UI even though PD requires none.
- **Map geometry** — Natural Earth via `world-atlas@2.0.2/countries-110m.json` (public domain).
  Ship the TopoJSON as a bundled asset; do not fetch at runtime.
- **Fonts** — IBM Plex Sans (+ Plex Sans Arabic, Plex Sans JP). OFL.
- **Icons** — only the fit-frame icon is custom (four corner brackets, 1.8px stroke,
  `currentColor`). Everything else is a glyph or existing Paper icon.

## Files in this bundle

| File                       | What it is                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HFCast Reach Screen.html` | **The design of record.** Phone (3a, device-switchable), tablet portrait (3b), tablet landscape (3c). Toolbar toggles: language, phone fold, tablet fold, offline, theme, replay first run, open location setup. |
| `HFCast Aurora Photo.html` | Launch-screen photography options; 5b is the chosen treatment.                                                                                                                                                   |
| `HFCast Screen.dc.html`    | Earlier exploration: the module-by-module layout, alternate hero and heatmap treatments, and the **German long-text stress frame (1d)**. Useful for the type and spacing scales in isolation.                    |
| `HFCast Coverage Map.html` | Standalone coverage-map study — the projection, cell grid and scoring, with distance rings labelled.                                                                                                             |

Open `HFCast Reach Screen.html` in a browser to interact with the real thing; the other files
are supporting studies.
