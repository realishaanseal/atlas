import { Loader2, Play, VideoOff } from 'lucide-react';
import { useVideo } from '@/hooks/useVideo';
import { cn } from '@/utils/cn';
import type { MessagePayload } from '@/types';

type VideoPayload = Extract<MessagePayload, { kind: 'video' }>;

interface VideoBubbleProps {
  cryptoKey: CryptoKey;
  payload: VideoPayload;
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

export function VideoBubble({ cryptoKey, payload }: VideoBubbleProps) {
  const { posterUrl, fullUrl, loading, failed, load } = useVideo(cryptoKey, payload);

  const ratio = payload.width > 0 && payload.height > 0 ? payload.width / payload.height : 16 / 9;
  const displayWidth = Math.min(payload.width || 320, 320);

  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-surface-raised px-3 py-6 text-xs text-muted">
        <VideoOff size={15} aria-hidden />
        Video expired or unavailable
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-md bg-black"
      style={{ width: displayWidth, aspectRatio: String(ratio) }}
    >
      {fullUrl ? (
        <video
          src={fullUrl}
          controls
          autoPlay
          playsInline
          className="absolute inset-0 size-full object-contain"
        />
      ) : (
        <button
          type="button"
          onClick={load}
          aria-label="Play video"
          className="group absolute inset-0 block size-full"
        >
          {posterUrl && (
            <img src={posterUrl} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/25 transition-colors group-hover:bg-black/10">
            <span
              className={cn(
                'flex size-12 items-center justify-center rounded-full',
                'bg-black/55 text-white backdrop-blur-sm',
              )}
            >
              {loading ? (
                <Loader2 size={22} className="animate-spin" aria-label="Loading video" />
              ) : (
                <Play size={22} className="ml-0.5 fill-current" aria-hidden />
              )}
            </span>
          </span>
          {payload.durationMs > 0 && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
              {formatDuration(payload.durationMs)}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
