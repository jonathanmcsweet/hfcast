<div align="center">
  <img src="mobile/design/android-icon/svg/store_foreground.svg" height="120"/>
</div>
<h1 align="center">HFcast</h1>

**HFcast is a privacy-first offline-friendly HF propagation forecasting app for amateur radio operators. Absolutely free, no ads, no tracking of any kind.**

[<img src="docs/badges/obtainium.png" alt="Get it on Obtainium" width="140">](https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/jonathanmcsweet/hfcast)
[<img src="docs/badges/get-it-on-github.png" alt="Get it on GitHub" width="140">](https://github.com/jonathanmcsweet/hfcast/releases)

Pick a place, pick a band, enter your radio settings and get a custom forecast for HF propagation.

Estimated conditions based on historical data through a real, faithful reproduction of the VOACAP engine, the point-to-point propagation model NTIA/ITS has maintained for decades. [Faithfully translated to Rust and running directly on the phone](https://github.com/jonathanmcsweet/hfcast-engine).

<!--
  TODO(screenshots): add real captures here once the app has been run —
  a home screen, the band grid, and the station/antenna setup are the
  three worth showing. Organic Maps crops its App Store/Play Store
  listings to size for this row; HFcast doesn't have those listings yet.
-->

## Privacy

- Runs on a de-Googled phone or your old tablet without any Google services
- Developed and tested on GrapheneOS
- Works fully offline by calculating conditions based on historical HF propgation records
- Nothing about your station, your position, or the path you're checking leaves the device

When online, two features do reach out to the network with no identifying data of yours being sent out:

- Today's space weather (from NOAA)
- Recent ionosphere measurements (from GIRO)

Also...

- No ads
- No account
- No sign-in
- No tracking
- No data collection
- No phoning home
- No annoying registration
- No mandatory tutorials
- No noisy email spam
- No push notifications
- No crapware
- No spyware

## What the forecast is — and isn't

- When online, HFcast enters live ionospheric data into VOACAP's model to give you the most accurate up to date propagation map.
- When offline or looking at future times, HFcast uses VOACAP's monthly climatology estimate.
- Every day inside the same month gets the same base answer unless the
  sunspot number changes; HFcast can pull today's space weather to adjust
  that, but the underlying model is still telling you what's _typical_ for
  a path like yours in a month like this one.

The model's numbers are corrected against real measured signals, and
the correction data — what was measured, and where the model is
weakest — is documented in [docs/](docs/) and in the engine repository.

## Build it

Start with the [quick start](docs/quick-start.md) — about 15 minutes on
a machine that already has the toolchain — then the
[development guide](docs/development.md) if you're going to work on the
code.

## What is in this repository

| Part               | What it is                                         |
| ------------------ | -------------------------------------------------- |
| [mobile/](mobile/) | The application, for Android and the web           |
| [server/](server/) | The prediction API, for builds that have no engine |
| [docs/](docs/)     | The guides                                         |

The propagation engine itself lives in a separate repository,
[hfcast-engine](https://github.com/jonathanmcsweet/hfcast-engine) — a
Rust translation of VOACAP, tested cell by cell against the original
Fortran.

## Built on the work of

Almost everything HFcast knows comes from other people's work. The same
list, with links and full licence text, is in the app's About screen.

| What                                                                                                                            | Whose                                            | Terms                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| [VOACAP](https://its.ntia.gov/), the propagation model                                                                          | NTIA/ITS, maintained by Greg Hand                | US Government work, not subject to copyright protection in the US |
| [voacapl](https://github.com/jawatson/voacapl), the Unix port this engine was translated from                                   | J.A. Watson                                      | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)         |
| [The ionospheric coefficient maps](https://github.com/ITU-R-Study-Group-3/ITU-R-HF)                                             | CCIR Reports 322 and 340, published by ITU-R     | published for implementers free from copyright assertions         |
| The place list searched offline                                                                                                 | NTIA/ITS, from the VOACAP distribution           | US Government work                                                |
| [Coastlines and country borders](https://www.naturalearthdata.com/)                                                             | Natural Earth                                    | public domain                                                     |
| [Sunspot numbers and solar indices](https://www.swpc.noaa.gov/)                                                                 | NOAA Space Weather Prediction Center             | US Government work                                                |
| [Measured ionosonde soundings](https://giro.uml.edu/)                                                                           | UMass Lowell Global Ionosphere Radio Observatory | used with attribution                                             |
| [Place search, when online](https://open-meteo.com/)                                                                            | Open-Meteo                                       | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)         |
| [The aurora on the launch screen](https://commons.wikimedia.org/wiki/File:ISS-42_Aurora_borealis_over_North_Atlantic_Ocean.jpg) | NASA / Samantha Cristoforetti, ESA               | public domain                                                     |
| [IBM Plex Sans](https://github.com/IBM/plex), the typeface                                                                      | IBM                                              | SIL Open Font License 1.1                                         |

Three of those are live services the app calls directly, with no key:
NOAA and GIRO, at most once every 15 minutes each, and Open-Meteo, only
when a searched place isn't in the built-in list.

The Institute for Telecommunication Sciences, NTIA, US Department of
Commerce, developed VOACAP. NTIA/ITS and NOAA do not endorse HFcast and
are not responsible for what it reports.

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
