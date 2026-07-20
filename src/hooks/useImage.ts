import { useEffect, useState } from 'react';
import type { MessagePayload } from '@/types';

type ImagePayload = Extract<MessagePayload, { kind: 'image' }>;

/**
 * Decrypts an image for display.
 *
 * Object URLs are revoked on unmount. Without that, every image scrolled past
 * would pin its decrypted bytes in memory for the life of the page — which for
 * an app whose entire premise is that plaintext is transient would be a
 * meaningful leak, not just a memory issue.
 *
 * The blur preview is decrypted first and shown immediately; the full image
 * replaces it when ready.
 */
export function useImage(key: CryptoKey, payload: ImagePayload) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * Decrypted bytes, retained for GIFs only.
   *
   * Saving a GIF to favourites needs the actual file. Re-fetching the blob URL
   * would be the obvious way to get it and does not work — a blob: fetch falls
   * under `connect-src`, which the CSP does not permit — so the bytes are kept
   * from the decryption that already happened. Only for GIFs, because holding
   * a decrypted copy of every photo on screen is wasteful and keeps plaintext
   * around longer than it needs to be.
   */
  const [bytes, setBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    void (async () => {
      const service = await import('@/services/images');

      if (payload.preview) {
        try {
          const url = await service.decryptPreview(key, payload.preview);
          if (cancelled) URL.revokeObjectURL(url);
          else {
            urls.push(url);
            setPreviewUrl(url);
          }
        } catch {
          // A missing preview is cosmetic; the full image still loads.
        }
      }

      try {
        const result = await service.download(key, payload);
        if (cancelled) URL.revokeObjectURL(result.url);
        else {
          urls.push(result.url);
          setFullUrl(result.url);
          if (payload.mime === 'image/gif') setBytes(result.bytes);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [key, payload]);

  return { previewUrl, fullUrl, failed, bytes };
}
