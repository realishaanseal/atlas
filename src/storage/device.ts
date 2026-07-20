import { toBase64 } from '@/utils/encoding';
import * as db from './db';

/**
 * Per-browser device identity.
 *
 * A random 256-bit value generated on first run and kept in IndexedDB. It is
 * not a secret and not a credential — Firebase anonymous auth supplies the
 * `uid` that Security Rules actually key on. This exists so the UI can tell
 * "this browser, previously" from "a browser I've never seen", and so a
 * device can be labelled in the pairing UI later.
 *
 * Clearing site data clears this, which unpairs the browser. That is the
 * intended behaviour.
 */

const KEY = 'device-id';

export async function getDeviceId(): Promise<string> {
  const existing = await db.get<string>(KEY);
  if (existing) return existing;

  const id = toBase64(crypto.getRandomValues(new Uint8Array(32)));
  await db.set(KEY, id);
  return id;
}
