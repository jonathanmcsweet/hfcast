package com.hfcast.aosplocation

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.os.bundleOf
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One position fix, from the Android platform and nothing else.
 *
 * `expo-location` reaches location through Google's fused provider, which
 * means the app links `com.google.android.gms:play-services-location`. That
 * artifact is proprietary: it keeps the build out of F-Droid, and on a phone
 * without Google services — GrapheneOS without sandboxed Play, or a Fire
 * tablet — the fused client is simply not there.
 *
 * `android.location.LocationManager` has been in the platform since Android 1
 * and is part of AOSP. It is what Organic Maps and OsmAnd use. What the fused
 * provider adds over it is battery-efficient continuous tracking, geofencing,
 * and network location backed by Google's database of wireless networks. This
 * app needs none of that: it asks once, to fill in a Maidenhead grid square,
 * and then the answer stops changing.
 *
 * Two consequences worth knowing. On a phone with no Google services there is
 * usually no network provider at all, so this is satellites only, which needs
 * a view of the sky and can take a minute from cold. And a recent cached fix
 * is preferred over a new one, because a station's own position is not a
 * moving quantity.
 */

internal class NoPermissionsModuleException :
  CodedException("The permissions module is unavailable")

internal class NoContextException :
  CodedException("The Android context is unavailable")

internal class PermissionDeniedException :
  CodedException("Permission to read the device location was not granted")

internal class NoProviderException :
  CodedException("No location provider is switched on")

internal class AlreadyLocatingException :
  CodedException("A position request is already in progress")

internal class TimedOutException :
  CodedException("No fix arrived before the time limit")

class AospLocationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw NoContextException()

  /**
   * The request in flight, if any, and the timer that gives up on it.
   *
   * Held as fields because a location request is a subscription that has to be
   * cancelled by the same object that started it — there is no value to build
   * here, only a listener to remove. A second request is refused rather than
   * replacing this one, which would leave the first promise unresolved.
   */
  private var listening: LocationListener? = null
  private var givingUp: Runnable? = null
  private val handler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("AospLocation")

    AsyncFunction("requestPermissions") { promise: Promise ->
      val permissions = appContext.permissions ?: throw NoPermissionsModuleException()
      Permissions.askForPermissionsWithPermissionsManager(
        permissions,
        promise,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
      )
    }

    AsyncFunction("getPermissions") { promise: Promise ->
      val permissions = appContext.permissions ?: throw NoPermissionsModuleException()
      Permissions.getPermissionsWithPermissionsManager(
        permissions,
        promise,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
      )
    }

    /** Whether any provider is switched on, so the button can say why not. */
    AsyncFunction<Boolean>("hasProvider") {
      return@AsyncFunction usableProviders().isNotEmpty()
    }

    AsyncFunction("getCurrentPosition") { maxAgeMs: Long, timeoutMs: Long, promise: Promise ->
      if (!granted()) throw PermissionDeniedException()
      val providers = usableProviders()
      if (providers.isEmpty()) throw NoProviderException()

      val cached = freshestFix(providers, maxAgeMs)
      if (cached != null) {
        promise.resolve(cached)
        return@AsyncFunction
      }

      if (listening != null) throw AlreadyLocatingException()
      // requestLocationUpdates has to be called from a thread with a Looper,
      // and an AsyncFunction body does not run on one.
      handler.post { listen(providers, timeoutMs, promise) }
    }

    OnDestroy {
      stop()
    }
  }

  private fun manager(): LocationManager =
    context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
      ?: throw NoProviderException()

  private fun granted(): Boolean = listOf(
    Manifest.permission.ACCESS_FINE_LOCATION,
    Manifest.permission.ACCESS_COARSE_LOCATION
  ).any {
    ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
  }

  /**
   * Providers that exist on this device and are switched on, best first.
   *
   * `isProviderEnabled` throws for a provider the device does not have, so
   * membership is checked before it is asked. On a phone without Google
   * services, `network` is usually one of those.
   */
  private fun usableProviders(): List<String> {
    val manager = manager()
    val present = manager.allProviders
    return listOf(
      LocationManager.GPS_PROVIDER,
      LocationManager.NETWORK_PROVIDER,
      LocationManager.PASSIVE_PROVIDER
    ).filter { present.contains(it) && manager.isProviderEnabled(it) }
  }

  /** The most recent cached fix that is still young enough to use. */
  @SuppressLint("MissingPermission")
  private fun freshestFix(providers: List<String>, maxAgeMs: Long): Bundle? {
    val manager = manager()
    val now = System.currentTimeMillis()
    return providers
      .mapNotNull { provider ->
        // A provider can refuse even with permission held, so each is asked
        // separately rather than letting one failure lose the others.
        runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
      }
      .filter { now - it.time <= maxAgeMs }
      .maxByOrNull { it.time }
      ?.let { asBundle(it) }
  }

  @SuppressLint("MissingPermission")
  private fun listen(providers: List<String>, timeoutMs: Long, promise: Promise) {
    val settled = AtomicBoolean(false)

    // Written out rather than given as a lambda. The three callbacks below
    // gained default implementations in the API 30 stubs, so a lambda compiles
    // — but on an Android 6 to 10 runtime they are still abstract there, and a
    // lambda would implement only the first, giving AbstractMethodError the
    // moment the framework reports a status change. Fire OS 6 and 7 are in
    // that range.
    val listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        if (settled.compareAndSet(false, true)) {
          stop()
          promise.resolve(asBundle(location))
        }
      }

      @Deprecated("Required by the interface on older runtimes.")
      override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

      override fun onProviderEnabled(provider: String) = Unit

      override fun onProviderDisabled(provider: String) = Unit
    }
    listening = listener

    val expire = Runnable {
      if (settled.compareAndSet(false, true)) {
        stop()
        promise.reject(TimedOutException())
      }
    }
    givingUp = expire
    handler.postDelayed(expire, timeoutMs)

    // Every switched-on provider is asked, and the first fix to arrive wins.
    // Satellites are the accurate answer and the slow one, so a network fix
    // arriving first is the better outcome rather than a compromise.
    for (provider in providers) {
      runCatching {
        manager().requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
      }
    }
  }

  private fun stop() {
    listening?.let { listener ->
      runCatching { manager().removeUpdates(listener) }
    }
    listening = null
    givingUp?.let { handler.removeCallbacks(it) }
    givingUp = null
  }

  private fun asBundle(location: Location): Bundle = bundleOf(
    "latitude" to location.latitude,
    "longitude" to location.longitude,
    "accuracy" to if (location.hasAccuracy()) location.accuracy.toDouble() else null,
    "provider" to (location.provider ?: LocationManager.PASSIVE_PROVIDER),
    "timestamp" to location.time.toDouble()
  )
}
