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

**The engine is pinned to a published version**, the `hfcast` version in
`mobile/modules/engine-bridge/rust/Cargo.lock`. CI installs that version from
crates.io. The server and the engine agree on a JSON contract that nothing else
checks, so that pin is the answer to "which engine does this server work with".
Moving it is a deliberate change with the four engine tests in
`test/engine.test.ts` as the evidence.

## Running

```bash
pnpm install
pnpm start           # listens on 127.0.0.1:8787
pnpm test            # deck builder, output parser, geo maths
pnpm typecheck
```

TypeScript runs through Node's type stripping, so there is no build step.

### How much of the host it may use

Every prediction, and every strip of a split coverage grid, is a separate
process. `HFCAST_ENGINE_SLOTS` is how many of them may be alive at once;
it defaults to the core count, to a maximum of eight. Callers past that
wait in the order they arrived rather than being refused.

`/api/coverage/fine` is the route this matters for: it runs a
34,560-point grid split across up to `HFCAST_COVERAGE_SHARDS` processes,
so without a cap a handful of simultaneous callers can take the whole
machine. `GET /health` reports the slots, how many are free, and how many
callers are queued.

Identical requests that arrive together are collapsed into one run, so
two readers looking at the same map cost what one does.

## Routes

| Route                                    | Purpose                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| `GET /health`                            | liveness                                              |
| `GET /api/spaceweather`                  | current F10.7, Kp and effective SSN                   |
| `GET /api/geocode?q=`                    | place name search, or a locator resolved directly     |
| `GET /api/prediction?from&to`            | one day, `nowcast=1` to drive from current conditions |
| `GET /api/survey?from`                   | one day with no destination, as reach by direction    |
| `GET /api/coverage?from&band&hour`       | the whole world, one band, one hour                   |
| `GET /api/coverage/patch?from&band&hour` | the same hour over a fine grid near `from`            |
| `GET /api/ionosonde?lat&lon`             | a measured foF2 from a sounder near the point         |

`from` and `to` accept either a Maidenhead locator (`CN87`) or `lat,lon`.

The two coverage routes are separate because they are meant to be fetched
separately: the whole world is the answer and has to be drawn as soon as
it exists, and the fine grid is detail that arrives behind it. The patch
answers `null` for a station within about three degrees of the
antimeridian, which is a fact about where it is rather than a failure —
the grid cannot cross that meridian. See `src/coveragePatch.ts`.

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
published relation, and is recorded as open work.

## Parsing notes

The VOACAP input deck is punched-card fixed width: a 10-character keyword field
then 5-character numeric fields with no separators. Values that fill a field run
straight into the next one, so `9.7011.85` is two numbers. Both the deck builder
and the output parser work by column position, and the tests assert those
positions byte-for-byte against output from a real run.

In a method 30 listing each hour is a block starting with a line ending in
`FREQ`. The first data column is the value at the MUF, not a requested
frequency, so the bands start one column later.

## The station

Every run describes a station: how much power, what the signal has to be
good enough for, and what antenna it leaves from. The defaults are a
modest one — 100 W, isotropic at both ends, a CW threshold, and 3 MHz
man-made noise of -145 dBW.

| parameter   | what it sets                               | default     |
| ----------- | ------------------------------------------ | ----------- |
| `watts`     | transmit power, 1 to 10,000                | `100`       |
| `mode`      | the required signal-to-noise               | `cw`        |
| `snr`       | that threshold directly, dB                | from `mode` |
| `noise`     | man-made noise at 3 MHz, dBW below zero    | `145`       |
| `ant`       | antenna family                             | `isotropic` |
| `antHeight` | height above ground, metres, 1 to 100      | `10`        |
| `antGain`   | gain over a dipole, dB, 0 to 20. Yagi only | `6`         |
| `beam`      | main beam bearing, degrees true            | `0`         |

`mode` is one of `fm`, `am`, `ssb`, `rtty`, `cw`, `psk31`, `ft8`, `js8`,
`wspr`. `ant` is one of `isotropic`, `dipole`, `invertedV`, `vertical`,
`yagi`, `invertedL`. An unknown value for either is a 400 naming the
valid set.
`snr` still overrides `mode` when both are given, so the threshold can be
measured directly without finding a mode that happens to produce it.

Signal-to-noise is in a 1 Hz bandwidth, as is the noise figure. A mode's
requirement converts as `in-channel SNR + 10*log10(bandwidth)`, so 24 dB
is roughly CW by ear; SSB voice is near 38 dB, FT8 near 13, WSPR near 5.
`src/station.ts` holds the table and where each figure comes from.

Only the operator's own end takes an antenna. The far end belongs to a
station this server knows nothing about, so it stays isotropic:
inventing an antenna for them would move every number without being any
more true.

`beam` is read by every family whose pattern depends on azimuth: the
dipole, the inverted V, the inverted L and the yagi. It decides the answer rather than
refining it. Measured on Seattle to Tokyo at 14 MHz with a 20 m dipole,
the same antenna gives 32.5 dB and 89% reliability broadside to the path
and 16.9 dB and 0% off the ends of the wire. The vertical monopole
ignores it — swept through the whole compass it moves 0 dB — so the app
does not send one for it, which keeps it out of the cache key.

A dipole and an inverted L favour two opposite directions equally: the
engine's own output repeats exactly every 180 degrees.

Antennas are generated as VOACAP definition files under
`<itshfbc>/antennas/hfcast/`, named from a digest of their own contents.
The server needs write access to that directory. Height is the parameter
that decides most amateur answers: at 14 MHz a dipole one wavelength up
beats the same dipole a quarter wave up by about 9 dB at the low angles a
long path needs.
