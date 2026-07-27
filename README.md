# HFcast

HF radio propagation forecasts, presented the way a weather app presents
weather.

VOACAP output is climatology with a probability attached, which is
structurally the same thing a weather forecast is. So the app borrows the
weather app's vocabulary — conditions now, an hourly strip, a per-band
list, a 24-hour grid — rather than inventing a new one for radio.

## What is here

| Part               | What it is                                             |
| ------------------ | ------------------------------------------------------ |
| [hfcast/](hfcast/) | The app. React Native, Expo, Material Design 3         |
| [server/](server/) | The prediction API. VOACAP runs here, not on the phone |
| [docs/](docs/)     | Roadmap and the completions ledger                     |

The propagation engine lives in its own repository,
[hfcast-engine](https://github.com/jonathanmcsweet/hfcast-engine): a Rust port of
VOACAP verified against the Fortran reference, with the harness that
verifies it. The server drives either that or `voacapl` directly.

## Running it

The app needs the server, so start the server first. Each has its own
README with the details:

```sh
pnpm install
pnpm dev:server     # http://127.0.0.1:8787
pnpm dev:app        # then press w, i or a
```

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

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

VOACAP itself is the work of NTIA/ITS, maintained by Greg Hand, with the
Unix port by J.A. Watson under CC0. This project drives that model; it
does not replace it.
