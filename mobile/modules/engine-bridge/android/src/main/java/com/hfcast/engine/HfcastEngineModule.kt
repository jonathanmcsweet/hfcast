package com.hfcast.engine

import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONArray
import org.json.JSONObject

/**
 * VOACAP, in the app.
 *
 * The engine is a Rust library compiled into this APK, one shared object per
 * ABI, with its 653 KB of coefficient files compiled into it. So a forecast
 * needs no server and no network: the same code the server runs, reached
 * through the same JSON interface, in this process.
 *
 * The request may name where data comes from. `<embedded>` means the files
 * inside the library. `<embedded>+<dir>` means look in that directory first —
 * which is how a generated antenna definition is passed in, since the engine
 * reads an antenna by filename and the app writes one per station.
 */

internal class EngineFailedException(message: String) :
  CodedException("The prediction engine failed: $message")

class HfcastEngineModule : Module() {
  /**
   * One thread, and not the one the interface is drawn on.
   *
   * A point-to-point run is about 15 ms on a desktop, and a coverage run over
   * a couple of hundred grid points is far heavier. Neither belongs on the
   * JavaScript thread. One thread rather than a pool because the engine is
   * called per screen rather than per frame, and because a phone with two
   * predictions in flight is a phone doing something the app did not intend.
   */
  private val worker = Executors.newSingleThreadExecutor()

  /**
   * One thread for stored maps, and not the engine's.
   *
   * Reading a stored map exists to avoid a run that takes a second and a
   * half. Queued behind the engine's own thread it would wait for
   * exactly the run it was meant to replace, so it gets a thread of its
   * own. One rather than a pool, so a read that follows a write sees
   * what the write put there.
   */
  private val files = Executors.newSingleThreadExecutor()

  /**
   * Whether a batch reports where its time went.
   *
   * Off unless something turns it on, so an ordinary build measures nothing.
   * See `setTracingNative` in the Rust: the same switch also makes each
   * prediction report how long it spent reading the request, computing, and
   * handing the answer back across the boundary.
   */
  @Volatile
  private var tracing = false

  override fun definition() = ModuleDefinition {
    Name("HfcastEngine")

    /**
     * The one thing the notification can tell the app: Stop was pressed.
     *
     * The button ends the job through the same path the button inside the
     * app uses, rather than tearing the service down under it, so a job
     * always ends one way and always leaves the disk in one state.
     */
    Events("onBackgroundStop")

    OnCreate {
      PrecomputeService.onStopRequested = {
        sendEvent("onBackgroundStop", emptyMap<String, Any>())
      }
    }

    OnDestroy {
      PrecomputeService.onStopRequested = null
    }

    /**
     * Starts, or updates, the notification that keeps a job running.
     *
     * One function for both because the service is started with the same
     * intent either way: Android delivers it to the running instance if
     * there is one, and `setOnlyAlertOnce` keeps a moving count from
     * making a sound. The wording arrives from the app rather than being
     * written here — the app has five languages and this module has none.
     *
     * Returns whether it started. False on a device that refuses the
     * service, and the job then runs exactly as it did before: fine while
     * the app is open, stopped when it is not.
     */
    Function("startBackgroundWork") { title: String, text: String, done: Int, total: Int, stopLabel: String ->
      return@Function runService(
        PrecomputeService.ACTION_START,
        title,
        text,
        done,
        total,
        stopLabel,
      )
    }

    /** Takes the notification down and lets the processor sleep again. */
    Function("stopBackgroundWork") {
      return@Function runService(PrecomputeService.ACTION_STOP, "", "", 0, 0, "")
    }

    /**
     * Whether the device is on power.
     *
     * Read from the sticky battery broadcast rather than
     * `BatteryManager.isCharging`, which arrived in Android 6 — the older
     * of the two builds targets Android 5. Asking with a null receiver
     * returns the last broadcast without registering anything, so this
     * costs no lifecycle and can be called whenever the answer is wanted.
     *
     * "Full" counts as charging. A device left on a charger overnight
     * reports full rather than charging, and a job that stopped at 100%
     * would be stopping at exactly the moment it was safest to run.
     */
    Function("isCharging") {
      val context = appContext.reactContext ?: return@Function false
      val status = context
        .registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        ?.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        ?: -1
      return@Function status == BatteryManager.BATTERY_STATUS_CHARGING ||
        status == BatteryManager.BATTERY_STATUS_FULL
    }

    /**
     * Turns the timing lines on or off.
     *
     * They go to the Android log under the `hfcast` tag, on both sides of the
     * boundary, so one `logcat -s hfcast` shows the whole path: what the app
     * asked for, what each thread spent computing, what the crossing cost, and
     * what the batch took in total.
     *
     * A switch rather than a build flag because the measurement worth having
     * is of the build that ships. A phone reported 3.9 seconds for a grid this
     * engine computes in 0.17 on a desktop, and a debug build would not answer
     * why.
     */
    Function("setTracing") { on: Boolean ->
      tracing = on
      setTracingNative(on)
      return@Function on
    }

    /**
     * Where the app may write files the engine should read — its own cache
     * directory. Returned rather than assumed, because the app builds the
     * antenna path and needs to know where it may put it.
     */
    Function("scratchDirectory") {
      return@Function scratch().absolutePath
    }

    /**
     * How many cores a batch may spread across.
     *
     * The caller decides how many threads to ask for, and the only fact it
     * cannot work out for itself is how many this device has. Reported here
     * rather than guessed at four, which was too few on every phone shipped
     * in the last decade and too many on none of them.
     *
     * `availableProcessors` is what the runtime will actually schedule on,
     * so a device that has parked its big cores reports the smaller number.
     * That is the right answer for a batch about to start, and it is why
     * this is a call rather than a constant read once.
     */
    Function("cores") {
      return@Function Runtime.getRuntime().availableProcessors()
    }

    /**
     * Writes one file the engine will read, under the scratch directory.
     *
     * Here rather than in JavaScript so the app needs no filesystem library of
     * its own: the only file it writes is an antenna definition, and the code
     * that reads it is on this side of the boundary. `name` is relative and
     * may not climb out of the directory.
     */
    AsyncFunction("writeFile") { name: String, contents: String, promise: Promise ->
      worker.execute {
        if (name.contains("..") || name.startsWith("/")) {
          promise.reject(EngineFailedException("bad file name: $name"))
          return@execute
        }
        try {
          val file = File(scratch(), name)
          file.parentFile?.mkdirs()
          file.writeText(contents)
          promise.resolve(file.absolutePath)
        } catch (e: Throwable) {
          promise.reject(EngineFailedException(e.message ?: e.toString()))
        }
      }
    }

    /**
     * Whether this device has a memory card the app may write maps to.
     *
     * The tablets this app is for are often short of internal storage and
     * take a card, and a year of maps is the largest thing this app will
     * ever ask to keep. So the choice is offered where a card exists and
     * is not mentioned where none does.
     */
    Function("mapCardAvailable") {
      return@Function cardRoot() != null
    }

    /**
     * Puts stored maps on the memory card, or back in internal storage.
     *
     * Answers with where they are now, which is not always what was
     * asked: a card that has been taken out cannot hold them, and the
     * app falls back rather than failing.
     *
     * Maps already stored in the other place are left there. They are not
     * counted, not read and not dropped while this setting stands, and
     * they come back if it is changed back. Moving them would be a long
     * copy at the moment somebody flicked a switch, and deleting them
     * would throw away an hour of computing without asking.
     */
    Function("setMapCardUse") { on: Boolean ->
      onCard = on && cardRoot() != null
      return@Function maps().absolutePath
    }

    /**
     * Reads one stored map, as base64, or null where there is none.
     *
     * Stored maps are the answer to a question this app cannot solve by
     * computing faster: a person on a hill has no network, an old tablet
     * takes a long time over a whole-world grid, and the answer does not
     * change for the rest of the month. So a map computed at home on a
     * charger is kept, and read back in the field for the cost of a file.
     *
     * Base64 rather than a typed array because the two builds of this app
     * are on library versions that do not agree about typed arrays, and a
     * string is carried the same way by both. See `base64.ts` for the
     * other side and what it costs.
     *
     * A missing file is not a failure. It is the ordinary answer for
     * every map that has not been computed yet, and the caller computes
     * one.
     */
    AsyncFunction("readMapCache") { name: String, promise: Promise ->
      files.execute {
        val file = mapFile(name)
        if (file == null) {
          promise.reject(EngineFailedException("bad map name: $name"))
          return@execute
        }
        try {
          if (!file.isFile) {
            promise.resolve(null)
            return@execute
          }
          val bytes = file.readBytes()
          // The clock on the file becomes the last time it was read
          // rather than the last time it was written. That is what makes
          // "drop the least recently used" mean what it says, instead of
          // dropping the map a person opens every day because it was
          // computed first.
          file.setLastModified(System.currentTimeMillis())
          promise.resolve(Base64.encodeToString(bytes, Base64.NO_WRAP))
        } catch (e: Throwable) {
          promise.reject(EngineFailedException(e.message ?: e.toString()))
        }
      }
    }

    /**
     * Stores one map, and answers with how many bytes it took.
     *
     * Written under another name and moved into place. A phone that is
     * switched off part way through a write would otherwise leave half a
     * file, and half a file that is read as a map draws a wrong one. The
     * move is the step that either happened or did not.
     */
    AsyncFunction("writeMapCache") { name: String, contents: String, promise: Promise ->
      files.execute {
        val file = mapFile(name)
        if (file == null) {
          promise.reject(EngineFailedException("bad map name: $name"))
          return@execute
        }
        var part: File? = null
        try {
          val bytes = Base64.decode(contents, Base64.NO_WRAP)
          file.parentFile?.mkdirs()
          val writing = File(file.parentFile, "${file.name}$PART")
          part = writing
          writing.writeBytes(bytes)
          if (!writing.renameTo(file)) {
            promise.reject(EngineFailedException("could not store $name"))
            return@execute
          }
          part = null
          promise.resolve(bytes.size)
        } catch (e: Throwable) {
          promise.reject(EngineFailedException(e.message ?: e.toString()))
        } finally {
          // A part file left behind would be counted as room used and
          // never read, so a failed write cleans up after itself.
          part?.delete()
        }
      }
    }

    /**
     * Every stored map: its name, its size, and when it was last read.
     *
     * As JSON rather than as a list of objects, because the two builds
     * convert those differently and a string does not. The caller reads
     * it to decide what to drop when the room a person allowed runs out.
     */
    AsyncFunction("listMapCache") { promise: Promise ->
      files.execute {
        try {
          val listed = JSONArray()
          val found = maps().listFiles()
          if (found != null) {
            // A loop for its effect, over a directory listing that the
            // platform hands back as an array.
            for (file in found) {
              if (!file.isFile || file.name.endsWith(PART)) continue
              listed.put(
                JSONObject()
                  .put("name", file.name)
                  .put("bytes", file.length())
                  .put("at", file.lastModified()),
              )
            }
          }
          promise.resolve(listed.toString())
        } catch (e: Throwable) {
          promise.reject(EngineFailedException(e.message ?: e.toString()))
        }
      }
    }

    /** Drops stored maps by name, and answers with how many went. */
    AsyncFunction("removeMapCache") { names: List<String>, promise: Promise ->
      files.execute {
        try {
          var gone = 0
          for (name in names) {
            val file = mapFile(name) ?: continue
            if (file.delete()) gone += 1
          }
          promise.resolve(gone)
        } catch (e: Throwable) {
          promise.reject(EngineFailedException(e.message ?: e.toString()))
        }
      }
    }

    AsyncFunction("predict") { request: String, promise: Promise ->
      worker.execute {
        // Errors arrive as the engine's own JSON, so this catches only what
        // the boundary itself can fail at.
        val answer = try {
          predictNative(request)
        } catch (e: Throwable) {
          promise.reject(EngineFailedException(e.message ?: e.toString()))
          return@execute
        }
        if (answer == null) {
          promise.reject(EngineFailedException("no answer"))
        } else {
          promise.resolve(answer)
        }
      }
    }

    /**
     * Runs a batch of requests together, across several threads.
     *
     * The whole-world fine grid is 34,560 points. On one thread that is
     * seconds, and the engine has no way to use the other cores a phone has
     * been shipping for a decade. The caller cuts the grid into latitude
     * strips — which produce the same numbers as one run, point for point,
     * because a strip boundary is placed between cell centres — and hands
     * them over here.
     *
     * The batch still occupies the single worker, so the module keeps its
     * rule of one intention at a time: a fine grid and a point-to-point run
     * do not overlap, and a second batch waits for the first. The pool lives
     * inside one batch and is shut down with it, so an idle app holds no
     * threads it is not using.
     *
     * `threads` is the caller's, because the right number is a property of
     * the device rather than of this code, and it has to be measured on real
     * hardware — an emulator's ratios do not carry over.
     *
     * Answers come back in the order the requests were given, whatever order
     * they finished in. The caller joins them into one grid and depends on
     * that order.
     */
    AsyncFunction("predictMany") { requests: List<String>, threads: Int, promise: Promise ->
      worker.execute {
        if (requests.isEmpty()) {
          promise.resolve(emptyList<String>())
          return@execute
        }
        val width = threads.coerceIn(1, requests.size)
        val pool = Executors.newFixedThreadPool(width)
        val startedAt = System.nanoTime()
        // How many predictions were ever running at the same moment.
        //
        // The one number that separates "this phone is slow" from "these
        // strips are not running in parallel", and nothing else reports it: a
        // pool of eight that schedules one at a time looks exactly like a pool
        // of one in every total.
        val inFlight = AtomicInteger(0)
        val widest = AtomicInteger(0)
        var computeNs = 0L
        var cpuMs = 0L
        try {
          val running = requests.map { request ->
            pool.submit<String?> {
              val here = inFlight.incrementAndGet()
              widest.updateAndGet { most -> if (here > most) here else most }
              val began = System.nanoTime()
              // This thread's processor time, as opposed to the clock on the
              // wall. A thread stalled on memory is still on its core, so
              // stalls count here; a thread parked by the scheduler is not,
              // so parking does not. The difference between the two totals
              // is the difference between "the cores are busy and slow" and
              // "the threads are waiting for a core".
              val cpuBegan = android.os.SystemClock.currentThreadTimeMillis()
              try {
                predictNative(request)
              } finally {
                val cpuHere = android.os.SystemClock.currentThreadTimeMillis() - cpuBegan
                synchronized(this) {
                  computeNs += System.nanoTime() - began
                  cpuMs += cpuHere
                }
                inFlight.decrementAndGet()
              }
            }
          }
          // `get` in request order, so the results line up with what was
          // asked rather than with what finished first.
          val answers = running.map { it.get() }
          if (tracing) {
            val wallMs = (System.nanoTime() - startedAt) / 1_000_000
            val busyMs = computeNs / 1_000_000
            val characters = answers.sumOf { it?.length ?: 0 }
            // Two ratios, and they answer different questions.
            //
            // `engine / wall` counts tasks in flight. It says eight even
            // when all eight are only waiting, so on its own it cannot tell
            // a busy pool from a stalled one — a Pixel 8 reported 7.8 here
            // while each strip ran five times slower than it does alone.
            //
            // `cpu / wall` counts cores actually held. In flight high and
            // busy low means the threads are waiting for cores — the
            // scheduler, or thermal limits. Both high while each strip is
            // slow means the cores are held but starved, which is memory.
            val flight = if (wallMs > 0) busyMs.toDouble() / wallMs else 0.0
            val busy = if (wallMs > 0) cpuMs.toDouble() / wallMs else 0.0
            Log.i(
              "hfcast",
              "batch | ${requests.size} strips | $width threads asked | " +
                "${widest.get()} at once | wall $wallMs ms | " +
                "engine $busyMs ms | cpu $cpuMs ms | " +
                "${"%.1f".format(flight)} in flight | " +
                "${"%.1f".format(busy)} cores busy | " +
                "$characters chars back",
            )
          }
          val missing = answers.indexOfFirst { it == null }
          if (missing >= 0) {
            promise.reject(EngineFailedException("no answer for part $missing"))
          } else {
            promise.resolve(answers.map { it as String })
          }
        } catch (e: Throwable) {
          promise.reject(EngineFailedException(e.message ?: e.toString()))
        } finally {
          pool.shutdownNow()
        }
      }
    }

    OnDestroy {
      worker.shutdownNow()
      files.shutdownNow()
    }
  }

  private fun scratch(): File {
    val dir = File(appContext.cacheDirectory, "hfcast-engine")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  /**
   * Whether stored maps go on the memory card. Set by the app, which
   * holds the person's own choice; not remembered on this side.
   */
  @Volatile
  private var onCard = false

  /**
   * The app's own directory on a memory card, or null where there is
   * none to write to.
   *
   * `getExternalFilesDirs` answers with internal storage first, whatever
   * the name suggests, and a real removable card after it. This wants
   * the card, so the first entry is passed over. A directory the app
   * owns needs no permission and is emptied when the app is removed,
   * which is the right arrangement for something that can be computed
   * again.
   */
  /**
   * Hands one intent to the service, and says whether it was taken.
   *
   * `startForegroundService` from Android 8, which requires the service
   * to call `startForeground` within a few seconds — it does, first
   * thing. Failures are caught rather than thrown: a device that refuses
   * to start it is a device where maps compute only while the app is
   * open, which is what happened everywhere before this existed, and is
   * not a reason to fail the job.
   */
  private fun runService(
    action: String,
    title: String,
    text: String,
    done: Int,
    total: Int,
    stopLabel: String,
  ): Boolean {
    val context = appContext.reactContext ?: return false
    val intent = Intent(context, PrecomputeService::class.java)
      .setAction(action)
      .putExtra(PrecomputeService.EXTRA_TITLE, title)
      .putExtra(PrecomputeService.EXTRA_TEXT, text)
      .putExtra(PrecomputeService.EXTRA_DONE, done)
      .putExtra(PrecomputeService.EXTRA_TOTAL, total)
      .putExtra(PrecomputeService.EXTRA_STOP, stopLabel)
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      true
    } catch (e: Exception) {
      Log.w("hfcast", "could not start the background map service: ${e.message}")
      false
    }
  }

  private fun cardRoot(): File? {
    val context = appContext.reactContext ?: return null
    return context.getExternalFilesDirs(null)
      .drop(1)
      .firstOrNull { it != null && (it.exists() || it.mkdirs()) && it.canWrite() }
  }

  /**
   * Where stored maps live.
   *
   * The persistent directory and not the cache one, which is the whole
   * point of them. Android empties a cache directory whenever it wants
   * the room, and it wants the room on exactly the devices this app is
   * for. A person who spent an hour at home computing a year of maps for
   * a hike must not arrive on the hill and find the system threw them
   * away.
   *
   * A card that has been taken out since the choice was made falls back
   * to internal storage, so a missing card costs the maps that were on
   * it and nothing else.
   */
  private fun maps(): File {
    val root = (if (onCard) cardRoot() else null)
      ?: appContext.persistentFilesDirectory
    val dir = File(root, "hfcast-maps")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  /**
   * One stored map by name, or null where the name is not one.
   *
   * Flat names only. Nothing here needs a directory tree, and a name that
   * cannot contain a separator cannot climb out of the directory it is
   * meant to stay in.
   */
  private fun mapFile(name: String): File? {
    if (name.isEmpty() || name.contains("/") || name.contains("..")) return null
    if (name.endsWith(PART)) return null
    return File(maps(), name)
  }

  private external fun predictNative(request: String): String?

  /** Turns the Rust side's own timing lines on or off. */
  private external fun setTracingNative(on: Boolean)

  companion object {
    /**
     * What a map being written is called until it is written.
     *
     * A name nothing else can take, so a listing can tell an unfinished
     * write from a stored map and neither counts the other.
     */
    private const val PART = ".writing"

    init {
      // Named without the "lib" prefix and the extension, as the loader
      // expects. The four ABIs are in src/main/jniLibs; Android picks the one
      // matching the device.
      System.loadLibrary("hfcast_jni")
    }
  }
}
