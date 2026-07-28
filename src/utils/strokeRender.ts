/**
 * Turning raw pointer samples into a stroke that looks handwritten.
 *
 * Two problems with drawing the samples directly, which is what this replaces:
 *
 *   1. A polyline through raw points is visibly faceted — every sample is a
 *      corner. At handwriting scale that reads as "rough" no matter how fine
 *      the sampling.
 *   2. A constant line width reads as a marker, not a pen. Real ink thins when
 *      the nib moves fast and pools when it slows or changes direction.
 *
 * The fix for (1) is a quadratic Bézier through the midpoints: each sample
 * becomes a control point rather than a vertex, so the curve passes smoothly
 * *near* the samples instead of kinking *at* them. A light moving average on
 * the interior points removes finger jitter first.
 *
 * The fix for (2) is to derive speed from the geometry that is already stored.
 * Samples are captured at a roughly constant rate and decimated to a fixed
 * minimum gap, so the DISTANCE between consecutive points is a good proxy for
 * how fast the hand was moving — no extra data, no schema change, and both
 * devices compute the identical result from the identical points. That last
 * part is the reason this lives in one shared module: the drawer renders to a
 * canvas and the recipient renders to SVG, and they must agree exactly.
 *
 * Output is a list of SVG path strings with a width each. Canvas consumes them
 * through Path2D, so the two renderers are drawing literally the same geometry.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface StrokeSegment {
  /** SVG path data. Usable directly in <path d> or `new Path2D(d)`. */
  readonly d: string;
  readonly width: number;
}

/** Fast strokes thin to this fraction of the nominal width. */
const MIN_WIDTH_FACTOR = 0.62;
/** Slow strokes thicken to this fraction — ink pooling. */
const MAX_WIDTH_FACTOR = 1.18;

/** Sample gaps below this count as "slow", above MAX as "fast". */
const SLOW_GAP_PX = 2.5;
const FAST_GAP_PX = 22;

/**
 * Width is quantised before segments are emitted. Without this, every segment
 * would differ by a hair and the SVG would need one <path> per sample; six
 * buckets keep the taper visible while merging long runs into single paths.
 */
const WIDTH_BUCKETS = 6;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Light 3-point average over interior samples.
 *
 * Endpoints are left untouched so a stroke still starts and ends exactly where
 * the finger did — smoothing those visibly retracts the ends.
 */
function denoise(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [points[0] as Point];
  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = points[i - 1] as Point;
    const current = points[i] as Point;
    const next = points[i + 1] as Point;
    out.push({
      x: (previous.x + current.x * 2 + next.x) / 4,
      y: (previous.y + current.y * 2 + next.y) / 4,
    });
  }
  out.push(points[points.length - 1] as Point);
  return out;
}

/** Per-sample width, from the gap to the previous sample, then smoothed. */
function widthProfile(points: Point[], baseWidth: number): number[] {
  const raw: number[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i] as Point;
    const previous = points[i > 0 ? i - 1 : 0] as Point;
    const gap = Math.hypot(current.x - previous.x, current.y - previous.y);
    // 0 = slow, 1 = fast.
    const t = clamp((gap - SLOW_GAP_PX) / (FAST_GAP_PX - SLOW_GAP_PX), 0, 1);
    raw.push(MAX_WIDTH_FACTOR + (MIN_WIDTH_FACTOR - MAX_WIDTH_FACTOR) * t);
  }

  // Average over a ±2 window: speed measured per sample is noisy, and abrupt
  // width steps look like glitches rather than pen pressure.
  const smoothed: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k += 1) {
      sum += raw[k] as number;
      n += 1;
    }
    smoothed.push((sum / n) * baseWidth);
  }

  // A stroke tapers in and out, like a nib landing and lifting.
  if (smoothed.length > 2) {
    smoothed[0] = (smoothed[0] as number) * 0.75;
    smoothed[smoothed.length - 1] = (smoothed[smoothed.length - 1] as number) * 0.75;
  }

  return smoothed;
}

function quantise(width: number, baseWidth: number): number {
  const min = baseWidth * MIN_WIDTH_FACTOR * 0.75;
  const max = baseWidth * MAX_WIDTH_FACTOR;
  const step = (max - min) / WIDTH_BUCKETS;
  if (step <= 0) return width;
  return Math.round((clamp(width, min, max) - min) / step) * step + min;
}

const round = (value: number): string => (Math.round(value * 10) / 10).toString();

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Builds the renderable segments for one stroke.
 *
 * `points` must already be in the target coordinate space (the SVG renderer
 * scales its stored x-fractions up before calling this).
 */
export function buildStrokeSegments(points: Point[], baseWidth: number): StrokeSegment[] {
  if (points.length < 2) return [];

  const smoothed = denoise(points);
  const widths = widthProfile(smoothed, baseWidth);

  const segments: StrokeSegment[] = [];
  let d = `M${round((smoothed[0] as Point).x)} ${round((smoothed[0] as Point).y)}`;
  let currentWidth = quantise(widths[0] as number, baseWidth);

  for (let i = 1; i < smoothed.length - 1; i += 1) {
    const control = smoothed[i] as Point;
    const end = mid(control, smoothed[i + 1] as Point);
    const nextWidth = quantise(widths[i] as number, baseWidth);

    // Quadratic through the midpoint: the sample is the control point, so the
    // curve bends around it rather than turning a corner on it.
    d += `Q${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`;

    if (nextWidth !== currentWidth) {
      // Close this run and start the next one exactly where it ended, so the
      // width change is a join rather than a gap.
      segments.push({ d, width: currentWidth });
      d = `M${round(end.x)} ${round(end.y)}`;
      currentWidth = nextWidth;
    }
  }

  const last = smoothed[smoothed.length - 1] as Point;
  d += `L${round(last.x)} ${round(last.y)}`;
  segments.push({ d, width: currentWidth });

  return segments;
}
