import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Undo2, Redo2, Trash2, Check, Pen, Brush, Plus } from 'lucide-react';
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

const RING_HUES = Array.from({ length: 12 }, (_, i) => `hsl(${String(i * 30)} 85% 58%)`);
const NEUTRALS = ['#ffffff', '#c9d2e3', '#8d97ad', '#000000'];

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
                     shadow-glow disabled:opacity-40 disabled:shadow-none"
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

      {/* Tools clustered in the bottom-left corner — a compact glass pill
          rather than a bar spanning the window. */}
      <div className="absolute bottom-0 left-0 p-3 pb-safe">
        <div className="glass relative flex items-center gap-1 rounded-2xl border border-border p-1.5 shadow-lift">
          <button
            type="button"
            onClick={() => {
              setTool('pen');
            }}
            aria-label="Pen"
            aria-pressed={tool === 'pen'}
            className={cn(
              'press flex size-9 items-center justify-center rounded-xl transition-colors',
              tool === 'pen' ? 'bg-accent-solid text-white shadow-glow' : 'text-secondary hover:text-text',
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
              tool === 'brush' ? 'bg-accent-solid text-white shadow-glow' : 'text-secondary hover:text-text',
            )}
          >
            <Brush size={16} aria-hidden />
          </button>

          <span className="mx-1 h-6 w-px bg-border" aria-hidden />

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

          <span className="mx-1 h-6 w-px bg-border" aria-hidden />

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
            <ColorRing
              color={color}
              onPick={(next) => {
                setColor(next);
                setPickerOpen(false);
              }}
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

function ColorRing({
  color,
  onPick,
  onClose,
}: {
  color: string;
  onPick: (color: string) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const radius = 92;

  return (
    <div
      ref={rootRef}
      className="glass animate-rise absolute bottom-full left-0 mb-3 flex size-56 items-center
                 justify-center rounded-full border border-border shadow-lift"
    >
      {RING_HUES.map((hue, i) => {
        const angle = (i / RING_HUES.length) * 2 * Math.PI - Math.PI / 2;
        return (
          <button
            key={hue}
            type="button"
            onClick={() => {
              onPick(hue);
            }}
            aria-label={`Colour ${String(i)}`}
            className="press absolute size-7 rounded-full border border-black/20"
            style={{
              backgroundColor: hue,
              left: `calc(50% + ${String(Math.cos(angle) * radius)}px)`,
              top: `calc(50% + ${String(Math.sin(angle) * radius)}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        );
      })}

      <div className="flex items-center gap-1.5 rounded-full bg-bg-deep/70 p-1.5">
        {NEUTRALS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              onPick(n);
            }}
            aria-label={`Colour ${n}`}
            className="press size-6 rounded-full border border-white/20"
            style={{ backgroundColor: n }}
          />
        ))}
        <label
          className="press flex size-6 cursor-pointer items-center justify-center rounded-full
                     border border-white/20 text-white"
          style={{ backgroundColor: color }}
        >
          <Plus size={13} aria-hidden />
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ffffff'}
            onChange={(event) => {
              onPick(event.target.value);
            }}
            className="sr-only"
          />
        </label>
      </div>
    </div>
  );
}
