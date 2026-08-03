/**
 * `src/render/available.ts` as the legacy build sees it.
 *
 * `tools/build-android.sh` copies `legacy/render/` over `src/render/`
 * for the legacy build, which has no `@shopify/react-native-skia` in its
 * dependency set. Saying so here is what sends `CoverageGlobe` down its
 * SVG path — and what keeps every file that names the package out of
 * that build, since a bundler follows imports before any code runs.
 */
export const hasSkia = false;
