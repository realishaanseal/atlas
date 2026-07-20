/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_ROOM_ID: string;
  readonly VITE_USE_EMULATORS?: string;
  /** Optional. Without it the GIF button is hidden rather than broken. */
  readonly VITE_GIPHY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
