import type { Message } from '@/types';
import * as store from '@/storage/archive';
import type { ArchivedEmoji, ArchivedMedia, ArchivedMessage } from '@/storage/archive';

/**
 * Capturing the decrypted chat into the local archive.
 *
 * The app already decrypts every message to render it; this module mirrors that
 * decrypted view into IndexedDB (storage/archive) so it survives Firebase's 24h
 * sweep. Media bytes are fetched and stored the first time a message is seen,
 * because the image/voice documents expire too — capture has to happen inside
 * the 24h window or not at all.
 *
 * Runs on the A side only; the caller (useArchive) enforces that.
 */

const FIRST_CAPTURED = 'firstCapturedAt';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** A cheap fingerprint of the mutable parts, so unchanged messages aren't rewritten. */
function signature(record: ArchivedMessage): string {
  return JSON.stringify([
    record.text,
    record.editedAt,
    record.originalText,
    record.mediaId,
    record.mediaMissing,
    record.reactions,
  ]);
}

/**
 * Captures (and updates) a batch of decrypted messages.
 *
 * Returns how many records were newly written or changed — useful for deciding
 * whether the on-disk figures need refreshing.
 */
export async function captureMessages(key: CryptoKey, messages: Message[]): Promise<number> {
  if (messages.length === 0) return 0;

  const existing = new Map((await store.allMessages()).map((m) => [m.id, m]));
  let changed = 0;

  for (const message of messages) {
    const prior = existing.get(message.id);

    // Media is fetched at most once per message. If a prior capture already
    // stored the bytes (or already recorded them as gone), reuse that verdict
    // rather than hammering Firebase for a document that has been swept.
    let mediaId: string | undefined;
    let mediaMissing: boolean | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let mime: string | undefined;
    let durationMs: number | undefined;

    const payload = message.payload;

    if (payload.kind === 'image') {
      mediaId = payload.imageId;
      width = payload.width;
      height = payload.height;
      mime = payload.mime;
      if (prior?.mediaMissing) {
        mediaMissing = true;
        mediaId = undefined;
      } else if (!(await store.hasMedia(payload.imageId))) {
        try {
          const { downloadBytes } = await import('@/services/images');
          const bytes = await downloadBytes(key, payload);
          const media: ArchivedMedia = {
            id: payload.imageId,
            kind: 'image',
            mime: payload.mime,
            bytes: toArrayBuffer(bytes),
            byteSize: bytes.length,
            width: payload.width,
            height: payload.height,
          };
          await store.putMedia(media);
        } catch {
          mediaMissing = true;
          mediaId = undefined;
        }
      }
    } else if (payload.kind === 'audio') {
      mediaId = payload.audioId;
      mime = payload.mime;
      durationMs = payload.durationMs;
      if (prior?.mediaMissing) {
        mediaMissing = true;
        mediaId = undefined;
      } else if (!(await store.hasMedia(payload.audioId))) {
        try {
          const { downloadBytes } = await import('@/services/audio');
          const bytes = await downloadBytes(key, payload);
          const media: ArchivedMedia = {
            id: payload.audioId,
            kind: 'audio',
            mime: payload.mime,
            bytes: toArrayBuffer(bytes),
            byteSize: bytes.length,
          };
          await store.putMedia(media);
        } catch {
          mediaMissing = true;
          mediaId = undefined;
        }
      }
    } else if (payload.kind === 'file') {
      mediaId = payload.fileId;
      mime = payload.mime;
      if (prior?.mediaMissing) {
        mediaMissing = true;
        mediaId = undefined;
      } else if (!(await store.hasMedia(payload.fileId))) {
        try {
          const { downloadBytes } = await import('@/services/files');
          const bytes = await downloadBytes(key, payload);
          const media: ArchivedMedia = {
            id: payload.fileId,
            kind: 'file',
            mime: payload.mime,
            bytes: toArrayBuffer(bytes),
            byteSize: bytes.length,
          };
          await store.putMedia(media);
        } catch {
          mediaMissing = true;
          mediaId = undefined;
        }
      }
    } else if (payload.kind === 'video') {
      mediaId = payload.videoId;
      mime = payload.mime;
      width = payload.width;
      height = payload.height;
      durationMs = payload.durationMs;
      if (prior?.mediaMissing) {
        mediaMissing = true;
        mediaId = undefined;
      } else if (!(await store.hasMedia(payload.videoId))) {
        try {
          const { downloadBytes } = await import('@/services/video');
          const bytes = await downloadBytes(key, payload);
          const media: ArchivedMedia = {
            id: payload.videoId,
            kind: 'video',
            mime: payload.mime,
            bytes: toArrayBuffer(bytes),
            byteSize: bytes.length,
            width: payload.width,
            height: payload.height,
          };
          await store.putMedia(media);
        } catch {
          mediaMissing = true;
          mediaId = undefined;
        }
      }
    }

    const record: ArchivedMessage = {
      id: message.id,
      sender: message.sender,
      createdAt: message.createdAt,
      kind: payload.kind,
      archivedAt: prior?.archivedAt ?? Date.now(),
      ...(message.editedAt !== undefined ? { editedAt: message.editedAt } : {}),
      ...(message.originalText !== undefined ? { originalText: message.originalText } : {}),
      ...(payload.kind === 'text' ? { text: payload.text } : {}),
      ...(mediaId !== undefined ? { mediaId } : {}),
      ...(mediaMissing ? { mediaMissing: true } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(mime !== undefined ? { mime } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(payload.kind === 'file' ? { fileName: payload.name } : {}),
      ...(payload.kind === 'call'
        ? {
            callKind: payload.callKind,
            outcome: payload.outcome,
            ...(payload.durationMs !== undefined ? { callDurationMs: payload.durationMs } : {}),
          }
        : {}),
      ...(hasReactions(message.reactions) ? { reactions: cleanReactions(message.reactions) } : {}),
      ...(payload.replyTo
        ? {
            replyTo: {
              sender: payload.replyTo.sender,
              kind: payload.replyTo.kind,
              preview: payload.replyTo.preview,
            },
          }
        : {}),
    };

    if (!prior || signature(prior) !== signature(record)) {
      await store.putMessage(record);
      changed += 1;
    }
  }

  if ((await store.getMeta(FIRST_CAPTURED)) === undefined) {
    await store.setMeta(FIRST_CAPTURED, Date.now());
  }

  return changed;
}

function hasReactions(reactions: Message['reactions']): boolean {
  return (reactions.a?.length ?? 0) > 0 || (reactions.b?.length ?? 0) > 0;
}

function cleanReactions(reactions: Message['reactions']): { a?: string[]; b?: string[] } {
  const out: { a?: string[]; b?: string[] } = {};
  if (reactions.a && reactions.a.length > 0) out.a = [...reactions.a];
  if (reactions.b && reactions.b.length > 0) out.b = [...reactions.b];
  return out;
}

/**
 * Snapshots every custom emoji into the archive.
 *
 * Deduped by id, so this is cheap after the first run. Snapshotting rather than
 * relying on the live pack matters: an emoji can be deleted later, and the
 * memory should still render the `:shortcode:` it was used with at the time.
 */
export async function captureEmoji(key: CryptoKey): Promise<void> {
  const { loadAll } = await import('@/services/emojis');
  const pack = await loadAll(key);
  for (const emoji of pack) {
    if (await store.hasEmoji(emoji.id)) continue;
    const record: ArchivedEmoji = {
      id: emoji.id,
      name: emoji.name,
      mime: emoji.mime,
      bytes: toArrayBuffer(emoji.bytes),
      width: emoji.width,
      height: emoji.height,
    };
    await store.putEmoji(record);
  }
}

export interface ArchiveStats {
  readonly messageCount: number;
  readonly totalBytes: number;
  readonly firstCapturedAt: number | null;
}

export async function stats(): Promise<ArchiveStats> {
  const [messageCount, totalBytes, first] = await Promise.all([
    store.messageCount(),
    store.totalBytes(),
    store.getMeta<number>(FIRST_CAPTURED),
  ]);
  return { messageCount, totalBytes, firstCapturedAt: first ?? null };
}

export interface ArchiveSnapshot {
  readonly messages: ArchivedMessage[];
  readonly media: Map<string, ArchivedMedia>;
  readonly emoji: Map<string, ArchivedEmoji>;
}

/** The whole archive, for building an export. */
export async function readArchive(): Promise<ArchiveSnapshot> {
  const [messages, media, emoji] = await Promise.all([
    store.allMessages(),
    store.allMedia(),
    store.allEmoji(),
  ]);
  messages.sort((left, right) => left.createdAt - right.createdAt);
  return {
    messages,
    media: new Map(media.map((m) => [m.id, m])),
    emoji: new Map(emoji.map((e) => [e.id, e])),
  };
}

export async function clear(): Promise<void> {
  await store.clearAll();
}
