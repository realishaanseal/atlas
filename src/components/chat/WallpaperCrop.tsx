import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2 } from 'lucide-react';

interface WallpaperCropProps {
  file: File;
  onApply: (dataUrl: string) => void;
  onCancel: () => void;
}

/**
 * Crops an uploaded photo to the screen's aspect before it becomes a wallpaper.
 *
 * The frame matches the viewport, so what you position here is exactly what
 * fills the background (which is `background-size: cover` on the same aspect —
 * no surprise re-crop). Pan by dragging, zoom with the slider; Apply exports the
 * framed region as a compressed data URL. Everything is local; the image is
 * never uploaded.
 */
export function WallpaperCrop({ file, onApply, onCancel }: WallpaperCropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const zoomRef = useRef(1);

  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  zoomRef.current = zoom;

  const aspect = window.innerWidth / Math.max(1, window.innerHeight);

  // Preview box: fit the frame within the modal.
  let ph = Math.min(window.innerHeight * 0.5, 440);
  let pw = ph * aspect;
  const maxW = Math.min(window.innerWidth * 0.82, 340);
  if (pw > maxW) {
    pw = maxW;
    ph = pw / aspect;
  }

  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, fw: number, fh: number, off: { x: number; y: number }, z: number) => {
      const img = imgRef.current;
      if (!img) return;
      const cover = Math.max(fw / img.width, fh / img.height);
      const eff = cover * z;
      const dw = img.width * eff;
      const dh = img.height * eff;
      const mx = Math.max(0, (dw - fw) / 2);
      const my = Math.max(0, (dh - fh) / 2);
      const ox = Math.max(-mx, Math.min(mx, off.x));
      const oy = Math.max(-my, Math.min(my, off.y));
      ctx.clearRect(0, 0, fw, fh);
      ctx.drawImage(img, fw / 2 - dw / 2 + ox, fh / 2 - dh / 2 + oy, dw, dh);
    },
    [],
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(pw * dpr);
    canvas.height = Math.round(ph * dpr);
    canvas.style.width = `${String(pw)}px`;
    canvas.style.height = `${String(ph)}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Clamp offset back into range as zoom changes.
    paint(ctx, pw, ph, offset.current, zoomRef.current);
  }, [paint, pw, ph]);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
    };
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (ready) render();
  }, [ready, zoom, render]);

  const onPointerDown = (event: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    offset.current.x += event.clientX - drag.current.x;
    offset.current.y += event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };

    // Clamp as we go, so dragging past an edge doesn't build up slack.
    const img = imgRef.current;
    if (img) {
      const cover = Math.max(pw / img.width, ph / img.height);
      const eff = cover * zoomRef.current;
      const mx = Math.max(0, (img.width * eff - pw) / 2);
      const my = Math.max(0, (img.height * eff - ph) / 2);
      offset.current.x = Math.max(-mx, Math.min(mx, offset.current.x));
      offset.current.y = Math.max(-my, Math.min(my, offset.current.y));
    }
    render();
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const apply = () => {
    const img = imgRef.current;
    if (!img) return;
    // Export at frame aspect, longer side ~1440.
    const outW = aspect >= 1 ? 1440 : Math.round(1440 * aspect);
    const outH = aspect >= 1 ? Math.round(1440 / aspect) : 1440;
    const scale = outW / pw;

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    paint(ctx, outW, outH, { x: offset.current.x * scale, y: offset.current.y * scale }, zoomRef.current);
    onApply(out.toDataURL('image/jpeg', 0.85));
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Position wallpaper"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg-deep/90 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="animate-rise flex flex-col items-center gap-4 rounded-lg border border-hairline
                   bg-surface p-4 shadow-lift"
      >
        <div
          className="relative overflow-hidden rounded-md border border-hairline bg-bg-deep"
          style={{ width: pw, height: ph }}
        >
          {!ready && (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 size={20} className="animate-spin text-accent" aria-label="Loading" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        <input
          type="range"
          min={1}
          max={3.5}
          step={0.01}
          value={zoom}
          onChange={(event) => {
            setZoom(Number(event.target.value));
          }}
          aria-label="Zoom"
          className="h-1.5 w-full cursor-pointer accent-accent"
        />

        <p className="text-[0.625rem] text-muted">Drag to move · slide to zoom</p>

        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="press flex flex-1 items-center justify-center gap-1.5 rounded-md border
                       border-hairline py-2.5 text-sm text-secondary hover:text-text"
          >
            <X size={15} aria-hidden />
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!ready}
            className="press flex flex-1 items-center justify-center gap-1.5 rounded-md
                       bg-gradient-to-b from-accent-solid to-accent-solid-deep py-2.5 text-sm
                       font-medium text-white shadow-accent disabled:opacity-40"
          >
            <Check size={15} aria-hidden />
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
