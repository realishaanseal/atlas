import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { DOODLE, RETENTION_MS } from '@/config';
import { encrypt, decrypt, randomId } from '@/crypto';
import { encodeUtf8, decodeUtf8 } from '@/utils/encoding';
import type { Doodle, DoodleDoc, DoodleStroke } from '@/types';
import { AppError } from '@/utils/result';

/**
 * Shared doodles, synced and encrypted.
 *
 * A doodle is stored against a message (`anchorId`) and expires on the same 24h
 * clock, so it lasts exactly as long as what it was drawn over. The strokes are
 * JSON, encrypted like any other content — nobody but the two devices learns
 * that a drawing happened, let alone its shape.
 */

function sanitiseStrokes(value: unknown): DoodleStroke[] {
  if (!Array.isArray(value)) return [];
  const out: DoodleStroke[] = [];
  for (const raw of value.slice(0, DOODLE.MAX_STROKES)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const s = raw as Record<string, unknown>;
    const tool = s['tool'] === 'brush' ? 'brush' : 'pen';
    const color = typeof s['color'] === 'string' ? s['color'].slice(0, 32) : '#ffffff';
    const width = typeof s['width'] === 'number' ? s['width'] : 6;
    const pts = Array.isArray(s['pts'])
      ? s['pts'].filter((n): n is number => typeof n === 'number').slice(0, 4000)
      : [];
    if (pts.length >= 2) out.push({ tool, color, width, pts });
  }
  return out;
}

export async function save(
  key: CryptoKey,
  anchorId: string,
  strokes: DoodleStroke[],
): Promise<void> {
  const { db, auth } = getServices();
  const sealed = await encrypt(key, encodeUtf8(JSON.stringify(strokes)));

  if (sealed.ct.length > DOODLE.MAX_B64) {
    throw new AppError('file-too-large', 'That doodle is too detailed to send.');
  }

  const id = randomId();
  const createdAt = Date.now();
  const document: DoodleDoc = {
    owner: auth.currentUser?.uid ?? '',
    anchorId,
    createdAt,
    expiresAt: createdAt + RETENTION_MS,
    data: sealed,
  };
  await setDoc(doc(db, paths.doodle(id)), document);
}

export async function erase(id: string): Promise<void> {
  const { db } = getServices();
  await deleteDoc(doc(db, paths.doodle(id)));
}

export function subscribe(key: CryptoKey, onUpdate: (doodles: Doodle[]) => void): () => void {
  const { db } = getServices();

  return onSnapshot(collection(db, paths.doodles()), (snap) => {
    void (async () => {
      const now = Date.now();
      const decrypted = await Promise.all(
        snap.docs.map(async (entry): Promise<Doodle | null> => {
          try {
            const data = entry.data() as DoodleDoc;
            if (data.expiresAt <= now) return null;
            const json = decodeUtf8(await decrypt(key, data.data));
            const strokes = sanitiseStrokes(JSON.parse(json));
            if (strokes.length === 0) return null;
            return { id: entry.id, anchorId: data.anchorId, createdAt: data.createdAt, strokes };
          } catch {
            return null;
          }
        }),
      );
      onUpdate(decrypted.filter((d): d is Doodle => d !== null));
    })();
  });
}
