# HFCast app icon — drop-in assets

Everything here is generated from one 108 × 108 dp design. Pick **A** or **B** depending on
whether your Expo project has a checked-in `android/` folder.

**HFcast itself uses A.** `android/` is in `.gitignore` and `expo prebuild` rewrites it on
every build, so anything copied into it is erased before it reaches an APK. B is kept here for
a project that does check that folder in.

The PNGs are drawn from the vector geometry by `tools/build-icons.ts`, so the two routes cannot
disagree. Rerun it after editing the drawables:

```
node --experimental-strip-types tools/build-icons.ts
```

`test/icon.test.ts` rebuilds the drawables' path data from the same geometry and compares it
with the XML, and checks the PNGs still contain the ramp. Do not edit the PNGs by hand — the
next run overwrites them.

Geometry, for reference: nine 12 dp cells (radius 3.2) on a 17 dp pitch, so the grid is 46 dp
wide and centred; the amber selected-hour marker is 17 × 54 at radius 6 with a 4 dp stroke,
which lands inside the 5 dp gutters and touches no cell. Furthest art is 32.5 dp from centre,
inside the 33 dp safe circle every launcher mask respects.

---

## A. Managed Expo (no `android/` folder)

Three PNGs go where the app can reach them. `tools/build-icons.ts` writes them straight into
`src/assets/`, which is where this project keeps bundled assets:

| Written to                       | From                         |
| -------------------------------- | ---------------------------- |
| `src/assets/icon-foreground.png` | the foreground layer, 432 px |
| `src/assets/icon-monochrome.png` | the themed layer, 432 px     |
| `src/assets/icon.png`            | the square icon, 1024 px     |

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
covers API 21 upward on its own. The copies under `png/` are the same images for anything
outside this build — a store listing, another project.

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
res/drawable/ic_launcher_foreground.xml      → the nine cells + amber marker
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
undersized on the home screen. In numbers: 90 dp of the canvas fills the square rather than all
108, which puts the art at 73% of the icon where a launcher shows it at 92%.

---

## Editing later

`preview-sheet.png` is 1440 × 456 and shows the icon at 192 / 144 / 96 / 72 / 48 / 24 px under
both a squircle and a circle mask, light on the left and dark on the right, so small-size
legibility is checkable at a glance. It is generated too.

The design of record is `HFCast App Icon.dc.html` — option 7a. It carries the guides, the mask
previews, the layer breakdown and the SVG source, and it is where a change of design starts.
The geometry of record in this repository is `tools/icon-art.ts`, which holds the same grid,
ramp and marker as numbers; the drawables and the PNGs are both checked against it. Change the
design there and here, and regenerate rather than editing files by hand: the ramp colours
(`#C9B4F7 → #9B78E8 → #7C4BD0 → #4A2F7D`), the amber (`#FFC24B`) and the indigo background
(`#2A1656`) all come from the app's own palette and should stay in sync with it.

Rules worth not breaking: no text in the icon, no gradients or shadows on the foreground layer,
all art inside the 66 dp safe circle, and the monochrome layer carries alpha only.
