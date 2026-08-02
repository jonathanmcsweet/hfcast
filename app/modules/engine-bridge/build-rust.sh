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

for entry in "${targets[@]}"; do
  read -r triple abi linker_prefix <<<"$entry"
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
      --target "$triple" --jobs "${CARGO_JOBS:-2}"

  out="$here/android/src/main/jniLibs/$abi"
  mkdir -p "$out"
  cp "$here/rust/target/$triple/release/libhfcast_jni.so" "$out/"
done

echo
echo "libraries in $here/android/src/main/jniLibs:"
du -h "$here/android/src/main/jniLibs"/*/*.so
