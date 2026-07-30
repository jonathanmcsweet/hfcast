# HFcast

HF radio propagation forecasts, presented the way a weather app presents
weather.

VOACAP output is climatology with a probability attached, which is
structurally the same thing a weather forecast is. So the app borrows the
weather app's vocabulary — conditions now, an hourly strip, a per-band
list, a 24-hour grid — rather than inventing a new one for radio.

## What is here

| Part               | What it is                                            |
| ------------------ | ----------------------------------------------------- |
| [hfcast/](hfcast/) | The app. React Native, Expo, Material Design 3        |
| [server/](server/) | The prediction API, for builds with no engine in them |
| [docs/](docs/)     | Roadmap and the completions ledger                    |

The propagation engine lives in its own repository,
[hfcast-engine](https://github.com/jonathanmcsweet/hfcast-engine): a Rust port of
VOACAP verified against the Fortran reference, with the harness that
verifies it. The server drives either that or `voacapl` directly.

## Running it

An Android build carries the engine and needs nothing else. The web build
does not, so it reads from the server — and one command starts both, waits
for the server to answer, and stops it again on exit.

```sh
pnpm install
pnpm dev:app        # or `pnpm dev` — then press w, i or a
```

If a server is already listening, that one is used and left running. To
start either half alone:

```sh
pnpm dev:server     # the server, on http://127.0.0.1:8787
pnpm dev:ui         # the app, against a server elsewhere or a mocked API
```

Each has its own README with the details.

The server needs `voacapl` and an `itshfbc` data tree on the host. That
is a manual build step, documented in [server/README.md](server/README.md).

## What it is honest about

Predictions are monthly climatology, so every day in a month returns the
same answer unless the sunspot number moves. Today can differ because it
can be a now-cast, using live space weather. The forecast says what a
typical day of that month looks like, with a probability — not what will
happen on Thursday.

The model's numbers are corrected against measured radio rather than
trusted as they come. [docs/](docs/) and the engine repository record
what was measured, what the corrections are, and where they are weakest.

## Built on the work of

Nearly everything this app knows comes from somebody else. The app carries the
same list in its About screen, with links and full licence texts, which is
where the obligations are actually discharged — this is here so a reader of the
source sees it too.

| What                                                                                                                            | Whose                                            | Terms                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| [VOACAP](https://its.ntia.gov/), the propagation model                                                                          | NTIA/ITS, maintained by Greg Hand                | US Government work, not subject to copyright protection in the US |
| [voacapl](https://github.com/jawatson/voacapl), the Unix port this engine was translated from                                   | J.A. Watson                                      | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)         |
| [The ionospheric coefficient maps](https://www.itu.int/rec/R-REC-P.1239/)                                                       | CCIR Report 340 and URSI, published by ITU-R     | published for implementers free from copyright assertions         |
| The place list searched offline                                                                                                 | NTIA/ITS, from the VOACAP distribution           | US Government work                                                |
| [Coastlines and country borders](https://www.naturalearthdata.com/)                                                             | Natural Earth                                    | public domain                                                     |
| [Sunspot numbers and solar indices](https://www.swpc.noaa.gov/)                                                                 | NOAA Space Weather Prediction Center             | US Government work                                                |
| [Measured ionosonde soundings](https://giro.uml.edu/)                                                                           | UMass Lowell Global Ionosphere Radio Observatory | used with attribution                                             |
| [Place search, when online](https://open-meteo.com/)                                                                            | Open-Meteo                                       | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)         |
| [The aurora on the launch screen](https://commons.wikimedia.org/wiki/File:ISS-42_Aurora_borealis_over_North_Atlantic_Ocean.jpg) | NASA / Samantha Cristoforetti, ESA               | public domain                                                     |
| [IBM Plex Sans](https://github.com/IBM/plex), the typeface                                                                      | IBM                                              | SIL Open Font License 1.1                                         |

Three of them are live services the app calls directly, without a key. NOAA and
GIRO are asked once every fifteen minutes at most; Open-Meteo only when
somebody types a place the bundled list does not hold.

VOACAP was developed by the Institute for Telecommunication Sciences, NTIA, US
Department of Commerce. Neither NTIA/ITS nor NOAA endorses HFcast, and neither
is responsible for anything it reports.

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

This project drives VOACAP; it does not replace it.
