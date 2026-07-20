import { useEffect, useState } from 'react';
import { ImageOff, Loader2, Star } from 'lucide-react';
import { useImage } from '@/hooks/useImage';
import { useGifFavourites, hashBytes } from '@/hooks/useGifFavourites';
import { cn } from '@/utils/cn';
import type { MessagePayload } from '@/types';

type ImagePayload = Extract<MessagePayload, { kind: 'image' }>;

interface ImageBubbleProps {
  cryptoKey: CryptoKey;
  payload: ImagePayload;
  onOpen: (url: string) => void;
}

export function ImageBubble({ cryptoKey, payload, onOpen }: ImageBubbleProps) {
  const { previewUrl, fullUrl, failed, bytes } = useImage(cryptoKey, payload);
  const { toggleLocal, isFavourite } = useGifFavourites();

  const isGif = payload.mime === 'image/gif';

  /**
   * The GIF's content hash, computed once when the bytes arrive.
   *
   * `saved` is DERIVED from this against the favourites list rather than kept
   * as its own state. Holding a separate boolean and flipping it optimistically
   * meant two sources of truth for one fact, and the effect that recomputed it
   * would race the write that had just changed it.
   */
  const [hash, setHash] = useState<string | null>(null);

  useEffect(() => {
    if (!isGif || !bytes) return;
    let cancelled = false;
    void (async () => {
      const value = await hashBytes(bytes);
      if (!cancelled) setHash(value);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGif, bytes]);

  const saved = hash !== null && isFavourite(hash);

  const toggleSaved = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!bytes) {
      console.error('GIF favourite: bytes unavailable');
      return;
    }
    try {
      await toggleLocal(bytes, payload.width, payload.height);
    } catch (error) {
      console.error('GIF favourite failed', error);
    }
  };

  // Reserve the correct space before anything loads, so the message list does
  // not jump as images resolve.
  const ratio = payload.width / payload.height;
  const displayWidth = Math.min(payload.width, 320);

  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-surface-raised px-3 py-6 text-xs text-muted">
        <ImageOff size={15} aria-hidden />
        Image expired or unavailable
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative block overflow-hidden rounded-md',
        // GIFs are frequently drawn with a transparent background intended to
        // sit on white. Left on a dark surface the artwork's own outlines
        // disappear into the bubble. Photos and WebP have no alpha channel
        // here, so they keep the neutral surface.
        isGif ? 'bg-white' : 'bg-surface-raised',
      )}
      style={{ width: displayWidth, aspectRatio: String(ratio) }}
    >
      {/* Save a GIF that arrived in the conversation — dragged in, pasted, or
          sent by the other person. Those never had a Giphy URL, so favouriting
          one keeps the actual bytes. */}
      {isGif && bytes && hash && (
        <button
          type="button"
          onClick={(event) => void toggleSaved(event)}
          aria-label={saved ? 'Remove from favourite GIFs' : 'Save to favourite GIFs'}
          aria-pressed={saved}
          className={cn(
            'press absolute right-1.5 top-1.5 z-20 flex size-8 items-center justify-center',
            'rounded-full bg-bg-deep/70 backdrop-blur-sm transition-opacity duration-150',
            // Always visible, just faint until hovered. Hiding it entirely
            // made the feature undiscoverable and fiddly to hit on touch,
            // where there is no hover at all.
            saved ? 'opacity-100' : 'opacity-60 group-hover:opacity-100',
          )}
        >
          <Star
            size={14}
            className={saved ? 'fill-accent text-accent' : 'text-white'}
            aria-hidden
          />
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          if (fullUrl) onOpen(fullUrl);
        }}
        disabled={!fullUrl}
        aria-label="Open image full screen"
        className="relative z-0 block size-full"
      >
      {previewUrl && (
        <img
          src={previewUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full scale-110 object-cover blur-lg"
        />
      )}

        {fullUrl ? (
          <img
            src={fullUrl}
            alt="Shared image"
            className="animate-rise absolute inset-0 size-full object-cover transition-transform
                       duration-200 ease-soft group-hover:scale-[1.02]"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center">
            <Loader2 size={18} className="animate-spin text-secondary" aria-label="Decrypting" />
          </span>
        )}
      </button>
    </div>
  );
}
