# hfcast-server

VOACAP predictions and space weather for the HFcast app.

This runs real VOACAP. `voacapl` is the maintained Unix port of the original ITS
Fortran engine, and the server drives it per request rather than approximating
the model in JavaScript.

## Why a server at all

A VOACAP prediction is per _path_, not per date, so it cannot be pre-generated
as static files. With 4-character Maidenhead locators there are 32,400 squares,
so about 1.05 billion ordered pairs, and twelve months on top of that. At
roughly 2 KB per prediction the full set is measured in petabytes.

What does work is caching. Climatology is monthly, so a run stays valid for a
day, and real use concentrates on a handful of paths. The cache is keyed on
path, month and sunspot number, which makes an on-demand service behave much
like pre-generated files without enumerating anything in advance.

## Prerequisites

`voacapl` and its data tree must exist on the host:

```bash
sudo apt-get install gfortran make autoconf automake
git clone https://github.com/jawatson/voacapl.git
cd voacapl
automake --add-missing --copy; autoreconf -i
./configure --prefix=$HOME/.local
make && make install
makeitshfbc          # creates ~/itshfbc
```

Override the locations with `HFCAST_VOACAPL` and `HFCAST_ITSHFBC` if they are
not at `~/.local/bin/voacapl` and `~/itshfbc`.

### The engine

Predictions come from the Rust engine by default, which lives in its own
repository:

```bash
git clone https://github.com/jonathanmcsweet/hfcast-engine.git
cd hfcast-engine
cargo build --release --bin predict
```

The server looks for it at `~/workspace/hfcast-engine/target/release/predict`,
or wherever `HFCAST_PREDICT` points. `HFCAST_ENGINE=fortran` uses `voacapl`
directly instead.

**The engine version is pinned in CI**, in `ENGINE_COMMIT` in
`.github/workflows/ci.yml`. The server and the engine agree on a JSON contract
that nothing else checks, so that pin is the answer to "which engine does this
server work with". Moving it is a deliberate change with the four engine tests
in `test/engine.test.ts` as the evidence.

## Running

```bash
pnpm install
pnpm start           # listens on 127.0.0.1:8787
pnpm test            # deck builder, output parser, geo maths
pnpm typecheck
```

TypeScript runs through Node's type stripping, so there is no build step.

## Routes

| Route                            | Purpose                                               |
| -------------------------------- | ----------------------------------------------------- |
| `GET /health`                    | liveness                                              |
| `GET /api/spaceweather`          | current F10.7, Kp and effective SSN                   |
| `GET /api/geocode?q=`            | place name search, or a locator resolved directly     |
| `GET /api/prediction?from&to`    | one day, `nowcast=1` to drive from current conditions |
| `GET /api/forecast?from&to&days` | several days, one prediction each                     |

`from` and `to` accept either a Maidenhead locator (`CN87`) or `lat,lon`.

## Sunspot numbers

VOACAP is fitted against the twelve-month _smoothed_ sunspot number, so it
cannot be handed today's raw count. Three cases:

- **climatology** — the observed smoothed SSN for a past month
- **forecast** — SWPC's predicted smoothed SSN, used for the current and future
  months, because observed smoothed values lag about six months and are
  published as `-1.0` until available
- **nowcast** — an _effective_ SSN inferred from current conditions, which is
  what makes the model describe now rather than a typical month

Effective SSN inverts the standard `F = 63.7 + 0.728R + 0.00089R²` relation and
then derates for geomagnetic activity. The derate is a heuristic, not a
published relation, and is recorded as open work in `docs/roadmap.md`.

## Parsing notes

The VOACAP input deck is punched-card fixed width: a 10-character keyword field
then 5-character numeric fields with no separators. Values that fill a field run
straight into the next one, so `9.7011.85` is two numbers. Both the deck builder
and the output parser work by column position, and the tests assert those
positions byte-for-byte against output from a real run.

In a method 30 listing each hour is a block starting with a line ending in
`FREQ`. The first data column is the value at the MUF, not a requested
frequency, so the bands start one column later.

## Assumptions

Every run is isotropic at both ends at 100 W, with a required SNR of 24 dB and
3 MHz man-made noise of -145 dBW. Those are defaults for a modest amateur
station and can be overridden per request with `watts`, `snr` and `noise`.
