# HFcast

[![CI](https://github.com/jonathanmcsweet/hfcast/actions/workflows/ci.yml/badge.svg)](https://github.com/jonathanmcsweet/hfcast/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](LICENSE)
[![Android 7.0+](https://img.shields.io/badge/Android-7.0%2B-3ddc84)](docs/quick-start.md)
[![GrapheneOS](https://img.shields.io/badge/GrapheneOS-tested-4a4a4a)](#grapheneos)
[![Built with Isopod](https://img.shields.io/badge/built%20with-Isopod-6f42c1)](https://github.com/isopod/isopod)

HF radio propagation forecasts, shown the way a weather application
shows weather.

A VOACAP prediction tells you how probable a radio path is. A weather
forecast tells you how probable rain is. The two are the same kind of
answer, so this application uses the same shapes: the conditions now, an
hourly strip, a list of bands, and a grid of the next 24 hours.

The application does the calculation on the telephone. It does not send
your position to a server, and it gives a forecast with no network
connection.

When it has a connection, it reads the space weather of today from NOAA
and the ionosphere measurements from GIRO. It asks for each of these one
time in 15 minutes at most. It does not use an account or a key.

## Install it

Android 7.0 or later.

| Method                                             | How                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| [Obtainium](https://github.com/ImranR98/Obtainium) | Add the URL `https://github.com/jonathanmcsweet/hfcast`                         |
| Direct download                                    | Take an APK from [Releases](https://github.com/jonathanmcsweet/hfcast/releases) |

A release has four APK files, one for each processor type. Obtainium
selects the correct file. If you download the file yourself, use
`arm64-v8a` unless your device is more than approximately ten years
old.

F-Droid and Accrescent are planned. See
[docs/roadmap.md](docs/roadmap.md).

## Build it

See the [quick start](docs/quick-start.md). It takes approximately 15
minutes on a machine that has the tools.

To work on the code, read the [development guide](docs/development.md) after it.

## What is in this repository

| Part               | What it is                                          |
| ------------------ | --------------------------------------------------- |
| [mobile/](mobile/) | The application, for Android and the web            |
| [server/](server/) | The prediction API, for builds that have no engine  |
| [docs/](docs/)     | The guides, the roadmap, and the completions ledger |

The propagation engine is in a different repository:
[hfcast-engine](https://github.com/jonathanmcsweet/hfcast-engine). It is a Rust
translation of VOACAP. Tests compare it against the Fortran original,
cell by cell.

## GrapheneOS

The application is developed and tested on a Pixel 8 with GrapheneOS.
It reads the position from AOSP, not from Google Play Services, so it
operates on a device that has no Google software.

## What this application does not do

The prediction is a monthly average. Each day of one month gives the
same answer, unless the sunspot number changes. Today can be different,
because the application can use the space weather of today.

So the forecast tells you what a usual day of that month is like, with a
probability. It does not tell you what will occur on Thursday.

The numbers are corrected against measured radio signals. The
[documents](docs/) and the engine repository record what was measured,
what the corrections are, and where they are weakest.

## Built on the work of

Almost all the knowledge in this application comes from other people.
The application shows the same list in its About screen, with links and
the full licence texts.

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

Three of these are live services that the application calls directly,
with no key. It asks NOAA and GIRO one time in 15 minutes at most. It
asks Open-Meteo only when you type a place that the included list does
not have.

The Institute for Telecommunication Sciences, NTIA, US Department of
Commerce developed VOACAP. NTIA/ITS and NOAA do not endorse HFcast.
They are not responsible for what it reports.

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

This project operates VOACAP. It does not replace it.
