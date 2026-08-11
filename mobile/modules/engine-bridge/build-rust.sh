#!/usr/bin/env bash
#
# Builds the engine as one shared library per Android ABI and puts them where
# Gradle packages them from.
#
# Run it before `expo prebuild` or a Gradle build. The output is committed
# nowhere: `jniLibs/` is generated, like `android/` is.
#
# Needs the Android NDK and the four Rust targets:
#
#   sdkmanager 'ndk;27.1.12297006'
#   rustup target add aarch64-linux-android armv7-linux-androideabi \
#                     i686-linux-android x86_64-linux-android
#
# ANDROID_HOME must point at the SDK. NDK_VERSION can override the version
# below when the SDK has more than one.
#
# It also needs a checkout of the engine repository beside this one, because
# the APK carries the ionospheric coefficients and the published crate does
# not have them. HFCAST_ENGINE names it; with nothing set, each parent
# directory is examined for `hfcast-engine`. See the block below.
#
# Arguments name the ABIs to build. With none it builds all four:
#
#   build-rust.sh                    # all four
#   build-rust.sh arm64-v8a          # one, which is what a CI matrix leg asks for
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ndk_version="${NDK_VERSION:-27.1.12297006}"
sdk="${ANDROID_HOME:-$HOME/android-sdk}"
ndk="$sdk/ndk/$ndk_version/toolchains/llvm/prebuilt/linux-x86_64/bin"

if [[ ! -d $ndk ]]; then
  echo "no NDK at $ndk" >&2
  echo "install it with: sdkmanager 'ndk;$ndk_version'" >&2
  exit 1
fi

# Where the engine comes from.
#
# `rust/Cargo.toml` asks for the published crate, which is the version the
# application is built against. But this build turns on
# `embedded-coefficients`, and the published crate does not carry the
# coefficient files: part of that data is CCIR Report 322 and 340 material
# that the engine does not redistribute. So an APK is built from a checkout
# of the engine repository, which has the files.
#
# A `[patch.crates-io]` entry does that. It replaces where the crate comes
# from and nothing else, so `Cargo.toml` still says which version the
# application depends on.
#
# It used to be a `paths` override, which cannot do the other job this has
# to do: trying an engine change here before it is published. A `paths`
# override only replaces a crate with a local copy carrying the same
# version, so the moment the checkout is a version ahead of the registry it
# stops applying and the build fails to resolve. A patch has no such rule.
engine="${HFCAST_ENGINE:-}"
if [[ -z $engine ]]; then
  dir="$here"
  while [[ $dir != / ]]; do
    if [[ -f $dir/hfcast-engine/embedded/coeffs/coeff01w.bin ]]; then
      engine="$dir/hfcast-engine"
      break
    fi
    dir="$(dirname "$dir")"
  done
fi

if [[ -z $engine ]]; then
  echo "no engine checkout found beside this repository" >&2
  echo >&2
  echo "The APK has the ionospheric coefficients compiled in, and the" >&2
  echo "published crate does not carry them. Clone the engine next to" >&2
  echo "this repository, or name it:" >&2
  echo >&2
  echo "  git clone https://github.com/jonathanmcsweet/hfcast-engine.git" >&2
  echo "  HFCAST_ENGINE=/path/to/hfcast-engine $(basename "${BASH_SOURCE[0]}")" >&2
  exit 1
fi
echo "engine: $engine"

# The minimum API this build supports, which differs between the two APKs: 24
# for the modern one and 21 for the legacy one. A library built against a newer
# API than the app declares fails to load on an older device rather than at
# build time, which is why the caller passes it rather than it being assumed.
api="${ANDROID_API:-24}"

# Rust target, Android ABI directory, and the linker's own name for the target,
# which differs from the Rust triple for 32-bit ARM.
targets=(
  "aarch64-linux-android arm64-v8a aarch64-linux-android"
  "armv7-linux-androideabi armeabi-v7a armv7a-linux-androideabi"
  "x86_64-linux-android x86_64 x86_64-linux-android"
  "i686-linux-android x86 i686-linux-android"
)

wanted=("$@")
built=0

# Keep the committed `Cargo.lock` describing the published crate.
#
# The patch below replaces where the engine comes from, and cargo records
# that in the lock file: the `hfcast` entry loses its `source` and its
# `checksum`, because a patched crate has neither. That leaves the
# repository holding a lock file which pins nothing — the version in it
# means "whatever is in the checkout beside this repository", and CI
# installs the crate from crates.io on the strength of a checksum that is
# no longer there.
#
# It also breaks the one command `rust/Cargo.toml` tells a maintainer to
# use: `cargo update -p hfcast --precise <version>` answers "package ID
# specification `hfcast` did not match any packages", because the package
# in the lock is no longer a registry one (user, 2026-08-10).
#
# So the lock is put back the way it was found. The build still resolves
# through the patch; what does not survive it is the edit to a file under
# version control that nobody asked for.
lock="$here/rust/Cargo.lock"
if [[ -f $lock ]]; then
  held="$(mktemp)"
  cp "$lock" "$held"
  # On every exit, including a failed build and an interrupted one.
  trap 'cp "$held" "$lock"; rm -f "$held"' EXIT
fi

for entry in "${targets[@]}"; do
  read -r triple abi linker_prefix <<<"$entry"

  # With no arguments every ABI is wanted. With arguments, only the named
  # ones, so that one CI job can build one ABI and fail on its own.
  if [[ ${#wanted[@]} -gt 0 ]] && ! printf '%s\n' "${wanted[@]}" | grep -qx "$abi"; then
    continue
  fi

  linker="$ndk/${linker_prefix}${api}-clang"
  if [[ ! -x $linker ]]; then
    echo "no linker for $abi at $linker" >&2
    exit 1
  fi

  # Cargo reads the linker from an environment variable named after the target
  # in upper case with dashes as underscores.
  var="CARGO_TARGET_$(echo "$triple" | tr 'a-z-' 'A-Z_')_LINKER"
  echo "building $abi"
  env "$var=$linker" \
    "CC_${triple//-/_}=$linker" \
    "AR_${triple//-/_}=$ndk/llvm-ar" \
    cargo build --release --manifest-path "$here/rust/Cargo.toml" \
      --config "patch.crates-io.hfcast.path=\"$engine\"" \
      --target "$triple" --jobs "${CARGO_JOBS:-2}"

  out="$here/android/src/main/jniLibs/$abi"
  mkdir -p "$out"
  cp "$here/rust/target/$triple/release/libhfcast_jni.so" "$out/"
  built=$((built + 1))
done

# An ABI name with a typo would otherwise build nothing and report success.
if [[ ${#wanted[@]} -gt 0 && $built -ne ${#wanted[@]} ]]; then
  echo "asked for ${#wanted[@]} ABIs and built $built. Names are:" >&2
  printf '  %s\n' arm64-v8a armeabi-v7a x86_64 x86 >&2
  exit 1
fi

echo
echo "libraries in $here/android/src/main/jniLibs:"
du -h "$here/android/src/main/jniLibs"/*/*.so
