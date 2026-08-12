package com.hfcast.engine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * What keeps a long map job running while the screen is off.
 *
 * Computing maps ahead used to stop the moment the app left the screen
 * (user, 2026-08-11). That is not throttling and not a bug in the queue:
 * since Android 8 a backgrounded app becomes a cached process, and from
 * Android 12 it is frozen outright, so the JavaScript driving the job
 * simply stops running. Nothing was lost — every finished map reaches
 * disk before the next one starts — but the job needed the app kept open.
 *
 * A foreground service is the only mechanism Android offers for work the
 * user asked for that has to continue with the screen locked. It buys
 * two things: the process stays at foreground importance, so it is
 * neither frozen nor an early candidate to be killed, and a partial wake
 * lock keeps the processor running once the screen goes off. The wake
 * lock alone would not be enough — it stops the device sleeping, not the
 * process being frozen.
 *
 * The price is a notification that cannot be dismissed while the job
 * runs. That is not a design choice; Android requires it. So it is made
 * to earn its place: it says how far along the job is and carries a Stop
 * button, which is the control somebody reaching for the notification
 * actually wants.
 *
 * It keeps going when the app is swiped out of the recent apps list
 * (user, 2026-08-11), which is why `onTaskRemoved` does nothing. The
 * process outlives the activity because this service holds it up, and
 * the React context lives on the application rather than the activity.
 */
class PrecomputeService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  companion object {
    /**
     * What the module hangs on the Stop button.
     *
     * A companion field rather than a binder: there is one service and
     * one module in one process, the call is a single "the person
     * pressed Stop", and a bound connection would add a lifecycle to
     * get wrong for no more than that.
     */
    @Volatile
    var onStopRequested: (() -> Unit)? = null

    const val ACTION_START = "com.hfcast.engine.START"
    const val ACTION_UPDATE = "com.hfcast.engine.UPDATE"
    const val ACTION_STOP = "com.hfcast.engine.STOP"

    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_DONE = "done"
    const val EXTRA_TOTAL = "total"
    /** What the Stop button says, translated by the app that sends it. */
    const val EXTRA_STOP = "stop"

    private const val CHANNEL = "hfcast.maps"
    private const val NOTIFICATION = 4711
    private const val WAKE_TAG = "hfcast:precompute"

    /**
     * How long the wake lock may be held before Android takes it back.
     *
     * A safety line, not a schedule. A wake lock leaked by a process
     * that died badly would hold the processor awake until the device
     * was restarted, which on a field radio is a flat battery. Every
     * job this drives is minutes rather than hours — a year of nine
     * bands measured about 75 minutes — so three hours ends a leak
     * without ever ending a job.
     */
    private const val WAKE_LIMIT_MS = 3L * 60L * 60L * 1000L
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        // The person pressed Stop on the notification. The job is told,
        // and stops itself the same way the button in the app does, so
        // there is one path that ends a job rather than two.
        onStopRequested?.invoke()
        stop()
      }
      else -> {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: ""
        val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
        val done = intent?.getIntExtra(EXTRA_DONE, 0) ?: 0
        val total = intent?.getIntExtra(EXTRA_TOTAL, 0) ?: 0
        val stopLabel = intent?.getStringExtra(EXTRA_STOP) ?: "Stop"
        show(title, text, done, total, stopLabel)
        hold()
      }
    }
    // Deliberately not sticky. A process killed under memory pressure
    // takes the job's state with it, so Android restarting this service
    // with a null intent would put a notification on screen for a job
    // that no longer exists.
    return START_NOT_STICKY
  }

  /**
   * Swiping the app out of recents does not end the job.
   *
   * Overridden to say so. The default for a started service is already
   * to continue, but this is the exact behaviour that was asked for, and
   * a reader looking for it should find it stated rather than absent.
   */
  override fun onTaskRemoved(rootIntent: Intent?) {}

  override fun onDestroy() {
    release()
    super.onDestroy()
  }

  private fun stop() {
    release()
    // `stopForeground` takes a flag from Android 7 and a boolean before
    // it. The boolean overload still works, and is the one both builds
    // can call — the older of the two targets Android 5.
    @Suppress("DEPRECATION")
    stopForeground(true)
    stopSelf()
  }

  private fun hold() {
    if (wakeLock?.isHeld == true) return
    val power = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_TAG).apply {
      setReferenceCounted(false)
      acquire(WAKE_LIMIT_MS)
    }
  }

  private fun release() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  private fun show(
    title: String,
    text: String,
    done: Int,
    total: Int,
    stopLabel: String,
  ) {
    val manager =
      getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
      // Low importance: this is a progress report, not news. It stays in
      // the shade without a sound or a heads-up card every time the
      // count moves.
      val channel = NotificationChannel(
        CHANNEL,
        title.ifEmpty { "Maps" },
        NotificationManager.IMPORTANCE_LOW,
      )
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }

    val notification = build(title, text, done, total, stopLabel)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // From Android 14 a foreground service has to declare what it is
      // for at the moment it starts. `dataSync` is the type for work the
      // user asked for that has to run to completion.
      startForeground(
        NOTIFICATION,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION, notification)
    }
  }

  /**
   * `addAction` with an icon resource is deprecated in favour of one
   * taking an `Icon`, which arrived in Android 6. The older of the two
   * builds targets Android 5, so the replacement cannot be called
   * unconditionally and branching on the version to remove a warning
   * would add a second path to test on devices nobody here has.
   */
  @Suppress("DEPRECATION")
  private fun build(
    title: String,
    text: String,
    done: Int,
    total: Int,
    stopLabel: String,
  ): Notification {
    val stopIntent = Intent(this, PrecomputeService::class.java)
      .setAction(ACTION_STOP)
    // `FLAG_IMMUTABLE` is required from Android 12 and has been available
    // since Android 6. Below that the flag does not exist and is not
    // needed, so the older builds get none.
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    val stop = PendingIntent.getService(this, 1, stopIntent, flags)

    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 2, it, flags)
    }

    @Suppress("DEPRECATION")
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL)
    } else {
      Notification.Builder(this)
    }

    builder
      .setContentTitle(title)
      .setContentText(text)
      // A system icon rather than one of the app's. A small icon has to
      // be a white silhouette on transparency, and this module ships no
      // drawables of its own — adding an asset pipeline to a native
      // module to draw a shape Android already has would be a poor
      // trade.
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, stopLabel, stop)
    if (open != null) builder.setContentIntent(open)
    if (total > 0) builder.setProgress(total, done, false)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      // Shown on the lock screen. The whole point of this service is a
      // job that runs while the device is locked, so the progress has to
      // be readable there. It carries no personal information.
      builder.setVisibility(Notification.VISIBILITY_PUBLIC)
    }

    @Suppress("DEPRECATION")
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
      builder.build()
    } else {
      builder.notification
    }
  }
}
