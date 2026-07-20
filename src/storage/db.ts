/**
 * Minimal IndexedDB wrapper.
 *
 * IndexedDB rather than localStorage: localStorage is synchronous (blocks the
 * main thread), string-only, and small. Nothing sensitive is stored here — the
 * device ID is an opaque random value and the outbox holds already-encrypted
 * envelopes — but the derived key is never persisted anywhere, including here.
 *
 * Hand-rolled rather than pulling in `idb` (~5 KB) for a single object store.
 */

const DB_NAME = 'atlas';
const DB_VERSION = 1;
const STORE = 'kv';

let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB unavailable'));
    };
  });
  return connection;
}

export async function get<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => {
      resolve(request.result as T | undefined);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB read failed'));
    };
  });
}

export async function set(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB write failed'));
    };
  });
}

export async function remove(key: string): Promise<void> {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB delete failed'));
    };
  });
}
