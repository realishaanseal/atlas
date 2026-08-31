import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, SwitchCamera, Circle } from 'lucide-react';

interface CameraSheetProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

/**
 * Live camera capture.
 *
 * Uses getUserMedia rather than `<input capture>` so it works identically on
 * desktop and mobile — `capture` is a mobile-only hint that desktop browsers
 * silently ignore, which would make the camera button do nothing on a laptop.
 *
 * The captured frame is drawn to a canvas and exported as WebP, which means it
 * enters the existing image pipeline already stripped of metadata — a canvas
 * frame has no EXIF to begin with.
 *
 * The stream is stopped on every exit path. A camera left running is both a
 * battery drain and an alarming indicator light in an app like this.
 */
export function CameraSheet({ onCapture, onClose }: CameraSheetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      stop();
      setReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1600 }, height: { ideal: 1600 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => {
            t.stop();
          });
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        if (!cancelled) setError('Camera unavailable. Check browser permissions.');
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, stop]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Mirror the front camera, matching what the user saw in the preview.
    if (facing === 'user') {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `capture-${String(Date.now())}.webp`, { type: 'image/webp' }));
        onClose();
      },
      'image/webp',
      0.9,
    );
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
      className="animate-rise fixed inset-0 z-50 flex flex-col bg-bg-deep/95 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-4 pt-safe">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="press glass mt-3 flex size-10 items-center justify-center rounded-full
                     border border-hairline text-text"
        >
          <X size={18} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            setFacing((f) => (f === 'user' ? 'environment' : 'user'));
          }}
          aria-label="Switch camera"
          className="press glass mt-3 flex size-10 items-center justify-center rounded-full
                     border border-hairline text-text"
        >
          <SwitchCamera size={18} aria-hidden />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        {error !== null ? (
          <p className="max-w-xs text-center text-sm text-secondary">{error}</p>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className={cnVideo(facing === 'user', ready)}
          />
        )}
      </div>

      <div className="flex items-center justify-center pb-safe pt-2">
        <button
          type="button"
          onClick={capture}
          disabled={!ready}
          aria-label="Take photo"
          className="press mb-6 flex size-[72px] items-center justify-center rounded-full
                     border-4 border-white/80 disabled:opacity-40"
        >
          <Circle size={54} className="fill-white text-white" aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}

function cnVideo(mirrored: boolean, ready: boolean): string {
  return [
    'max-h-full max-w-full rounded-lg object-contain transition-opacity duration-300',
    mirrored ? '-scale-x-100' : '',
    ready ? 'opacity-100' : 'opacity-0',
  ]
    .filter(Boolean)
    .join(' ');
}
