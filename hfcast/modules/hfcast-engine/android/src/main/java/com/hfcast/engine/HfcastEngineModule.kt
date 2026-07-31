package com.hfcast.engine

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.Executors

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

  override fun definition() = ModuleDefinition {
    Name("HfcastEngine")

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
        try {
          val running = requests.map { request ->
            pool.submit<String?> { predictNative(request) }
          }
          // `get` in request order, so the results line up with what was
          // asked rather than with what finished first.
          val answers = running.map { it.get() }
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
    }
  }

  private fun scratch(): File {
    val dir = File(appContext.cacheDirectory, "hfcast-engine")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private external fun predictNative(request: String): String?

  companion object {
    init {
      // Named without the "lib" prefix and the extension, as the loader
      // expects. The four ABIs are in src/main/jniLibs; Android picks the one
      // matching the device.
      System.loadLibrary("hfcast_jni")
    }
  }
}
