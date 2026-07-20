import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { getServices } from '@/firebase/app';

/**
 * Anonymous authentication.
 *
 * This is NOT a login and the user never sees it. Its only purpose is to give
 * Security Rules a stable `uid` so a device can occupy one of the room's two
 * slots. The passphrase is the actual gate, and it never leaves the browser.
 *
 * The uid persists in IndexedDB across reloads, so a paired browser stays
 * paired until it is explicitly unpaired or its site data is cleared.
 */

let pending: Promise<User> | null = null;

export function ensureSignedIn(): Promise<User> {
  if (pending) return pending;

  const { auth } = getServices();

  pending = new Promise<User>((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user);
          return;
        }
        signInAnonymously(auth).catch((error: unknown) => {
          unsubscribe();
          reject(error instanceof Error ? error : new Error('Sign-in failed'));
        });
      },
      (error) => {
        unsubscribe();
        reject(error);
      },
    );
  });

  return pending;
}

export function currentUid(): string | null {
  return getServices().auth.currentUser?.uid ?? null;
}
