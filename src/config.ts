/**
 * Single source of truth for tunable constants.
 *
 * Values that affect security (iteration counts, key lengths, TTLs) live here
 * so an auditor can read the entire security posture in one screen.
 */

export const APP_NAME = 'Atlas';

/** Message and image lifetime. */
export const RETENTION_MS = 24 * 60 * 60 * 1000;

export const CRYPTO = {
  /** AES-GCM standard nonce length. Do not change. */
  IV_BYTES: 12,
  KEY_BITS: 256,
  SALT_BYTES: 16,
  /**
   * PBKDF2-SHA256 iterations.
   *
   * OWASP's floor is 600,000. Measured cost of 900,000 on a modern desktop CPU
   * was 84ms — far cheaper than the ~800ms originally assumed, because OpenSSL's
   * SHA-256 is heavily optimised. Since each iteration costs an attacker exactly
   * what it costs us, and derivation happens once per unlock in a worker, there
   * is no reason to be conservative here.
   *
   * 2,000,000 measures ~190ms on desktop and ~1.2s on a mid-range phone. That
   * is the upper bound of acceptable for a screen seen a few times a day.
   *
   * This value is written into the room's kdf document at setup and read back
   * on every unlock, so changing it affects new workspaces only — existing ones
   * keep deriving with whatever they were created with. No migration needed.
   */
  PBKDF2_ITERATIONS: 2_000_000,
  /** Known plaintext used for the key verifier. Not secret. */
  VERIFIER_PLAINTEXT: 'atlas.v1.verifier',
} as const;

/**
 * Image budget.
 *
 * Cloud Storage requires the paid Blaze plan, so encrypted images live in
 * Firestore documents instead. Firestore caps a document at 1 MiB (1,048,576
 * bytes) including field names and overhead, and base64 inflates binary by
 * ~4/3. Working backwards:
 *
 *   1,048,576 byte cap
 *   → leave ~48 KB headroom for field names, timestamps, and overhead
 *   → 1,000,000 base64 chars available
 *   → 1,000,000 × 3/4 ≈ 750,000 bytes of ciphertext
 *   → minus the 16-byte GCM tag and 12-byte IV: ~749,000 bytes of image
 *
 * We target 600 KB to keep a comfortable margin, which at WebP quality 0.82
 * and a 1600px bound covers essentially any photo.
 */
export const IMAGES = {
  /** What the file picker accepts. Anything larger is rejected outright. */
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
  /** What we compress down to before encrypting. Hard ceiling. */
  MAX_ENCODED_BYTES: 600 * 1024,
  /** Absolute cap on the base64 payload written to Firestore. */
  MAX_B64_LENGTH: 1_000_000,
  MAX_DIMENSION: 1600,
  /** Quality ladder, tried in order until the result fits the budget. */
  QUALITY_STEPS: [0.82, 0.72, 0.62, 0.5, 0.4] as const,
  ACCEPTED_MIME: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const,
  /**
   * Every image is re-encoded through a canvas regardless of size. This is
   * deliberate and load-bearing: canvas re-encoding is what strips EXIF, and
   * phone photos carry GPS coordinates in EXIF. Skipping compression for small
   * files would leak location data.
   */
  ALWAYS_REENCODE: true,
  /** Inline blur placeholder, encrypted and carried in the message body. */
  PREVIEW_DIMENSION: 16,
} as const;

/**
 * GIF search.
 *
 * Privacy shape, stated plainly because this is the only third party the app
 * ever contacts: the SENDER's search query goes to Giphy. Nothing else does.
 * The chosen GIF is downloaded here, encrypted, and stored in Firestore like
 * any other image — so the recipient never contacts Giphy, and Giphy never
 * learns that a conversation happened, who was in it, or when.
 *
 * Giphy's 'downsized' rendition is requested rather than the original: it is
 * typically 100–400 KB, which fits the Firestore document budget, while full
 * `gif` regularly exceeds 2 MB.
 *
 * GIFs deliberately skip the canvas re-encode that images go through. Drawing
 * an animated GIF to a canvas yields a single still frame — the animation is
 * the whole point. The cost is that a GIF is stored byte-for-byte as received,
 * so no metadata scrubbing happens. Giphy results carry none; a GIF from
 * elsewhere might.
 */
/**
 * GIFs are stored byte-for-byte, split across documents when they exceed one.
 *
 * The format is from 1987 and has no interframe compression — every frame is
 * a separate palettised image — so a few seconds of animation is routinely
 * several megabytes. Re-encoding to video would shrink it tenfold, but then it
 * is not a GIF any more, and a GIF you can save and re-send should stay one.
 *
 * So: chunk it. Each chunk is independently encrypted and lives in its own
 * document, reassembled on download.
 */
export const GIF_STORAGE = {
  /** Plaintext bytes per chunk. Base64 inflates this to ~800 KB, under 1 MiB. */
  CHUNK_BYTES: 600 * 1024,
  /** 12 chunks. Beyond this the write count starts to matter. */
  MAX_CHUNKS: 12,
  get MAX_BYTES() {
    return this.CHUNK_BYTES * this.MAX_CHUNKS;
  },
} as const;

/**
 * Custom emoji.
 *
 * Uploaded images, referenced in messages by `:shortcode:` and usable as
 * reactions. Stored encrypted in Firestore like everything else, but in the one
 * collection that does NOT expire — a pack swept every 24 hours would be
 * useless.
 *
 * Static images are re-encoded to WebP through a canvas, which strips EXIF the
 * same way photos are handled. Animated GIFs skip that, for the same reason
 * GIFs elsewhere do: a canvas gives you one still frame.
 *
 * Cost is negligible. A 128px WebP emoji is 10–30 KB; a hundred of them is
 * around 2 MB against a 1 GiB free quota. The pack is read once per unlock and
 * cached in memory after that.
 */
export const EMOJI = {
  /** Rendered at ~22px inline, so 128 covers retina with room to spare. */
  MAX_DIMENSION: 128,
  /** Plaintext ceiling per emoji, before base64. */
  MAX_ENCODED_BYTES: 256 * 1024,
  /** What the file picker accepts before any processing. */
  MAX_UPLOAD_BYTES: 4 * 1024 * 1024,
  /**
   * Client-side cap. The Security Rules cannot count a collection cheaply, so
   * this is not enforced server-side — see the note in firestore.rules.
   */
  MAX_COUNT: 100,
  QUALITY_STEPS: [0.9, 0.82, 0.72, 0.6] as const,
  ACCEPTED_MIME: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
  /**
   * Shortcode grammar, enforced on upload AND re-checked on decrypt.
   *
   * The second check is the one that matters: a name arrives from the peer, and
   * "decrypted" means it genuinely came from whoever holds the key, not that it
   * is well-formed. Restricting to lowercase, digits and underscore keeps a
   * name from containing a colon (which would break parsing) or anything that
   * could be mistaken for markup.
   */
  NAME_PATTERN: /^[a-z0-9_]{2,32}$/,
  /** Inline render size. Jumbo applies when a message is emoji-only. */
  INLINE_PX: 22,
  JUMBO_PX: 44,
  /** Above this many, an emoji-only message stops rendering jumbo. */
  JUMBO_MAX_COUNT: 6,
} as const;

export const GIF = {
  API_KEY: import.meta.env.VITE_GIPHY_API_KEY ?? '',
  ENDPOINT: 'https://api.giphy.com/v1/gifs',
  LIMIT: 24,
  MAX_BYTES: 700 * 1024,
  /** Giphy's downsized rendition — usually 100–500 KB, versus multi-MB originals. */
  RENDITION: 'downsized',
  PREVIEW_RENDITION: 'fixed_width_small',
  RATING: 'pg-13',
} as const;

export const gifSearchEnabled = (): boolean => GIF.API_KEY.length > 0;

/**
 * Voice message budget.
 *
 * Same 1 MiB Firestore document ceiling as images. Opus at 24 kbps is the
 * sweet spot for speech — below that it gets watery, above it buys nothing for
 * a human voice. 250 seconds would fit; the cap is 120 to leave real headroom
 * and because a two-minute voice note is already long.
 *
 * Peaks are sampled during recording and stored with the message so the
 * waveform can render before the audio downloads. 48 bars is enough to look
 * like a waveform and costs ~100 bytes.
 */
export const AUDIO = {
  BITS_PER_SECOND: 24_000,
  MAX_DURATION_MS: 120_000,
  MAX_ENCODED_BYTES: 600 * 1024,
  PEAK_COUNT: 48,
  /** Preferred first; the browser picks the first it can actually record. */
  MIME_CANDIDATES: [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=opus',
    'audio/mp4',
  ] as const,
} as const;

export const MESSAGES = {
  MAX_TEXT_LENGTH: 4000,
  /** How many recent messages to hydrate on unlock. */
  PAGE_SIZE: 50,
  /**
   * Text is padded to one of these byte lengths before encryption, so
   * ciphertext size reveals only a coarse bucket rather than the exact message
   * length. Costs a few hundred bytes per message; removes a real metadata
   * leak from anyone who can see the database.
   */
  PADDING_BUCKETS: [256, 512, 1024, 2048, 4096] as const,
} as const;

/**
 * Voice and video calling.
 *
 * Media is peer-to-peer: WebRTC connects the two browsers directly and the
 * audio/video never passes through any server. WebRTC also mandates
 * DTLS-SRTP, so the media stream is encrypted regardless of anything we do.
 *
 * What we add on top: the SIGNALLING is encrypted too. SDP offers and ICE
 * candidates contain your public and local IP addresses, and every WebRTC
 * tutorial writes them to the database in plaintext — which would tell
 * Firebase both parties' IPs and exactly when they spoke. Since a shared key
 * already exists, those payloads are AES-encrypted like everything else.
 *
 * STUN only, no TURN. STUN servers merely tell a browser its own public
 * address; they carry no media and are free. TURN relays media when a direct
 * path cannot be established, and there is no free unlimited TURN — so
 * roughly 10–20% of connections will fail, more on carrier-grade NAT (common
 * on mobile data). That failure is surfaced honestly rather than hidden.
 */
export const CALLS = {
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ] as RTCIceServer[],
  /**
   * Stop ringing after this. A call doc left ringing forever is worse than a
   * missed call.
   *
   * This timer MUST be cancelled once the call connects — see useCall. Left
   * running, it ends a live call at the 45-second mark.
   */
  RING_TIMEOUT_MS: 45_000,

  /**
   * How long to tolerate a 'disconnected' peer connection before ending the
   * call. WebRTC reports 'disconnected' for ordinary network hiccups and
   * usually recovers by itself, so dropping immediately turns a brief blip
   * into a lost call.
   */
  RECONNECT_GRACE_MS: 8_000,
  /** Call documents are short-lived; stale signalling state is useless. */
  RETENTION_MS: 60 * 60 * 1000,
} as const;

export const SECURITY = {
  /**
   * Lock the conversation after this long without user activity.
   *
   * Guards against one thing only: an unlocked session left open where someone
   * else can reach it. Useless against an attacker with the passphrase or with
   * database access — but that is not what it is for.
   *
   * 15 minutes is a compromise. Shorter is more secure and rapidly becomes
   * infuriating; set to 0 to disable entirely.
   */
  IDLE_LOCK_MS: 15 * 60 * 1000,
} as const;

export const PASSPHRASE = {
  MIN_LENGTH: 12,
  /** Failed unlock attempts before backoff begins. */
  THROTTLE_AFTER_ATTEMPTS: 5,
  /** Backoff doubles from here, capped below. */
  THROTTLE_BASE_MS: 2_000,
  THROTTLE_MAX_MS: 60_000,
} as const;

export const PRESENCE = {
  /** Typing indicator auto-expires; no explicit "stopped typing" write needed. */
  TYPING_TTL_MS: 5_000,
  /** Debounce so a fast typist produces ~1 write/sec, not 1 per keystroke. */
  TYPING_WRITE_INTERVAL_MS: 2_500,
  HEARTBEAT_MS: 45_000,
  OFFLINE_AFTER_MS: 90_000,
} as const;

/**
 * How often a connected client sweeps expired documents.
 *
 * Not load-bearing — Firestore's native TTL policy is the server-side
 * guarantee. This exists for promptness and to keep the collection small.
 */
export const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export const ROOM_ID = import.meta.env.VITE_ROOM_ID;
