package com.hfcast.apprestart

import android.content.Intent
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Restarts the app, for the one setting Android reads only at startup.
 *
 * React Native decides layout direction natively and reads the flag
 * `I18nManager` stored when the process starts, so switching to or from
 * Arabic needs the app to come up again before the layout flips.
 *
 * `expo-updates` offers a reload for this and used to be what did it here.
 * It brought androidx.room and Bouncy Castle with it: about 6,000 classes
 * and 1.3 MB of asset tables, for a feature the manifest switches off.
 *
 * The launch intent and a process exit do the same job. Both predate the
 * app's minimum Android version, and neither is a React Native internal,
 * so this one source compiles under Expo SDK 50 and SDK 57 alike.
 */

internal class NoContextException :
  CodedException("The Android context is unavailable")

internal class NoLaunchIntentException :
  CodedException("This package has no launch intent")

class AppRestartModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppRestart")

    Function("restart") {
      val context = appContext.reactContext ?: throw NoContextException()
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: throw NoLaunchIntentException()

      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      context.startActivity(intent)

      // The old process has to go for the new task to come up clean. The
      // language write that leads here is awaited before the call, so
      // there is nothing left unsaved.
      Runtime.getRuntime().exit(0)
    }
  }
}
