/**
 * The local chat archive — a memory that outlives Firebase's 24h sweep.
 *
 * Everything the app shows is decrypted on this device before it is rendered.
 * This store captures that decrypted view into IndexedDB so it survives after
 * the encrypted originals are swept from Firebase. It is deliberately a SEPARATE
 * database from `atlas` (storage/db.ts): a different lifecycle, a different size
 * class (media blobs, not opaque keys), and a schema that will evolve on its own
 * version track.
 *
 * Stored in the clear, by explicit choice — the point is a readable keepsake you
 * can open forever, not another encrypted vault. It only ever runs on the A
 * side; the capture caller gates that.
 *
 * Four object stores:
 *   messages — one decrypted record per message, keyed by message id
 *   media    — image / GIF / voice bytes, keyed by the media document id, so a
 *              photo shared in ten replies is stored once
 *   emoji    — a snapshot of every custom emoji referenced, so `:shortcodes:`
 *              still render even after the emoji is later deleted
 *   meta     — running counters (size, first-captured date) and settings
 */

const DB_NAME = 'atlas-archive';
const DB_VERSION = 1;

const STORES = ['messages', 'media', 'emoji', 'meta'] as const;
type StoreName = (typeof STORES)[number];

export interface ArchivedMessage {
  readonly id: string;
  readonly sender: 'a' | 'b';
  readonly createdAt: number;
  readonly kind: 'text' | 'image' | 'audio' | 'call' | 'video';
  readonly editedAt?: number;
  readonly originalText?: string;
  /** Text messages. Stored with its stored `<@slot>` mention tokens intact. */
  readonly text?: string;
  /** Image / audio: key into the `media` store. Absent if the media was gone. */
  readonly mediaId?: string;
  readonly mediaMissing?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly mime?: string;
  readonly durationMs?: number;
  /** Call log entries. */
  readonly callKind?: 'audio' | 'video';
  readonly outcome?: 'completed' | 'missed' | 'declined';
  readonly callDurationMs?: number;
  /** Decrypted reactions, keyed by slot: Unicode emoji or `custom:<id>`. */
  readonly reactions?: { a?: string[]; b?: string[] };
  /** Snapshot of the quoted message, if this was a reply. */
  readonly replyTo?: {
    readonly sender: 'a' | 'b';
    readonly kind: 'text' | 'image' | 'audio' | 'call' | 'video';
    readonly preview: string;
  };
  /** When this device first captured it. */
  readonly archivedAt: number;
}

export interface ArchivedMedia {
  readonly id: string;
  readonly kind: 'image' | 'audio' | 'video';
  readonly mime: string;
  readonly bytes: ArrayBuffer;
  readonly byteSize: number;
  readonly width?: number;
  readonly height?: number;
}

export interface ArchivedEmoji {
  readonly id: string;
  readonly name: string;
  readonly mime: 'image/webp' | 'image/gif';
  readonly bytes: ArrayBuffer;
  readonly width: number;
  readonly height: number;
}

export interface ArchiveMeta {
  readonly key: string;
  readonly value: number | string | boolean;
}

let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('messages')) db.createObjectStore('messages', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('emoji')) db.createObjectStore('emoji', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('archive DB unavailable'));
    };
  });
  return connection;
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('archive request failed'));
    };
  });
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await open();
  return req(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>);
}

async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await open();
  return req(db.transaction(store, 'readonly').objectStore(store).get(key) as IDBRequest<T | undefined>);
}

async function count(store: StoreName): Promise<number> {
  const db = await open();
  return req(db.transaction(store, 'readonly').objectStore(store).count());
}

async function put(store: StoreName, value: unknown): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error('archive write failed'));
    };
  });
}

// --- messages --------------------------------------------------------------

export async function putMessage(message: ArchivedMessage): Promise<void> {
  await put('messages', message);
}

export function allMessages(): Promise<ArchivedMessage[]> {
  return getAll<ArchivedMessage>('messages');
}

export function messageCount(): Promise<number> {
  return count('messages');
}

// --- media -----------------------------------------------------------------

export async function hasMedia(id: string): Promise<boolean> {
  return (await get('media', id)) !== undefined;
}

export async function putMedia(media: ArchivedMedia): Promise<void> {
  await put('media', media);
}

export function getMedia(id: string): Promise<ArchivedMedia | undefined> {
  return get<ArchivedMedia>('media', id);
}

export function allMedia(): Promise<ArchivedMedia[]> {
  return getAll<ArchivedMedia>('media');
}

// --- emoji -----------------------------------------------------------------

export async function hasEmoji(id: string): Promise<boolean> {
  return (await get('emoji', id)) !== undefined;
}

export async function putEmoji(emoji: ArchivedEmoji): Promise<void> {
  await put('emoji', emoji);
}

export function allEmoji(): Promise<ArchivedEmoji[]> {
  return getAll<ArchivedEmoji>('emoji');
}

// --- meta ------------------------------------------------------------------

export async function getMeta<T extends number | string | boolean>(
  key: string,
): Promise<T | undefined> {
  const row = await get<ArchiveMeta>('meta', key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: number | string | boolean): Promise<void> {
  await put('meta', { key, value });
}

// --- maintenance -----------------------------------------------------------

/** Total bytes held across media and emoji, for the storage read-out. */
export async function totalBytes(): Promise<number> {
  const [media, emoji] = await Promise.all([allMedia(), allEmoji()]);
  const sum = (n: number, size: number) => n + size;
  return (
    media.reduce((n, m) => sum(n, m.byteSize), 0) +
    emoji.reduce((n, e) => sum(n, e.bytes.byteLength), 0)
  );
}

export async function clearAll(): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORES as unknown as string[], 'readwrite');
  for (const store of STORES) tx.objectStore(store).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error('archive clear failed'));
    };
  });
}
