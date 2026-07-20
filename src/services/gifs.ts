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

function toResults(payload: { data?: GiphyItem[] }): GifResult[] {
  return (payload.data ?? []).flatMap((item): GifResult[] => {
    const media = item.images[GIF.RENDITION] ?? item.images['fixed_height'];
    const preview = item.images[GIF.PREVIEW_RENDITION] ?? media;
    if (!media?.url || !preview?.url) return [];

    // Anything over budget is dropped here rather than failing at send time.
    const size = Number(media.size ?? '0');
    if (size > GIF.MAX_BYTES) return [];

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

async function request(path: string, params: Record<string, string>): Promise<GifResult[]> {
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

  return toResults((await response.json()) as { data?: GiphyItem[] });
}

export function search(query: string): Promise<GifResult[]> {
  return request('search', { q: query });
}

export function featured(): Promise<GifResult[]> {
  return request('trending', {});
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
