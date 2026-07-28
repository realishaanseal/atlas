import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessagePayload } from '@/types';

type VideoPayload = Extract<MessagePayload, { kind: 'video' }>;

/**
 * Decrypts a video for playback.
 *
 * The poster (a small first-frame WebP) is decrypted immediately so the bubble
 * can show a still. The clip itself can be large, so it is fetched only on
 * demand — when the person taps play — rather than pinning every scrolled-past
 * video's plaintext in memory. Object URLs are revoked on unmount.
 */
export function useVideo(key: CryptoKey, payload: VideoPayload) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const urls = urlsRef.current;

    if (payload.poster) {
      void (async () => {
        try {
          const { decryptPoster } = await import('@/services/video');
          const url = await decryptPoster(key, payload.poster as NonNullable<typeof payload.poster>);
          if (cancelled) URL.revokeObjectURL(url);
          else {
            urls.push(url);
            setPosterUrl(url);
          }
        } catch {
          // No poster is fine — the play button still works.
        }
      })();
    }

    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
      urlsRef.current = [];
    };
  }, [key, payload]);

  const load = useCallback(() => {
    if (fullUrl || loading) return;
    setLoading(true);
    void (async () => {
      try {
        const { download } = await import('@/services/video');
        const url = await download(key, payload);
        urlsRef.current.push(url);
        setFullUrl(url);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [key, payload, fullUrl, loading]);

  return { posterUrl, fullUrl, loading, failed, load };
}
