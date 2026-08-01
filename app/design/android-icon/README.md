# HFCast app icon — drop-in assets

Everything here is generated from one 108 × 108 dp design. Pick **A** or **B** depending on
whether your Expo project has a checked-in `android/` folder.

**HFcast itself uses A.** `android/` is in `.gitignore` and `expo prebuild` rewrites it on
every build, so anything copied into it is erased before it reaches an APK. B is kept here for
a project that does check that folder in.

**The PNGs in this folder are generated, not exported.** `tools/build-icons.ts` draws them from
the same geometry as the drawables, so the two routes cannot disagree. Rerun it after any
change to the design, and do not edit the PNGs by hand — the next run overwrites them:

```
node --experimental-strip-types tools/build-icons.ts
```

`test/icon.test.ts` rebuilds the drawables' path data and colours from that geometry and
compares them with the XML, then decodes the PNGs and checks each still carries the ramp.

Geometry, for reference: nine 12 dp cells (radius 3.2) on a 17 dp pitch, so the grid is 46 dp
wide and centred, with columns at 31 / 48 / 65 and rows the same. Furthest art is 31.2 dp from
centre, inside the 33 dp safe circle every launcher mask respects — it was 32.5 dp when the
marker was still there, and the test computes it rather than trusting this line. One ramp, no
line work —
#C9B4F7 → #9B78E8 → #7C4BD0 → #4A2F7D, brightest corner top-left, on #2A1656.

---

## A. Managed Expo (no `android/` folder)

Three PNGs go where the app can reach them. In this project `tools/build-icons.ts` writes them
straight into `src/assets/`, which is where bundled assets live; elsewhere, copy them:

| From                      | To                               |
| ------------------------- | -------------------------------- |
| `png/icon-foreground.png` | `src/assets/icon-foreground.png` |
| `png/icon-monochrome.png` | `src/assets/icon-monochrome.png` |
| `png/ios-1024.png`        | `src/assets/icon.png`            |

Then in `app.json`:

```json
{
  "expo": {
    "icon": "./src/assets/icon.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./src/assets/icon-foreground.png",
        "monochromeImage": "./src/assets/icon-monochrome.png",
        "backgroundColor": "#2A1656"
      }
    }
  }
}
```

Prebuild generates every mipmap density from these, including the legacy rasters, so route A
covers API 21 upward on its own.

`monochromeImage` needs Expo SDK 50 or newer — drop the line on older SDKs and Android 13
themed icons simply fall back to the normal icon.

Rebuild with `npx expo prebuild --clean` (or a new EAS build). A JS reload will not pick up an
icon change.

---

## B. Bare / prebuilt Android (`android/` folder exists)

Vector drawables are sharper and smaller than PNGs, so use the XML for anything Android 26+.
Copy the contents of `res/` over `android/app/src/main/res/`, preserving folder names:

```
res/mipmap-anydpi-v26/ic_launcher.xml        → adaptive icon definition
res/mipmap-anydpi-v26/ic_launcher_round.xml  → same definition, round alias
res/drawable/ic_launcher_foreground.xml      → the nine ramp cells
res/drawable/ic_launcher_monochrome.xml      → white + alpha, for Android 13 themed icons
res/drawable/ic_stat_hfcast.xml              → 24 dp notification glyph
res/values/ic_launcher_background.xml        → <color name="ic_launcher_background">#2A1656</color>
```

Then the legacy raster icons for API 25 and below — copy each `png/mipmap-*/` folder into the
matching `android/app/src/main/res/mipmap-*/`:

```
mipmap-mdpi     48 px
mipmap-hdpi     72 px
mipmap-xhdpi    96 px
mipmap-xxhdpi  144 px
mipmap-xxxhdpi 192 px
```

Each density has `ic_launcher.png` (rounded square) and `ic_launcher_round.png` (circle).
These are pre-masked on purpose — old launchers apply no mask of their own.

`AndroidManifest.xml` should already reference both; confirm it reads:

```xml
<application
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
    ... >
```

If you delete the old `res/values/ic_launcher_background.xml`, make sure nothing else still
references `@color/ic_launcher_background`.

Do not use `res/values/ic_launcher_background.xml` together with route A. Prebuild writes that
same colour name into `values/colors.xml` from `adaptiveIcon.backgroundColor`, and two
resources with one name fail the build.

### Notification icon

`ic_stat_hfcast.xml` is white-on-transparent with alpha steps, which is what Android expects —
the system tints it. Reference it when you post a notification:

```js
// expo-notifications
await Notifications.setNotificationChannelAsync('forecast', {/* … */});
// app.json plugin config
['expo-notifications', {
  'icon': './assets/notification-icon.png',
  'color': '#2A1656',
}];
```

Expo's notification plugin wants a PNG rather than a vector; export
`res/drawable/ic_stat_hfcast.xml` to a 96 × 96 white-on-transparent PNG if you go that route,
or reference the drawable directly in bare workflow.

---

## Play Store

`png/play-store-512.png` — 512 × 512, opaque, no rounding applied. Google rounds it for
display, so do not pre-round it. It uses the same framing as the launcher icon so the store
listing and the home screen match.

## iOS

`png/ios-1024.png` — 1024 × 1024, opaque, square, no rounding. It is drawn at 1.2× the Android
framing because iOS applies no mask crop, so the identical scale would leave the art looking
undersized on the home screen.

---

## Editing later

`preview-sheet.png` is 1440 × 456 and shows the icon at 192 / 144 / 96 / 72 / 48 / 24 px under
both a squircle and a circle mask, light on the left and dark on the right, so small-size
legibility is checkable at a glance. It is generated too.

The design of record is `HFCast App Icon.dc.html` in the project — option 7a. It carries the
guides, the mask previews, the layer breakdown and the SVG source, and it is where a change of
design starts. The geometry of record in this repository is `tools/icon-art.ts`, which holds
the same grid and ramp as numbers. If you change the geometry
there, regenerate these files rather than editing them by hand: the ramp colours
(`#C9B4F7 → #9B78E8 → #7C4BD0 → #4A2F7D`) and the indigo background (`#2A1656`) come from the
app's own palette and should stay in sync with it. Amber (`#FFC24B`) is deliberately absent, so
it keeps a single meaning inside the product: the hour you are looking at.

Rules worth not breaking: no text in the icon, no gradients or shadows on the foreground layer,
all art inside the 66 dp safe circle, and the monochrome layer carries alpha only.
