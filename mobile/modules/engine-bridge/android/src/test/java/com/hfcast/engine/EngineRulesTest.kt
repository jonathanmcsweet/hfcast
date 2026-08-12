package com.hfcast.engine

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The module's rules, on a plain JVM.
 *
 * These run in seconds and need no telephone, which is the whole reason
 * the rules were taken out of the class. Everything left in
 * `HfcastEngineModule.kt` touches a device and can only be checked by
 * somebody holding one.
 */
class EngineRulesTest {
  @Test
  fun `a plain name is a map name`() {
    assertTrue(isMapName("IO91-abc123-20m-2026-08-14.hfg"))
  }

  @Test
  fun `a name cannot climb out of the directory`() {
    // The whole point of the rule. A name that reaches a parent or names
    // a path would let a caller read or delete a file elsewhere.
    assertFalse(isMapName("../secrets"))
    assertFalse(isMapName("maps/one.hfg"))
    assertFalse(isMapName("/etc/passwd"))
    assertFalse(isMapName(""))
  }

  @Test
  fun `a half-written file is not a map`() {
    // A listing that counted these would charge somebody for room that
    // holds nothing readable, and a read would return half a map.
    assertFalse(isMapName("one.hfg$PART"))
    assertTrue(isMapName("one.hfg"))
  }

  @Test
  fun `an engine input name may not climb out either`() {
    assertTrue(isEngineInputName("antenna.ant"))
    assertFalse(isEngineInputName("../antenna.ant"))
    assertFalse(isEngineInputName("/antenna.ant"))
    assertFalse(isEngineInputName(""))
  }

  @Test
  fun `the listing carries the three names the app reads`() {
    // These key names are the contract with `listMapCache` in index.ts.
    // Nothing but this test holds the two sides together: renaming one
    // here is not a compile error there, it is an empty listing.
    val json = JSONArray(listingJson(listOf(StoredMap("one.hfg", 42L, 1234L))))
    assertEquals(1, json.length())
    val first = json.getJSONObject(0)
    assertEquals("one.hfg", first.getString("name"))
    assertEquals(42L, first.getLong("bytes"))
    assertEquals(1234L, first.getLong("at"))
  }

  @Test
  fun `an empty listing is an empty list, not nothing`() {
    // The app parses this. "[]" is a listing of no maps; an empty string
    // would be a parse failure, which is a different thing entirely.
    assertEquals("[]", listingJson(emptyList()))
  }

  @Test
  fun `full counts as on power`() {
    // A device left on a charger overnight reports full rather than
    // charging. Reading that as "not on power" would stop a job at
    // exactly the moment it was safest to run.
    assertTrue(onPower(BATTERY_STATUS_CHARGING))
    assertTrue(onPower(BATTERY_STATUS_FULL))
    assertFalse(onPower(BATTERY_STATUS_DISCHARGING))
    assertFalse(onPower(-1))
  }

  @Test
  fun `a batch that took no measurable time does not divide by it`() {
    val (inFlight, coresBusy) = ratios(timing(wallMs = 0L))
    assertEquals(0.0, inFlight, 0.0)
    assertEquals(0.0, coresBusy, 0.0)
  }

  @Test
  fun `the two ratios count different things`() {
    // Eight strips in flight while only four cores were held. This is the
    // reading that separates "the telephone is slow" from "the threads
    // are waiting for a core", so the two must not collapse into one.
    val (inFlight, coresBusy) = ratios(
      timing(wallMs = 100L, engineMs = 800L, cpuMs = 400L),
    )
    assertEquals(8.0, inFlight, 0.001)
    assertEquals(4.0, coresBusy, 0.001)
  }

  @Test
  fun `the log line writes its numbers the same way everywhere`() {
    // Formatted in the device's own locale, "8.0" would be written "8,0"
    // in much of the world. The person reading this line is whoever holds
    // the telephone, not whoever it was set up for.
    val line = batchLine(timing(wallMs = 100L, engineMs = 800L, cpuMs = 400L))
    assertTrue(line, line.contains("8.0 in flight"))
    assertTrue(line, line.contains("4.0 cores busy"))
    assertTrue(line, line.startsWith("batch | 16 strips | 8 threads asked"))
  }

  /** A batch, with only the numbers a test cares about spelled out. */
  private fun timing(
    wallMs: Long,
    engineMs: Long = 0L,
    cpuMs: Long = 0L,
  ) = BatchTiming(
    strips = 16,
    threadsAsked = 8,
    widest = 8,
    wallMs = wallMs,
    engineMs = engineMs,
    cpuMs = cpuMs,
    characters = 2380114,
  )

  private companion object {
    // Written out rather than read from BatteryManager. android.jar here
    // is a stub, and these are the values it defines.
    const val BATTERY_STATUS_CHARGING = 2
    const val BATTERY_STATUS_DISCHARGING = 3
    const val BATTERY_STATUS_FULL = 5
  }
}
