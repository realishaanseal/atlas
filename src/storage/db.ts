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

/**
 * `LEGACY_NAMES` lists the names this store has used before. Preferences and
 * the device's pairing id live here — theme, favourite emoji, saved GIFs and
 * their bytes — and losing them silently on an update would unpair the device,
 * so the contents are carried across once and the old database is then removed.
 */
const DB_NAME = 'atlas';
/** Every name this store has previously used, newest first. */
const LEGACY_NAMES = ['mechcodes', 'notewell'] as const;
const DB_VERSION = 1;
const STORE = 'kv';

let connection: Promise<IDBDatabase> | null = null;

function openNamed(name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
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
}

function open(): Promise<IDBDatabase> {
  connection ??= (async () => {
    const db = await openNamed(DB_NAME);
    await migrateLegacy(db);
    return db;
  })();
  return connection;
}

/**
 * One-time copy out of the previously named database.
 *
 * Deliberately conservative. The old database is only deleted once every record
 * has been written into the new one, existing keys are never overwritten (so a
 * second run cannot undo newer values), and any failure at all is swallowed —
 * a preferences store is not worth failing an app launch over, and leaving both
 * databases in place is a recoverable outcome whereas deleting early is not.
 */
async function migrateLegacy(db: IDBDatabase): Promise<void> {
  try {
    // `databases()` is unsupported on Firefox, where this resolves undefined and
    // the migration is simply skipped — the cost is a stale database nobody
    // reads, which is harmless.
    const existing = await indexedDB.databases?.();
    const found = LEGACY_NAMES.find((name) => existing?.some((entry) => entry.name === name));
    if (found === undefined) return;

    const legacy = await openNamed(found);
    if (!legacy.objectStoreNames.contains(STORE)) {
      legacy.close();
      return;
    }

    const entries = await new Promise<{ key: IDBValidKey; value: unknown }[]>(
      (resolve, reject) => {
        const collected: { key: IDBValidKey; value: unknown }[] = [];
        const cursor = legacy.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
        cursor.onsuccess = () => {
          const at = cursor.result;
          if (!at) {
            resolve(collected);
            return;
          }
          collected.push({ key: at.key, value: at.value });
          at.continue();
        };
        cursor.onerror = () => {
          reject(cursor.error ?? new Error('Legacy read failed'));
        };
      },
    );

    if (entries.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        // `add` rather than `put`: never clobber a value already written here.
        for (const entry of entries) store.add(entry.value, entry.key).onerror = (event) => {
          event.preventDefault();
        };
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error('Migration write failed'));
        };
      });
    }

    legacy.close();
    indexedDB.deleteDatabase(found);
  } catch {
    // Both databases survive; the app carries on with defaults at worst.
  }
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
