import { GIF } from '@/config';
import { AppError } from '@/utils/result';

/**
 * Giphy search.
 *
 * This is the only outbound request in the entire application that is not to
 * Firebase. It carries the sender's search term and nothing else — no room id,
 * no user id, no message content, no referrer, no credentials.
 *
 * The chosen GIF is downloaded here, encrypted, and stored in Firestore by the
 * caller, so the recipient's browser never contacts Giphy at all. Giphy can
 * learn that someone searched for "cat"; it cannot learn that a conversation
 * happened, who was in it, or when.
 *
 * (Tenor was the first choice, but its API is no longer reliably reachable
 * through the Google Cloud console. Giphy is equivalent for our purposes and
 * has a far simpler key process.)
 */

export interface GifResult {
  readonly id: string;
  readonly url: string;
  readonly previewUrl: string;
  readonly width: number;
  readonly height: number;
  readonly description: string;
}

interface GiphyRendition {
  url?: string;
  width?: string;
  height?: string;
  size?: string;
}

interface GiphyItem {
  id: string;
  title?: string;
  images: Record<string, GiphyRendition | undefined>;
}

/**
 * The largest rendition that still fits the budget.
 *
 * Giphy returns the same GIF at a dozen sizes. Asking for one preferred
 * rendition and DISCARDING the result when it is too big — which is what this
 * used to do — threw away a large share of every page, which is why the grid
 * looked so sparse. Stepping down through smaller renditions keeps nearly
 * everything; a slightly lower-resolution GIF is obviously better than no GIF.
 */
const RENDITION_LADDER = [
  GIF.RENDITION,
  'downsized_medium',
  'fixed_height',
  'downsized_small',
  'fixed_height_small',
] as const;

function pickRendition(images: GiphyItem['images']): GiphyRendition | undefined {
  for (const name of RENDITION_LADDER) {
    const candidate = images[name];
    if (!candidate?.url) continue;
    const size = Number(candidate.size ?? '0');
    // A missing size is treated as acceptable: fetchBytes re-checks the real
    // bytes before sending, so an optimistic guess here costs nothing.
    if (size === 0 || size <= GIF.MAX_BYTES) return candidate;
  }
  return undefined;
}

function toResults(payload: { data?: GiphyItem[] }): GifResult[] {
  return (payload.data ?? []).flatMap((item): GifResult[] => {
    const media = pickRendition(item.images);
    const preview = item.images[GIF.PREVIEW_RENDITION] ?? media;
    if (!media?.url || !preview?.url) return [];

    return [
      {
        id: item.id,
        url: media.url,
        previewUrl: preview.url,
        width: Number(media.width ?? '0') || 200,
        height: Number(media.height ?? '0') || 200,
        description: item.title ?? 'GIF',
      },
    ];
  });
}

export interface GifPage {
  readonly results: GifResult[];
  /** False once Giphy stops returning anything, so scrolling can stop asking. */
  readonly hasMore: boolean;
}

async function request(path: string, params: Record<string, string>): Promise<GifPage> {
  if (GIF.API_KEY.length === 0) throw new AppError('unknown', 'GIF search is not configured');

  const url = new URL(`${GIF.ENDPOINT}/${path}`);
  url.search = new URLSearchParams({
    api_key: GIF.API_KEY,
    limit: String(GIF.LIMIT),
    rating: GIF.RATING,
    ...params,
  }).toString();

  const response = await fetch(url, { referrerPolicy: 'no-referrer', credentials: 'omit' });
  if (!response.ok) throw new AppError('network', 'GIF search failed');

  const payload = (await response.json()) as { data?: GiphyItem[] };
  const raw = payload.data?.length ?? 0;

  return {
    results: toResults(payload),
    // Judged on what Giphy RETURNED, not on what survived filtering — a page
    // where most items were unusable is not the end of the results.
    hasMore: raw >= GIF.LIMIT,
  };
}

export function search(query: string, offset = 0): Promise<GifPage> {
  return request('search', { q: query, offset: String(offset) });
}

export function featured(offset = 0): Promise<GifPage> {
  return request('trending', { offset: String(offset) });
}

/**
 * Fetches the chosen GIF so it can be encrypted and stored locally.
 *
 * The size is re-checked after download — the reported size is metadata, and
 * metadata is not a guarantee.
 */
export async function fetchBytes(result: GifResult): Promise<File> {
  const response = await fetch(result.url, {
    referrerPolicy: 'no-referrer',
    credentials: 'omit',
  });
  if (!response.ok) throw new AppError('network', 'Could not download that GIF');

  const blob = await response.blob();
  if (blob.size > GIF.MAX_BYTES) {
    throw new AppError('file-too-large', 'That GIF is too large to send');
  }

  return new File([blob], `${result.id}.gif`, { type: 'image/gif' });
}
