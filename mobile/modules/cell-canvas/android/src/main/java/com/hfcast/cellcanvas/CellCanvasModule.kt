package com.hfcast.cellcanvas

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.views.ExpoView

/**
 * The cell field, drawn with the Skia the phone already has.
 *
 * Android's 2D drawing is Skia and always has been, so `Canvas` here is the
 * same engine `@shopify/react-native-skia` bundled a second private copy of.
 * That copy was 13.9 MB of the APK and 214 MB of prebuilt libraries F-Droid
 * will not accept, and it is gone: this draws the map instead.
 *
 * Nothing outside the Android platform is used, so this one source compiles
 * under Expo SDK 50 and SDK 57 alike, and there is no binary to ship.
 */

/** One filled path: the text, the colour, and how solid. */
class Layer : Record {
  @Field val d: String = ""
  @Field val color: String = "#000000"
  @Field val opacity: Double = 1.0
}

/** The whole earth, under everything else. */
class Disc : Record {
  @Field val cx: Double = 0.0
  @Field val cy: Double = 0.0
  @Field val radius: Double = 0.0
  @Field val color: String = "#000000"
}

/** The near-vertical stipple. Its radius is already divided by the scale. */
class Dot : Record {
  @Field val radius: Double = 1.0
  @Field val color: String = "#FFFFFF"
  @Field val opacity: Double = 1.0
}

/** Where the map is pointed. The only thing a pan changes. */
class Xform : Record {
  @Field val tx: Double = 0.0
  @Field val ty: Double = 0.0
  @Field val scale: Double = 1.0
}

/**
 * Reads the numbers of a path string without allocating.
 *
 * `pathOf` in src/data/projection.ts writes every string this reads, and it
 * writes only `M`, `L` and `Z` with absolute coordinates at two decimals. A
 * general SVG parser would be the wrong tool: the grammar is three letters and
 * one string can carry 34,560 closed rings.
 *
 * Scanned by index rather than split on spaces, and the numbers assembled from
 * digits rather than through `substring`. Either shortcut would allocate a few
 * hundred thousand short-lived objects before the first cell is drawn, which
 * is the cost this whole module is trying to avoid.
 */
private class Numbers(private val s: String) {
  var i = 0

  fun next(): Float {
    var negative = false
    if (i < s.length && s[i] == '-') {
      negative = true
      i++
    }
    var whole = 0L
    while (i < s.length && s[i] in '0'..'9') {
      whole = whole * 10 + (s[i] - '0')
      i++
    }
    var fraction = 0
    var scale = 1
    if (i < s.length && s[i] == '.') {
      i++
      while (i < s.length && s[i] in '0'..'9') {
        fraction = fraction * 10 + (s[i] - '0')
        scale *= 10
        i++
      }
    }
    val value = whole.toFloat() + fraction.toFloat() / scale
    return if (negative) -value else value
  }
}

internal fun pathFrom(d: String): Path {
  val path = Path()
  val read = Numbers(d)
  var pendingX = 0f
  var moving = false

  while (read.i < d.length) {
    when (d[read.i]) {
      ' ' -> read.i++
      'M', 'L' -> {
        moving = d[read.i] == 'M'
        read.i++
        pendingX = read.next()
      }
      'Z' -> {
        path.close()
        read.i++
      }
      else -> {
        val y = read.next()
        if (moving) path.moveTo(pendingX, y) else path.lineTo(pendingX, y)
      }
    }
  }
  return path
}

/**
 * A path and the paint it is filled with, built once when the data changes.
 *
 * Building is the whole cost of this renderer, so it must never happen in a
 * frame. Pan and zoom move the canvas, which leaves these untouched.
 */

/**
 * A colour, or magenta if it is not one this understands.
 *
 * `Color.parseColor` throws on anything that is not a hex string or a name,
 * and a throw inside a prop setter loses the whole view: the map would go
 * blank with nothing said about why. The theme is hex today, and magenta is
 * chosen so that if that ever stops being true it is obvious on the screen
 * rather than silent.
 */
internal fun colorOf(text: String): Int =
  try {
    Color.parseColor(text)
  } catch (_: IllegalArgumentException) {
    Color.MAGENTA
  }

private class Filled(val path: Path, val paint: Paint)

@SuppressLint("ViewConstructor")
class CellCanvasView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {

  private var filled: List<Filled> = emptyList()
  private var dots: FloatArray = FloatArray(0)
  private var dotPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private var discPaint = Paint(Paint.ANTI_ALIAS_FLAG)

  private var discCx = 0f
  private var discCy = 0f
  private var discR = 0f
  private var dotRadius = 1f

  private var tx = 0f
  private var ty = 0f
  private var scale = 1f

  init {
    // `ExpoView` is a `LinearLayout`, and a ViewGroup draws its children and
    // nothing of its own: `onDraw` is never called unless the view says it
    // has something to paint. Without this the view is created, sized and
    // laid out correctly, and stays empty.
    setWillNotDraw(false)
  }

  fun setLayers(layers: List<Layer>) {
    filled = layers.map { layer ->
      val paint = Paint(Paint.ANTI_ALIAS_FLAG)
      paint.style = Paint.Style.FILL
      paint.color = colorOf(layer.color)
      paint.alpha = (layer.opacity.coerceIn(0.0, 1.0) * 255).toInt()
      Filled(pathFrom(layer.d), paint)
    }
    invalidate()
  }

  fun setDots(points: FloatArray) {
    dots = points
    invalidate()
  }

  fun setDisc(cx: Float, cy: Float, r: Float, color: String) {
    discCx = cx
    discCy = cy
    discR = r
    discPaint.color = colorOf(color)
    discPaint.style = Paint.Style.FILL
    invalidate()
  }

  fun setDot(radius: Float, color: String, opacity: Double) {
    dotRadius = radius
    dotPaint.color = colorOf(color)
    dotPaint.alpha = (opacity.coerceIn(0.0, 1.0) * 255).toInt()
    dotPaint.style = Paint.Style.FILL
    invalidate()
  }

  fun setTransform(x: Float, y: Float, s: Float) {
    tx = x
    ty = y
    scale = s
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {

    // Translate then scale, so a point is scaled first and then moved: the
    // order the SVG viewBox above this uses, which is what keeps the two
    // layers registered.
    val saved = canvas.save()
    // The projection works in React Native's layout units; a Canvas works in
    // physical pixels. Skia's own view and react-native-svg both convert, and
    // a plain view has to do it itself. Without this the whole map is drawn
    // at a fraction of its size in the top left corner, which reads as the
    // cells sitting over the wrong part of the world rather than as a
    // scaling mistake.
    //
    // Read per frame rather than held: density changes with the display the
    // window is on, and this costs a field read.
    val density = resources.displayMetrics.density
    canvas.scale(density, density)

    canvas.translate(tx, ty)
    canvas.scale(scale, scale)

    canvas.drawCircle(discCx, discCy, discR, discPaint)

    // Indexed rather than for-each: this runs every frame of a pan, and an
    // iterator per layer per frame is garbage the collector has to answer for.
    for (index in filled.indices) {
      val one = filled[index]
      canvas.drawPath(one.path, one.paint)
    }

    var at = 0
    while (at + 1 < dots.size) {
      canvas.drawCircle(dots[at], dots[at + 1], dotRadius, dotPaint)
      at += 2
    }

    canvas.restoreToCount(saved)

  }
}

class CellCanvasModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CellCanvas")

    View(CellCanvasView::class) {
      // The four layers in draw order: the coarse cells, the patch backing,
      // the patch. The caller flattens them, so nothing here knows what a
      // quality is or which layer it is looking at.
      Prop("layers") { view: CellCanvasView, layers: List<Layer> ->
        view.setLayers(layers)
      }

      // The stipple, as a flat x,y,x,y array. A list of pairs would cross the
      // bridge as one object per dot.
      Prop("dots") { view: CellCanvasView, dots: FloatArray ->
        view.setDots(dots)
      }

      Prop("disc") { view: CellCanvasView, disc: Disc ->
        view.setDisc(
          disc.cx.toFloat(),
          disc.cy.toFloat(),
          disc.radius.toFloat(),
          disc.color,
        )
      }

      Prop("dot") { view: CellCanvasView, dot: Dot ->
        view.setDot(dot.radius.toFloat(), dot.color, dot.opacity)
      }

      // Set on every frame of a pan. It moves the canvas and rebuilds nothing.
      Prop("transform") { view: CellCanvasView, xform: Xform ->
        view.setTransform(xform.tx.toFloat(), xform.ty.toFloat(), xform.scale.toFloat())
      }
    }
  }
}
