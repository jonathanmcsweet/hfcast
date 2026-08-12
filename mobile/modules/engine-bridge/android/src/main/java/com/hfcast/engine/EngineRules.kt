package com.hfcast.engine

import android.os.BatteryManager
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

/**
 * The decisions this module makes that need no Android and no engine.
 *
 * Kept apart from `HfcastEngineModule.kt` for the reason `globeName.ts` is
 * kept apart from `globeStore.ts` on the other side of the boundary: none
 * of this touches a file, a device or the shared library, so a plain JVM
 * can run it and a test does not need a telephone. That matters here more
 * than usual — the nearest Android device to this code is one somebody
 * has to pick up.
 *
 * Nothing here is a method. These are the rules; the class beside them
 * only carries them out.
 */

/**
 * What a map being written is called until it is written.
 *
 * A name nothing else can take, so a listing can tell an unfinished write
 * from a stored map and neither counts the other.
 */
const val PART = ".writing"

/**
 * Whether a map may be stored under this name.
 *
 * Flat names only. Nothing needs a directory tree here, and a name that
 * cannot hold a separator cannot climb out of the directory it belongs
 * in. A half-written file's name is refused as well, so that a caller
 * cannot read or delete one by asking for it directly.
 */
fun isMapName(name: String): Boolean =
  name.isNotEmpty() &&
    !name.contains("/") &&
    !name.contains("..") &&
    !name.endsWith(PART)

/**
 * Whether the app may write this name for the engine to read.
 *
 * The app writes exactly one kind of file — an antenna description — and
 * it names it relative to a directory this module owns. Climbing out of
 * that directory is the thing being refused.
 */
fun isEngineInputName(name: String): Boolean =
  name.isNotEmpty() && !name.contains("..") && !name.startsWith("/")

/** One stored map, as the listing reports it. */
data class StoredMap(
  val name: String,
  /** Its size on disk. */
  val bytes: Long,
  /** When it was last read, in milliseconds since the epoch. */
  val at: Long,
)

/**
 * The listing, written as the JSON the app parses.
 *
 * JSON rather than a list of objects because the two builds of this app
 * convert those differently and a string does not. The three key names
 * are read on the other side by `listMapCache` in `index.ts`, and nothing
 * but a test holds the two together.
 */
fun listingJson(maps: List<StoredMap>): String =
  JSONArray(
    maps.map { map ->
      JSONObject()
        .put("name", map.name)
        .put("bytes", map.bytes)
        .put("at", map.at)
    },
  ).toString()

/**
 * Whether a battery status means the device is on power.
 *
 * "Full" counts. A device left on a charger overnight reports full rather
 * than charging, and a job that stopped at 100% would stop at exactly the
 * moment it was safest to run.
 */
fun onPower(status: Int): Boolean =
  status == BatteryManager.BATTERY_STATUS_CHARGING ||
    status == BatteryManager.BATTERY_STATUS_FULL

/** What one batch of strips cost, for the line in the log. */
data class BatchTiming(
  val strips: Int,
  val threadsAsked: Int,
  /** How many were ever running at the same moment. */
  val widest: Int,
  /** The clock on the wall, in milliseconds. */
  val wallMs: Long,
  /** Time inside the engine, added across the strips. */
  val engineMs: Long,
  /** Processor time the threads actually held, added across the strips. */
  val cpuMs: Long,
  /** How much text came back. */
  val characters: Int,
)

/**
 * The two ratios that separate a slow telephone from a stalled pool.
 *
 * `inFlight` is engine time over wall time: how many strips were running
 * at once. It reads eight even when all eight are only waiting, so on its
 * own it cannot tell a busy pool from a starved one.
 *
 * `coresBusy` is processor time over wall time: how many cores were
 * really held. In flight high with cores busy low means the threads are
 * waiting for a core — the scheduler, or heat. Both high while each strip
 * is slow means the cores are held but starved, which is memory.
 *
 * A batch that took no measurable time reports zero rather than dividing
 * by it.
 */
fun ratios(timing: BatchTiming): Pair<Double, Double> =
  if (timing.wallMs <= 0) {
    0.0 to 0.0
  } else {
    timing.engineMs.toDouble() / timing.wallMs to
      timing.cpuMs.toDouble() / timing.wallMs
  }

/**
 * The batch's line in the Android log.
 *
 * `Locale.ROOT` for the two ratios. Formatted in the device's own locale,
 * a number would be written with a comma in much of the world, and this
 * line is read by whoever is holding the telephone rather than by the
 * person whose language it is in.
 */
fun batchLine(timing: BatchTiming): String {
  val (inFlight, coresBusy) = ratios(timing)
  val one = { value: Double -> String.format(Locale.ROOT, "%.1f", value) }
  return "batch | ${timing.strips} strips | ${timing.threadsAsked} threads asked | " +
    "${timing.widest} at once | wall ${timing.wallMs} ms | " +
    "engine ${timing.engineMs} ms | cpu ${timing.cpuMs} ms | " +
    "${one(inFlight)} in flight | ${one(coresBusy)} cores busy | " +
    "${timing.characters} chars back"
}
