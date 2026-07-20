import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, ShieldAlert, Star, TrendingUp } from 'lucide-react';
import { useGifFavourites, type GifFavourite } from '@/hooks/useGifFavourites';
import type { GifResult } from '@/services/gifs';
import { cn } from '@/utils/cn';

interface GifPickerProps {
  onPick: (result: GifResult) => void;
  /** Favourites we hold bytes for skip Giphy entirely and send directly. */
  onPickFile: (file: File) => void;
  onClose: () => void;
}

/** Object URLs for locally-stored favourites, revoked when the panel closes. */
function useLocalPreviews(favourites: GifFavourite[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const created: string[] = [];
    const next: Record<string, string> = {};

    for (const favourite of favourites) {
      if (favourite.kind !== 'local') continue;
      const url = URL.createObjectURL(
        new Blob([favourite.data], { type: 'image/gif' }),
      );
      created.push(url);
      next[favourite.id] = url;
    }

    setUrls(next);
    return () => {
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [favourites]);

  return urls;
}

type Tab = 'browse' | 'favourites';

/**
 * GIF search panel.
 *
 * Worth restating what this does to the app's privacy posture, since it is the
 * only outbound request that is not to Firebase: the search term is sent to
 * Giphy. Nothing else is — no room id, no message content, no user identifier,
 * and the request carries no referrer or credentials.
 *
 * The chosen GIF is downloaded by the sender, encrypted, and stored in
 * Firestore like any other image, so the recipient's browser never contacts
 * Giphy. Giphy can learn that someone searched for "cat"; it cannot learn that
 * a conversation happened, who was in it, or when.
 */
export function GifPicker({ onPick, onPickFile, onClose }: GifPickerProps) {
  const [tab, setTab] = useState<Tab>('browse');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { favourites, toggleGiphy, isFavourite } = useGifFavourites();
  const localPreviews = useLocalPreviews(favourites);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Debounced so typing "birthday" is one request, not eight — which matters
  // more than usual here, because every request is a term sent to Giphy.
  useEffect(() => {
    if (tab === 'favourites') return;

    let cancelled = false;
    const timer = setTimeout(
      () => {
        void (async () => {
          setLoading(true);
          setError(null);
          try {
            const gifs = await import('@/services/gifs');
            const found =
              query.trim().length > 0 ? await gifs.search(query.trim()) : await gifs.featured();
            if (!cancelled) setResults(found);
          } catch {
            if (!cancelled) setError('Could not reach GIF search.');
          } finally {
            if (!cancelled) setLoading(false);
          }
        })();
      },
      query.trim().length > 0 ? 400 : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, tab]);

  const showLoading = tab === 'browse' && loading;

  // Normalises both kinds into what the grid needs to render and send.
  const visible: {
    id: string;
    previewUrl: string;
    description: string;
    send: () => void;
    onFavourite?: () => void;
  }[] =
    tab === 'favourites'
      ? favourites.map((favourite) =>
          favourite.kind === 'giphy'
            ? {
                id: favourite.id,
                previewUrl: favourite.previewUrl,
                description: favourite.description,
                send: () => {
                  onPick(favourite);
                },
                onFavourite: () => {
                  toggleGiphy(favourite);
                },
              }
            : {
                id: favourite.id,
                previewUrl: localPreviews[favourite.id] ?? '',
                description: favourite.description,
                send: () => {
                  onPickFile(
                    new File([favourite.data], `${favourite.id}.gif`, {
                      type: 'image/gif',
                    }),
                  );
                },
              },
        )
      : results.map((result) => ({
          id: result.id,
          previewUrl: result.previewUrl,
          description: result.description,
          send: () => {
            onPick(result);
          },
          onFavourite: () => {
            toggleGiphy(result);
          },
        }));

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Search GIFs"
      // Near-opaque rather than the usual glass: this panel is full of imagery
      // and sits over message bubbles, and at normal glass opacity the bubbles
      // read through it as ghosting.
      className="animate-rise absolute bottom-[calc(100%+0.75rem)] right-0 z-30 w-[min(26rem,86vw)]
                 overflow-hidden rounded-md border border-border bg-surface/97 shadow-lift
                 backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 border-b border-border p-2">
        <div className="relative flex-1">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setTab('browse');
            }}
            placeholder="Search GIFs"
            aria-label="Search GIFs"
            className="h-10 w-full rounded-sm border border-border bg-surface-raised pl-9 pr-3
                       text-base text-text placeholder:text-muted focus:border-accent
                       focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setTab((current) => (current === 'favourites' ? 'browse' : 'favourites'));
          }}
          aria-label="Favourite GIFs"
          aria-pressed={tab === 'favourites'}
          className={cn(
            'press flex size-10 shrink-0 items-center justify-center rounded-sm',
            tab === 'favourites'
              ? 'bg-accent-solid/25 text-accent'
              : 'text-secondary hover:bg-surface-raised hover:text-accent',
          )}
        >
          {tab === 'favourites' ? (
            <Star size={17} className="fill-accent" aria-hidden />
          ) : (
            <Star size={17} aria-hidden />
          )}
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto p-2">
        {showLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-accent" aria-label="Searching" />
          </div>
        )}

        {!showLoading && error !== null && (
          <p className="py-10 text-center text-xs text-danger">{error}</p>
        )}

        {!showLoading && error === null && visible.length === 0 && (
          <p className="flex flex-col items-center gap-2 py-10 text-center text-xs text-muted">
            {tab === 'favourites' ? (
              <>
                <Star size={18} aria-hidden />
                No favourites yet. Right-click a GIF to save it here.
              </>
            ) : (
              <>
                <TrendingUp size={18} aria-hidden />
                No GIFs found.
              </>
            )}
          </p>
        )}

        {!showLoading && error === null && visible.length > 0 && (
          <div className="columns-3 gap-2 [&>*]:mb-2">
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.send}
                onContextMenu={(event) => {
                  event.preventDefault();
                  item.onFavourite?.();
                }}
                title={
                  isFavourite(item.id)
                    ? 'Right-click to remove from favourites'
                    : 'Right-click to save to favourites'
                }
                className="press relative block w-full overflow-hidden rounded-sm border
                           border-transparent transition-colors duration-150 hover:border-accent"
              >
                <img
                  src={item.previewUrl}
                  alt={item.description}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full"
                />
                {isFavourite(item.id) && (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 flex size-5 items-center justify-center
                               rounded-full bg-bg-deep/80 backdrop-blur-sm"
                  >
                    <Star size={11} className="fill-accent text-accent" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="flex items-start gap-1.5 border-t border-border px-3 py-2 text-[0.625rem] leading-relaxed text-muted">
        <ShieldAlert size={12} className="mt-0.5 shrink-0" aria-hidden />
        Search terms go to Giphy. The GIF you pick is encrypted before sending — the other
        person never contacts Giphy. Right-click to favourite.
      </p>
    </div>
  );
}
