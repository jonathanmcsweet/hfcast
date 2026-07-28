# Design brief — paste into claude.ai/design

Kept in the repo so the brief and the code drift together rather than
separately. Update it when the token layer changes.

---

I'm designing **HFCast**, a mobile app that forecasts shortwave (HF) radio
propagation for amateur radio operators. It answers one question: "which
radio band will reach this place, at what time of day?"

## Context you need

- **React Native (Expo) with react-native-paper**, so Material Design 3 is
  the base. Anything you propose has to be expressible in React Native:
  flexbox only, no CSS grid, no cascade, no pseudo-elements. Spacing and type
  end up as plain numbers in a style object.
- **Must work in direct sunlight**, outdoors, often on a phone propped on a
  camping table. Field use is the primary case, not desk use.
- **WCAG compliance is required.** Where something can't be made accessible,
  it needs an alternative — a table for people who can't read a chart.
- **Five languages**: English, German, Spanish, Japanese, and Arabic. Arabic
  means the whole layout mirrors right-to-left. German text runs long.
- **Phone and tablet both.**

## The screen

One screen, a vertical scroll, in this order:

1. **Offline banner** — appears only when showing saved data
2. **Path header** — "Denver → Boulder, 38 km, bearing 322°"
3. **Location picker** — two fields, from and to
4. **Day selector** — today plus six days
5. **Hero card** — the headline answer: the best band right now
6. **Band selector** — pick a band to inspect
7. **Hourly strip** — that band's quality across 24 hours
8. **Band heatmap** — the dense one: **9 bands × 24 hours = 216 cells**, each
   coloured by predicted reliability
9. **Band list** — the same 9 bands as rows with a percentage bar each
10. **Quality legend**
11. **Space weather card** — solar flux, sunspot number, K index, and a
    measured ionosonde reading when one is nearby
12. **Disclaimer card** — says whether this is live data or climatology

Numbers are everywhere: percentages, frequencies in MHz, hours, distances.
They sit in columns that must not jitter as values change, so numerals are
tabular.

## What I already have: a colour system

Built around one idea — a radio path crossing the line between the lit and
unlit sides of the earth. Neutrals are cold and violet-shifted like the
terminator; the signal ramp runs plasma-cyan through indigo into slate; a
single warm amber is reserved for the one solar-driven number. Ramps were
spaced in OKLCH for even perceptual steps, then flattened to hex because
React Native has no `oklch()`.

**Neutral (slate)** — `#FFFFFF` `#F7F8FC` `#EEF0F7` `#E2E5F0` `#CBD0E1`
`#AAB2C8` `#8590AB` `#65708C` `#4B5570` `#39415A` `#272D40` `#1A1F2E`
`#12151F` `#0B0D14`

**Primary (cyan)** — `#ECFDFF` `#CFF5FC` `#A5EEFA` `#22D3EE` `#06B6D4`
`#0E8CA8` `#0E7490` `#0B4C5C` `#03303D`

**Secondary (indigo)** — `#EEF0FF` `#E0E3FF` `#C7D0FE` `#A5B4FC` …

**Accent (amber, solar values only)** — `#FFE7BE` `#FFDFA0` `#FFC24B`
`#C2810A` `#A85D00` `#573A00` `#2E1C00`

**Error (rose)** — warmer and less institutional than Material's red.

Two decisions I want kept unless you can argue me out of them:

- **Propagation quality is a four-state scale**, not a gradient: reliable,
  marginal, poor, closed. The default ramp is _ordinal_ — quality maps to
  contrast against the page, so it stays readable in greyscale and under
  every form of colour blindness. Brighter against a dark page, darker
  against a light one. A conventional green/amber/red version also exists as
  an alternative.
- **Elevation is neutral, not tinted.** Material tints raised surfaces with
  the primary hue; at this chroma that reads as a cyan wash over everything,
  so raised surfaces step through the neutral ramp and hairline borders carry
  the elevation instead.

## What I don't have, and what I want from you

**There is no spacing scale and no type scale.** Every margin, gap and
padding in the app is a bare number written inline — 16 here, 12 there,
padding 10, a column pinned at 44 wide. Typography is stock Material 3,
untouched.

So I have a considered colour system sitting on top of default type and
ad-hoc spacing, in an app that is mostly dense numeric tables. It doesn't
look right and I believe that's why.

Please:

1. **Propose a spacing scale** — a small set of steps with names, and a rule
   for which step applies where (inside a card, between cards, between a
   label and its value, between rows of a dense table).
2. **Propose a type scale** — sizes, weights and line heights, including a
   distinct treatment for numeric values versus labels. Say which Material 3
   roles each replaces or overrides. Remember German runs long and Japanese
   needs more line height.
3. **Show me the screen with both applied**, light and dark, at phone width
   and tablet width. The band heatmap is the hardest part: 216 cells that
   must stay readable and touchable on a phone, in sunlight.
4. **Tell me what you changed and why**, so I can decide before it goes into
   code.

Please don't redesign the colour system unless something in it is actively
fighting you — and if it is, say so plainly rather than working around it.
