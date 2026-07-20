import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

/**
 * Firebase initialisation.
 *
 * The whole SDK sits behind this module and this module is only imported
 * dynamically (after unlock), which keeps ~120 KB of gzipped JavaScript off
 * the lock screen's critical path.
 *
 * The config values below are public by design. Firebase web config is a set
 * of project identifiers, not credentials — access control lives entirely in
 * Security Rules, and confidentiality lives in the client-side AES layer.
 *
 * Note there is no Cloud Storage here. Storage requires the paid Blaze plan,
 * so encrypted images live in Firestore instead — see config.ts and
 * ARCHITECTURE.md §6a for the size budget that makes that work.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export interface FirebaseServices {
  readonly app: FirebaseApp;
  readonly db: Firestore;
  readonly auth: Auth;
}

let services: FirebaseServices | null = null;

/** Fails loudly at startup rather than mysteriously at first write. */
function assertConfigured(): void {
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Firebase is not configured. Missing: ${missing.join(', ')}. ` +
        'Copy .env.example to .env.local and fill it in.',
    );
  }
  if (!import.meta.env.VITE_ROOM_ID) {
    throw new Error('VITE_ROOM_ID is not set.');
  }
}

export function getServices(): FirebaseServices {
  if (services) return services;

  assertConfigured();

  const app = initializeApp(config);

  // persistentLocalCache is what keeps us inside the Spark read quota: a
  // reconnect resumes from the on-disk snapshot and pulls only the delta
  // instead of re-reading the collection.
  //
  // Single-tab manager rather than multi-tab: two tabs of a private
  // conversation is not a use case worth the extra coordination overhead,
  // and single-tab has meaningfully lower write amplification.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
  });

  const auth = getAuth(app);

  if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }

  services = { app, db, auth };
  return services;
}
