import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Loader2, AudioLines } from 'lucide-react';
import type { MessagePayload } from '@/types';
import { cn } from '@/utils/cn';

type AudioPayload = Extract<MessagePayload, { kind: 'audio' }>;

interface AudioBubbleProps {
  cryptoKey: CryptoKey;
  payload: AudioPayload;
  mine: boolean;
}

function formatTime(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Voice message playback.
 *
 * The waveform is drawn from peaks captured at record time and stored in the
 * message, so bars appear immediately rather than after the clip downloads and
 * decodes. Bars fill with colour as playback passes them.
 *
 * Audio is fetched lazily on first play. Decrypting every voice note in the
 * conversation on mount would be wasteful and would hold plaintext in memory
 * for clips nobody listened to.
 */
export function AudioBubble({ cryptoKey, payload, mine }: AudioBubbleProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      audioRef.current?.pause();
    };
  }, []);

  const toggle = async () => {
    if (failed) return;

    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }

    let src = url;
    if (!src) {
      setLoading(true);
      try {
        const { download } = await import('@/services/audio');
        src = await download(cryptoKey, payload);
        urlRef.current = src;
        setUrl(src);
      } catch {
        setFailed(true);
        return;
      } finally {
        setLoading(false);
      }
    }

    const audio = audioRef.current ?? new Audio(src);
    audioRef.current = audio;
    audio.ontimeupdate = () => {
      setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
    };
    audio.onended = () => {
      setPlaying(false);
      setProgress(0);
    };
    await audio.play();
    setPlaying(true);
  };

  if (failed) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs opacity-70">
        <AudioLines size={15} aria-hidden />
        Recording unavailable
      </div>
    );
  }

  const elapsed = playing || progress > 0 ? payload.durationMs * progress : payload.durationMs;

  return (
    <div className="flex items-center gap-3 py-0.5">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={cn(
          'press flex size-9 shrink-0 items-center justify-center rounded-full',
          mine ? 'bg-white/20 text-white' : 'bg-accent-solid text-white shadow-glow',
        )}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : playing ? (
          <Pause size={16} aria-hidden />
        ) : (
          <Play size={16} className="ml-0.5" aria-hidden />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-7 items-center gap-[2px]" aria-hidden>
          {payload.peaks.map((peak, index) => {
            const passed = index / payload.peaks.length <= progress;
            return (
              <span
                key={index}
                className={cn(
                  'w-[3px] shrink-0 rounded-full transition-colors duration-150',
                  mine
                    ? passed
                      ? 'bg-white'
                      : 'bg-white/35'
                    : passed
                      ? 'bg-accent'
                      : 'bg-border-strong',
                )}
                style={{ height: `${String(Math.max(10, Math.min(100, peak)))}%` }}
              />
            );
          })}
        </div>
        <span className={cn('text-[0.6875rem] tabular-nums', mine ? 'text-white/70' : 'text-muted')}>
          {formatTime(elapsed)}
        </span>
      </div>
    </div>
  );
}
