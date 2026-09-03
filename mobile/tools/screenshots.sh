#!/usr/bin/env bash
#
# Captures the store screenshots from an attached Android device.
#
#   tools/screenshots.sh phone     # the four phone captures
#   tools/screenshots.sh tablet    # the one ten inch capture
#   tools/screenshots.sh --check   # say what the device holds, change nothing
#
# It stops before each capture and waits, so the app is set up by hand
# between shots. Name one to retake it on its own, by its full name or
# just its number:
#
#   tools/screenshots.sh phone 03-forecast-low-light
#   tools/screenshots.sh phone 03
#
# `--auto` hands the app to maestro instead of prompting, which drives it
# through the whole set from `maestro/`. The device work below is the same
# either way, because maestro captures the framebuffer like anything else
# and so sees the same bars.
#
#   tools/screenshots.sh tablet --auto
#
# The device draws two things the app does not: the status bar at the top,
# carrying whatever notifications happen to be waiting, and the navigation
# bar at the bottom. Both land in the capture. This hides them for the run
# and puts the device back afterwards, including when the run is
# interrupted.
#
# Two ways to hide them, because neither works everywhere. Demo mode
# replaces the status bar with a fixed clock and a full battery, which is
# what most listings show, but a good number of builds refuse it. Failing
# that, `policy_control` hides both bars outright, which every build
# honoured until Android 11 and some still do. `--check` says which one
# this device is likely to take.
#
# A ten inch capture needs no ten inch tablet. `wm size` makes Android
# report a different screen to the app, which then lays out and draws as a
# tablet. The override is clamped to twice the physical size on each axis
# separately, so asking an 800x1280 panel for 2560x1600 yields 1600x1600:
# the width is cut to twice 800 and the height is already under twice 1280.
# So the override is given the same way up as the panel and the rotation is
# forced instead.
#
# Needs `adb` and one attached device.

set -euo pipefail

mobile="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

package='solutions.cloudburner.hfcast'
locale='en-US'

# The set a release needs. F-Droid orders them by filename as text, so the
# numbers are what fixes the order in the listing.
phone_shots=(
  '01-forecast-dark|the forecast on 20m, dark theme'
  '02-forecast-light|the same forecast, light theme'
  '03-forecast-low-light|the same forecast, low light theme'
  '04-antenna-dark|the radio settings, scrolled to Antenna, dark theme'
)

# One, and the wide arrangement is the whole point of it: the band grid
# beside the map card, which no phone capture shows.
tablet_shots=(
  '01-forecast-dark|the forecast in the wide arrangement, dark theme'
)

auto=''
rest=()
for arg in "$@"; do
  if [ "$arg" = '--auto' ]; then auto='yes'; else rest+=("$arg"); fi
done

what="${rest[0]:---check}"
case "$what" in
  phone | tablet | --check) ;;
  *)
    echo "usage: $(basename "$0") [phone|tablet|--check] [shot] [--auto]" >&2
    exit 2
    ;;
esac

# Neither tool is reliably on PATH. adb lives in the SDK's platform-tools,
# which nothing adds for you, and maestro installs under $HOME. Same
# approach as tools/mcp-playwright.sh takes for node: look in the usual
# places and put what is found on PATH, rather than stopping at "not
# found" when the thing is sitting on the disk.
on_path() {
  local name="$1"
  shift
  command -v "$name" > /dev/null 2>&1 && return 0
  local candidate
  for candidate in "$@"; do
    if [ -x "$candidate" ]; then
      PATH="$(dirname "$candidate"):$PATH"
      export PATH
      return 0
    fi
  done
  return 1
}

on_path adb \
  "${ANDROID_HOME:-/nowhere}/platform-tools/adb" \
  "${ANDROID_SDK_ROOT:-/nowhere}/platform-tools/adb" \
  "$HOME/android-sdk/platform-tools/adb" \
  "$HOME/Android/Sdk/platform-tools/adb" \
  "$HOME/Library/Android/sdk/platform-tools/adb" \
  /usr/lib/android-sdk/platform-tools/adb \
  || {
    echo 'adb was not found. it ships in the Android SDK platform-tools' >&2
    exit 1
  }

on_path maestro "$HOME/.maestro/bin/maestro" || true

# `adb devices` lists a header and a blank line either side of the devices.
devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
count="$(printf '%s' "$devices" | grep -c . || true)"
if [ "$count" != '1' ]; then
  echo "expected one attached device, found $count" >&2
  echo "$devices" >&2
  exit 1
fi

prop() { adb shell getprop "$1" | tr -d '\r'; }
setting() { adb shell settings get "$1" "$2" | tr -d '\r'; }

sdk="$(prop ro.build.version.sdk)"
release="$(prop ro.build.version.release)"

if [ "$what" = '--check' ]; then
  echo "device      $devices"
  echo "android     $release (sdk $sdk)"
  adb shell wm size | tr -d '\r' | sed 's/^/screen      /'
  adb shell wm density | tr -d '\r' | sed 's/^/density     /'
  echo "demo mode   sysui_demo_allowed=$(setting global sysui_demo_allowed)"
  echo "policy      policy_control=$(setting global policy_control)"
  # A build that reports no sdk is odd enough to be worth the warning too.
  if ! [ "$sdk" -ge 0 ] 2> /dev/null || [ "$sdk" -ge 30 ]; then
    echo
    echo "Android 11 dropped policy_control, so hiding the bars that way may"
    echo "do nothing here. Demo mode is the one to rely on; check the clock"
    echo "reads 12:00 during a run. If neither takes, capture with the bars"
    echo "and crop them off."
  fi
  exit 0
fi

case "$what" in
  phone)
    dir="$mobile/fastlane/metadata/android/$locale/phoneScreenshots"
    shots=("${phone_shots[@]}")
    ;;
  tablet)
    dir="$mobile/fastlane/metadata/android/$locale/tenInchScreenshots"
    shots=("${tablet_shots[@]}")
    ;;
esac
mkdir -p "$dir"

# --auto hands the whole set to maestro, so a named shot has nothing to
# narrow and the two together are a mistake worth naming.
wanted="${rest[1]:-}"
if [ -n "$auto" ] && [ -n "$wanted" ]; then
  echo 'a named shot and --auto do not go together: the flow takes the' >&2
  echo 'whole set. drop one of them' >&2
  exit 2
fi

# A named shot narrows the set to itself, so retaking one costs one run
# rather than skipping past the rest. The number alone is enough.
if [ -n "$wanted" ]; then
  picked=()
  for shot in "${shots[@]}"; do
    case "${shot%%|*}" in
      "$wanted" | "$wanted"-*) picked+=("$shot") ;;
    esac
  done
  if [ "${#picked[@]}" = '0' ]; then
    echo "the $what set has no shot called $wanted. it holds:" >&2
    printf '  %s\n' "${shots[@]%%|*}" >&2
    exit 2
  fi
  shots=("${picked[@]}")
fi

if [ -n "$auto" ] && ! command -v maestro > /dev/null; then
  echo 'maestro was not found. docs/fdroid.md says how to get it' >&2
  exit 1
fi

# Read before writing, so the trap can put back what was there rather than
# assuming these were unset. `settings get` says "null" for unset.
prior_policy="$(setting global policy_control)"
prior_demo="$(setting global sysui_demo_allowed)"
prior_auto="$(setting system accelerometer_rotation)"
prior_rotation="$(setting system user_rotation)"

put() {
  if [ "$3" = 'null' ]; then
    adb shell settings delete "$1" "$2" > /dev/null 2>&1 || true
  else
    adb shell settings put "$1" "$2" "$3" > /dev/null 2>&1 || true
  fi
}

demo() { adb shell am broadcast -a com.android.systemui.demo "$@" > /dev/null; }

restore() {
  echo
  echo 'putting the device back'
  demo -e command exit 2> /dev/null || true
  put global policy_control "$prior_policy"
  put global sysui_demo_allowed "$prior_demo"
  put system user_rotation "$prior_rotation"
  put system accelerometer_rotation "$prior_auto"
  adb shell wm density reset > /dev/null 2>&1 || true
  adb shell wm size reset > /dev/null 2>&1 || true
}
# Only EXIT runs the restore. The signals turn into an exit so it runs
# once rather than once per signal and again on the way out.
trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "capturing the $what set into $dir"

# Hide both bars. Named for the package, so the rest of the device is
# untouched and a mistake here cannot leave the launcher without buttons.
adb shell settings put global policy_control "immersive.full=$package" > /dev/null

# And dress the status bar as well. If the line above took, the bar is
# gone and this changes nothing visible; if it was refused, this is what
# clears the notification icons.
adb shell settings put global sysui_demo_allowed 1 > /dev/null
demo -e command enter
demo -e command clock -e hhmm 1200
demo -e command battery -e level 100 -e plugged false
demo -e command network -e wifi show -e level 4
demo -e command notifications -e visible false

# Both sets override the screen, so the captures come back the same size
# whatever device took them, and so one tablet can produce both. The
# rotation is forced rather than left to how the device is being held.
adb shell settings put system accelerometer_rotation 0 > /dev/null
case "$what" in
  phone)
    # 412x915 in points at this density, which is the telephone
    # test/rotation.test.ts is written around, and upright because the
    # manifest holds a telephone that way.
    adb shell wm size 1080x2400 > /dev/null
    adb shell wm density 420 > /dev/null
    adb shell settings put system user_rotation 0 > /dev/null
    ;;
  tablet)
    # Portrait, because of the per-axis clamp in the header, then turned.
    # 320 makes it 1280x800 in points, the ten inch tablet the layout
    # reads, and past the 900 the wide arrangement wants.
    adb shell wm size 1600x2560 > /dev/null
    adb shell wm density 320 > /dev/null
    adb shell settings put system user_rotation 1 > /dev/null
    ;;
esac

# Start it after the overrides so it lays out against the new screen.
adb shell monkey -p "$package" -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
sleep 2

# Both of --auto's own checks ran before the device was touched, so this
# is only the run.
if [ -n "$auto" ]; then
  echo 'handing the app to maestro'
  # From `$dir`, because `takeScreenshot` writes beside the working
  # directory and the flow names the files without a path.
  (cd "$dir" && maestro test "$mobile/maestro/$what.yaml")
  exit 0
fi

for shot in "${shots[@]}"; do
  name="${shot%%|*}"
  printf '\n  %s\n  set up: %s\n' "$name" "${shot#*|}"
  key=''
  read -r -p '  enter to capture, s to skip, q to stop: ' key || true
  case "$key" in
    q | Q) break ;;
    s | S) continue ;;
  esac

  adb exec-out screencap -p > "$dir/$name.png"
  if [ ! -s "$dir/$name.png" ]; then
    echo "  capture came back empty, leaving $name alone" >&2
    rm -f "$dir/$name.png"
    continue
  fi
  printf '  wrote %s (%s bytes)\n' "$name.png" "$(wc -c < "$dir/$name.png")"
done
