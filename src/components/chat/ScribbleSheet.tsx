import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Undo2, Redo2, Trash2, Check, Pen, Brush } from 'lucide-react';
import { DOODLE } from '@/config';
import { buildStrokeSegments } from '@/utils/strokeRender';
import { cn } from '@/utils/cn';

/** A finished stroke in viewport (client) coordinates. */
export interface ScribbleStroke {
  tool: 'pen' | 'brush';
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

interface ScribbleSheetProps {
  onDone: (strokes: ScribbleStroke[]) => void;
  onClose: () => void;
}

/**
 * A drawing surface laid over the conversation.
 *
 * The backdrop is translucent, so the chat shows through — you scribble on top
 * of the messages. Strokes are kept as vectors (exact undo, crisp redraw) and,
 * on Done, handed back in viewport coordinates; the caller anchors them to a
 * message and stores them as a shared doodle. Nothing is exported as an image.
 */
export function ScribbleSheet({ onDone, onClose }: ScribbleSheetProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const strokes = useRef<ScribbleStroke[]>([]);
  const current = useRef<ScribbleStroke | null>(null);
  const [count, setCount] = useState(0);

  /**
   * Undone strokes, newest last. Drawing anything new discards them — the
   * standard behaviour everywhere: once you branch off, the old redo path is
   * gone. `redoCount` mirrors the length purely so the button can disable
   * itself, since a ref does not trigger a render.
   */
  const redoStack = useRef<ScribbleStroke[]>([]);
  const [redoCount, setRedoCount] = useState(0);

  const [tool, setTool] = useState<'pen' | 'brush'>('pen');
  const [width, setWidth] = useState(6);
  const [color, setColor] = useState('#ffffff');
  const [pickerOpen, setPickerOpen] = useState(false);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const widthRef = useRef(width);
  widthRef.current = width;
  const colorRef = useRef(color);
  colorRef.current = color;

  // Strokes are stored in viewport coordinates; drawing needs canvas-local, so
  // the canvas offset is subtracted at paint time.
  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: ScribbleStroke, ox: number, oy: number) => {
    ctx.globalAlpha = stroke.tool === 'brush' ? 0.55 : 1;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      if (p) {
        ctx.beginPath();
        ctx.arc(p.x - ox, p.y - oy, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      /**
       * Rendered through the shared builder — smoothed curves and speed-varying
       * width — and via Path2D on the SAME path strings the recipient's SVG
       * uses, so what you draw is exactly what they see.
       */
      const local = stroke.points.map((p) => ({ x: p.x - ox, y: p.y - oy }));
      for (const segment of buildStrokeSegments(local, stroke.width)) {
        ctx.lineWidth = segment.width;
        ctx.stroke(new Path2D(segment.d));
      }
    }
    ctx.globalAlpha = 1;
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    for (const stroke of strokes.current) drawStroke(ctx, stroke, rect.left, rect.top);
    if (current.current) drawStroke(ctx, current.current, rect.left, rect.top);
  };

  useLayoutEffect(() => {
    const setup = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(wrap.clientWidth * dpr);
      canvas.height = Math.round(wrap.clientHeight * dpr);
      canvas.style.width = `${String(wrap.clientWidth)}px`;
      canvas.style.height = `${String(wrap.clientHeight)}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        redraw();
      }
    };
    setup();
    window.addEventListener('resize', setup);
    return () => {
      window.removeEventListener('resize', setup);
    };
    // Runs once to size the canvas; redraw is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Latest undo/redo, held in a ref so the key listener below can call them
   * without re-subscribing on every render (they are new closures each time).
   */
  const actionsRef = useRef<{ undo: () => void; redo: () => void }>({
    undo: () => undefined,
    redo: () => undefined,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      // Cmd on macOS, Ctrl on Windows/Linux. Accepting either everywhere costs
      // nothing and means an external keyboard on the "wrong" OS still works.
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      const key = event.key.toLowerCase();
      if (key === 'z') {
        // Cmd/Ctrl+Shift+Z is redo on both platforms; plain is undo.
        event.preventDefault();
        if (event.shiftKey) actionsRef.current.redo();
        else actionsRef.current.undo();
      } else if (key === 'y') {
        // Ctrl+Y — the other Windows redo.
        event.preventDefault();
        actionsRef.current.redo();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (pickerOpen) return;
    canvasRef.current?.setPointerCapture(event.pointerId);
    current.current = {
      tool: toolRef.current,
      color: colorRef.current,
      width: widthRef.current,
      points: [{ x: event.clientX, y: event.clientY }],
    };
    redraw();
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const stroke = current.current;
    if (!stroke) return;
    const last = stroke.points[stroke.points.length - 1];
    // Decimate: skip points too close to the last, which are just noise.
    if (last && Math.hypot(event.clientX - last.x, event.clientY - last.y) < DOODLE.MIN_POINT_GAP) {
      return;
    }
    stroke.points.push({ x: event.clientX, y: event.clientY });
    redraw();
  };

  const onPointerUp = () => {
    if (!current.current) return;
    strokes.current.push(current.current);
    current.current = null;
    setCount((c) => c + 1);
    // A new stroke ends the redo branch.
    redoStack.current = [];
    setRedoCount(0);
  };

  const undo = () => {
    const popped = strokes.current.pop();
    if (!popped) return;
    redoStack.current.push(popped);
    setRedoCount(redoStack.current.length);
    setCount((c) => Math.max(0, c - 1));
    redraw();
  };

  const redo = () => {
    const restored = redoStack.current.pop();
    if (!restored) return;
    strokes.current.push(restored);
    setRedoCount(redoStack.current.length);
    setCount((c) => c + 1);
    redraw();
  };

  const clear = () => {
    // Clearing is undoable in the sense that everything goes to the redo stack
    // in order, so Ctrl+Z after a mis-click brings the drawing back.
    redoStack.current = [...redoStack.current, ...strokes.current];
    setRedoCount(redoStack.current.length);
    strokes.current = [];
    setCount(0);
    redraw();
  };

  // Keep the key listener pointed at the current closures.
  actionsRef.current = { undo, redo };

  const done = () => {
    if (strokes.current.length > 0) onDone(strokes.current);
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scribble"
      className="fixed inset-0 z-50 flex flex-col bg-bg-deep/45 backdrop-blur-[2px]"
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-safe">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="press flex size-10 items-center justify-center rounded-full bg-surface-raised/80
                     text-secondary hover:text-text"
        >
          <X size={20} aria-hidden />
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={count === 0}
            aria-label="Undo"
            title="Undo (⌘Z / Ctrl+Z)"
            className="press flex size-10 items-center justify-center rounded-full bg-surface-raised/80
                       text-secondary hover:text-text disabled:opacity-30"
          >
            <Undo2 size={19} aria-hidden />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={redoCount === 0}
            aria-label="Redo"
            title="Redo (⌘⇧Z / Ctrl+Y)"
            className="press flex size-10 items-center justify-center rounded-full bg-surface-raised/80
                       text-secondary hover:text-text disabled:opacity-30"
          >
            <Redo2 size={19} aria-hidden />
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={count === 0}
            aria-label="Clear"
            className="press flex size-10 items-center justify-center rounded-full bg-surface-raised/80
                       text-secondary hover:text-danger disabled:opacity-30"
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </div>

        <button
          type="button"
          onClick={done}
          disabled={count === 0}
          aria-label="Done"
          className="press flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-b
                     from-accent-solid to-accent-solid-deep px-4 text-sm font-medium text-white
                     shadow-accent disabled:opacity-40 disabled:shadow-none"
        >
          <Check size={16} aria-hidden />
          Done
        </button>
      </div>

      <div ref={wrapRef} className="relative flex-1 touch-none overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {count === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs text-muted">
            Draw over the chat — it stays with these messages
          </p>
        )}
      </div>

      {/* Tools clustered in the bottom-left corner — a compact pill
          rather than a bar spanning the window. */}
      <div className="absolute bottom-0 left-0 p-3 pb-safe">
        <div className="panel relative flex items-center gap-1 rounded-2xl border border-hairline p-1.5 shadow-lift">
          <button
            type="button"
            onClick={() => {
              setTool('pen');
            }}
            aria-label="Pen"
            aria-pressed={tool === 'pen'}
            className={cn(
              'press flex size-9 items-center justify-center rounded-xl transition-colors',
              tool === 'pen' ? 'bg-accent-solid text-white shadow-accent' : 'text-secondary hover:text-text',
            )}
          >
            <Pen size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              setTool('brush');
            }}
            aria-label="Brush"
            aria-pressed={tool === 'brush'}
            className={cn(
              'press flex size-9 items-center justify-center rounded-xl transition-colors',
              tool === 'brush' ? 'bg-accent-solid text-white shadow-accent' : 'text-secondary hover:text-text',
            )}
          >
            <Brush size={16} aria-hidden />
          </button>

          <span className="mx-1 h-6 w-px bg-hairline" aria-hidden />

          {/* Thickness: a short slider with a live preview dot. */}
          <span
            aria-hidden
            className="ml-1 shrink-0 rounded-full transition-all duration-100"
            style={{
              width: Math.max(4, Math.min(width, 22)),
              height: Math.max(4, Math.min(width, 22)),
              backgroundColor: color,
            }}
          />
          <input
            type="range"
            min={2}
            max={44}
            value={width}
            onChange={(event) => {
              setWidth(Number(event.target.value));
            }}
            aria-label="Thickness"
            className="h-1.5 w-20 cursor-pointer accent-accent"
          />

          <span className="mx-1 h-6 w-px bg-hairline" aria-hidden />

          <button
            type="button"
            onClick={() => {
              setPickerOpen((open) => !open);
            }}
            aria-label="Colour"
            aria-expanded={pickerOpen}
            className="press size-8 shrink-0 rounded-full border-2 border-white/70"
            style={{ backgroundColor: color }}
          />

          {pickerOpen && (
            <ColorWheel
              color={color}
              // Live: the colour updates as you drag, so the preview dot and the
              // next stroke follow immediately. Closing is the outside click.
              onPick={setColor}
              onClose={() => {
                setPickerOpen(false);
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// --- colour maths -----------------------------------------------------------

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  // Written as branches rather than a lookup table on purpose: indexing an
  // array yields `number | undefined` under `noUncheckedIndexedAccess`, and
  // the fallback needed to satisfy that would be dead code pretending to be
  // meaningful. The sector is always 0–5, and this says so plainly.
  let r = 0;
  let g = 0;
  let b = 0;
  const sector = Math.floor(h / 60) % 6;
  if (sector === 0) {
    r = c;
    g = x;
  } else if (sector === 1) {
    r = x;
    g = c;
  } else if (sector === 2) {
    g = c;
    b = x;
  } else if (sector === 3) {
    g = x;
    b = c;
  } else if (sector === 4) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const to255 = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

function hexToHsv(hex: string): Hsv {
  // Captured into a local so the non-null check narrows cleanly under
  // `noUncheckedIndexedAccess` — indexing the match array inline does not.
  const digits = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (digits === undefined) return { h: 0, s: 0, v: 1 };
  const int = parseInt(digits, 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

// --- picker -----------------------------------------------------------------

const WHEEL = 168; // outer diameter, px
const RING = 20; // ring thickness, px

/**
 * A continuous colour picker: a hue ring around a saturation/brightness square.
 *
 * Replaces the old twelve fixed swatches — every colour is reachable, including
 * pure white and black at the corners of the square, so no separate neutral row
 * is needed. Both controls are drag-tracked with pointer capture, so a drag
 * that leaves the element keeps updating instead of stopping dead.
 *
 * Changes are published live while dragging: the thickness preview dot and the
 * next stroke both follow the colour as you move, which is the whole point of a
 * continuous picker over a palette.
 */
function ColorWheel({
  color,
  onPick,
  onClose,
}: {
  color: string;
  onPick: (color: string) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const squareRef = useRef<HTMLDivElement | null>(null);

  // Seeded from the current colour so opening the picker never jumps.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color));
  const [hex, setHex] = useState(color);

  const commit = (next: Hsv) => {
    setHsv(next);
    const value = hsvToHex(next);
    setHex(value);
    onPick(value);
  };

  useEffect(() => {
    const attach = setTimeout(() => {
      document.addEventListener('pointerdown', onDown);
    }, 0);
    function onDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    return () => {
      clearTimeout(attach);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  /** Angle from the top, clockwise — matches conic-gradient's own origin. */
  const hueFromEvent = (event: React.PointerEvent) => {
    const rect = ringRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    commit({ ...hsv, h: deg });
  };

  const svFromEvent = (event: React.PointerEvent) => {
    const rect = squareRef.current?.getBoundingClientRect();
    if (!rect) return;
    commit({
      ...hsv,
      s: clamp01((event.clientX - rect.left) / rect.width),
      // Brightness runs bottom-to-top, as everywhere else.
      v: clamp01(1 - (event.clientY - rect.top) / rect.height),
    });
  };

  const square = Math.round((WHEEL - RING * 2) * 0.707); // inscribed in the inner circle
  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div
      ref={rootRef}
      className="panel animate-scale-in absolute bottom-full left-0 mb-3 flex flex-col items-center
                 gap-2 rounded-2xl border border-hairline p-3 shadow-lift"
    >
      <div className="relative" style={{ width: WHEEL, height: WHEEL }}>
        {/* Hue ring */}
        <div
          ref={ringRef}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            hueFromEvent(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons > 0) hueFromEvent(event);
          }}
          role="slider"
          aria-label="Hue"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(hsv.h)}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') commit({ ...hsv, h: (hsv.h + 355) % 360 });
            if (event.key === 'ArrowRight') commit({ ...hsv, h: (hsv.h + 5) % 360 });
          }}
          className="absolute inset-0 cursor-pointer rounded-full"
          style={{
            background:
              'conic-gradient(hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),' +
              'hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%))',
            // Punches the middle out so only the ring is interactive-looking.
            WebkitMask: `radial-gradient(circle, transparent ${String(WHEEL / 2 - RING)}px, #000 ${String(WHEEL / 2 - RING + 1)}px)`,
            mask: `radial-gradient(circle, transparent ${String(WHEEL / 2 - RING)}px, #000 ${String(WHEEL / 2 - RING + 1)}px)`,
          }}
        />

        {/* Hue handle */}
        <span
          aria-hidden
          className="pointer-events-none absolute size-4 rounded-full border-2 border-white shadow-lift"
          style={{
            backgroundColor: hueHex,
            left: `calc(50% + ${String(Math.sin((hsv.h * Math.PI) / 180) * (WHEEL / 2 - RING / 2))}px)`,
            top: `calc(50% - ${String(Math.cos((hsv.h * Math.PI) / 180) * (WHEEL / 2 - RING / 2))}px)`,
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Saturation / brightness square */}
        <div
          ref={squareRef}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            svFromEvent(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons > 0) svFromEvent(event);
          }}
          className="absolute cursor-crosshair rounded-md"
          style={{
            width: square,
            height: square,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueHex})`,
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute size-3.5 rounded-full border-2 border-white shadow-lift"
            style={{
              backgroundColor: hex,
              left: `${String(hsv.s * 100)}%`,
              top: `${String((1 - hsv.v) * 100)}%`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
      </div>

      {/* Live swatch + hex, for when you want an exact value. */}
      <div className="flex w-full items-center gap-2">
        <span
          aria-hidden
          className="size-7 shrink-0 rounded-full border border-white/25"
          style={{ backgroundColor: hex }}
        />
        <input
          value={hex}
          onChange={(event) => {
            const next = event.target.value;
            setHex(next);
            if (/^#?[0-9a-f]{6}$/i.test(next.trim())) {
              const normalised = next.trim().startsWith('#') ? next.trim() : `#${next.trim()}`;
              setHsv(hexToHsv(normalised));
              onPick(normalised);
            }
          }}
          spellCheck={false}
          aria-label="Hex colour"
          className="h-8 w-full min-w-0 rounded-md border border-hairline bg-surface-raised px-2
                     font-mono text-xs uppercase text-text focus:border-accent focus:outline-none"
        />
      </div>
    </div>
  );
}
