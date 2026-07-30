# HFcast privacy policy

Last updated: 30 July 2026.

Host this where the app store listing can link to it. Google Play requires a
reachable URL; F-Droid, Accrescent and Obtainium do not, but the same statement
serves for all of them.

## The short version

HFcast has no account, no analytics, no advertising and no crash reporting. It
does not collect anything about you, and there is no server belonging to this
project for anything to be collected on.

## What stays on your device

All of it, by default. The propagation model, its ionospheric data and a
worldwide list of places are inside the app, so a forecast is computed on the
phone. That includes:

- The places you choose, and your own position if you use the location button
- Your station: power, mode, antenna, and any presets you name
- Your display settings

These are stored in the app's own private storage. Uninstalling removes them.
Nothing is copied off the device.

## Location

If you press the location button, the app asks Android for a position, uses it
to fill in the transmitting end of the path, and stores it on the device with
your other settings. It is never transmitted anywhere.

Location comes from Android's own `LocationManager`, not from Google Play
Services. The permission is optional: you can type a place name or a Maidenhead
locator instead, and the app is fully usable without ever granting it.

## The only requests the app makes

Two features reach the network, both optional and neither required for a
forecast:

- **Space weather.** If shown, the app fetches current solar and geomagnetic
  indices from the NOAA Space Weather Prediction Center. The request carries no
  information about you or your location — it asks for the same public figures
  everybody gets.
- **Searching for a place the built-in list does not have.** The bundled list
  holds about four thousand cities. If you search for somewhere smaller, the
  text you typed is sent to Open-Meteo's public geocoding service to look up.
  Your position is not sent, and the search is not tied to any identifier.

In aeroplane mode both simply do not happen, and everything else still works.

## Optional prediction server

The app can be pointed at a prediction server instead of using the engine on the
device, which is how the web build works. If you set a server address, the ends
of the path and your station settings are sent to whichever machine you named,
because that is what computing the forecast requires. You choose that address;
this project runs no such server for you.

## Children

The app is not directed at children and collects nothing from anyone.

## Changes

Any change to this policy will be published with a new version of the app and
the date above updated.

## Contact

Raise an issue on the project's tracker.
