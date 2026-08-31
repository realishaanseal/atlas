/**
 * Single source of truth for tunable constants.
 *
 * Values that affect security (iteration counts, key lengths, TTLs) live here
 * so an auditor can read the entire security posture in one screen.
 */

/**
 * The name shown anywhere the operating system or the browser can see it: the
 * tab title, desktop notifications, the call screen.
 *
 * It matches the public site rather than the app on purpose. A notification
 * that reads "Atlas" on a lock screen, or a tab title that changes the moment
 * you unlock, undoes the concealment in the one place you cannot control who
 * is looking.
 */
export const APP_NAME = 'MechCodes';

/**
 * Message and media lifetime — also the maximum the Security Rules permit.
 *
 * Raised from 24 hours to 30 days: with light day-to-day use the free-tier
 * quotas (1 GiB stored, 20k writes/day, 50k reads/day) are nowhere near reached
 * even keeping a month of history, and a month is far more useful to look back
 * over than a day. The client sweep and the rules' refusal to serve expired
 * documents are unchanged — this only moves the number.
 *
 * The security trade is real and worth stating: there is no forward secrecy, so
 * anyone who captures ciphertext and later learns the passphrase can now
 * decrypt 30 days of it rather than 1. This must match `retentionMs()` in
 * firestore.rules.
 */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Per-message retention choices.
 *
 * Only ever SHORTER than the 30-day default. The rules cap it there, so a
 * message can be made to vanish sooner but never to linger — the retention
 * guarantee still holds no matter what a client sends.
 *
 * Media documents keep their own expiry: they are addressed by id from inside
 * the encrypted payload, so once the message is gone there is nothing left
 * pointing at them and the ordinary sweep collects them.
 */
export const RETENTION_OPTIONS = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '1 day', ms: 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 days', ms: RETENTION_MS },
] as const;

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
 * Video budget.
 *
 * Videos cannot be re-encoded in the browser the way photos are (there is no
 * cheap canvas transcode for video), so they are stored byte-for-byte like
 * GIFs — chunked across Firestore documents and reassembled on download. That
 * means, also like GIFs, no metadata is stripped: a clip could carry location
 * data. Accepted for a private two-person chat; the alternative is shipping a
 * transcoder, which is disproportionate.
 *
 * The cap is deliberately modest. Every chunk is a write for the sender and a
 * read for the recipient, and the free tier's daily quotas (20k writes / 50k
 * reads) are what set the ceiling — not storage, since clips are swept at 30 days
 * like everything else. A poster frame (first frame, canvas-encoded to WebP) is
 * captured on upload so the bubble shows a still with a play button before the
 * full clip is fetched.
 */
export const VIDEO = {
  /** Reuse the image chunk size — ~800 KB base64, under the 1 MiB doc cap. */
  CHUNK_BYTES: 600 * 1024,
  /** 45 chunks ≈ 27 MB. A short phone clip fits; a long one is refused. */
  MAX_CHUNKS: 45,
  get MAX_BYTES() {
    return this.CHUNK_BYTES * this.MAX_CHUNKS;
  },
  /** What the file picker accepts before any processing. */
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  ACCEPTED_MIME: ['video/mp4', 'video/webm', 'video/quicktime'] as const,
  /**
   * Poster frame, canvas-encoded to WebP, encrypted and carried INLINE in the
   * message body. The body is capped at 16 KB of ciphertext (see firestore.rules
   * `validEnvelope(body, 16384)`), so the poster is deliberately small and is
   * dropped entirely if even the lowest setting won't fit — the play button
   * still works without it. Dimensions are tried largest-first, then a quality
   * ladder, until the encoded frame lands under POSTER_MAX_BYTES.
   */
  POSTER_DIMENSIONS: [240, 160] as const,
  POSTER_QUALITY_STEPS: [0.6, 0.5, 0.4, 0.3] as const,
  /**
   * Plaintext ceiling for the poster. The poster is encrypted, then that
   * envelope sits inside the payload which is encrypted AGAIN into the body, so
   * 6 KB here lands the body around 11 KB of ciphertext — a wide margin under
   * the 16 KB cap even after the double base64 inflation.
   */
  POSTER_MAX_BYTES: 6 * 1024,
} as const;

/**
 * File attachments.
 *
 * Anything that is not a photo, video or voice note — a PDF, a document, a zip.
 * Stored byte-for-byte and chunked exactly like video, because there is nothing
 * to re-encode: a file is opaque and must come out the other side identical.
 *
 * The name and MIME type travel INSIDE the encrypted payload, never as document
 * fields. "contract-final-v3.pdf" is content; a filename list in the clear
 * would describe the conversation as clearly as the messages do.
 */
export const FILES = {
  CHUNK_BYTES: 600 * 1024,
  /** 34 chunks ≈ 20 MB. Bounded by daily write quota, not storage. */
  MAX_CHUNKS: 34,
  get MAX_BYTES() {
    return this.CHUNK_BYTES * this.MAX_CHUNKS;
  },
  /** Longest filename kept; anything past this is truncated for display. */
  MAX_NAME: 120,
} as const;

/**
 * Custom emoji.
 *
 * Uploaded images, referenced in messages by `:shortcode:` and usable as
 * reactions. Stored encrypted in Firestore like everything else, but in the one
 * collection that does NOT expire — a pack that expired would be
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

/**
 * Pinned messages.
 *
 * Stored in a non-expiring collection like custom emoji, because a pin that
 * evaporated with its message would be pointless. The message's
 * displayable content is snapshotted into the pin at pin time, so it survives
 * the original being swept.
 *
 * The count cap is enforced client-side only — the Security Rules cannot count
 * a collection cheaply, the same limitation noted for emoji. The exposure is
 * storage quota, not confidentiality.
 */
export const PINS = {
  MAX_COUNT: 50,
  /** Excerpt length shown in the bar and list. */
  PREVIEW_LENGTH: 140,
  /** Hard cap on stored text, matching the message text ceiling. */
  MAX_TEXT: 4000,
  /**
   * Expiry stamped on a pinned message (and its media) so the retention sweep
   * skips it: ~year 3000, i.e. "never" for any practical purpose.
   *
   * A pinned message is not copied out of the messages collection — it stays in
   * place with its expiry pushed here, so it remains in the timeline, in order,
   * and jumpable. Unpinning restores expiresAt to createdAt + 30 days, at which
   * point the ordinary sweep collects it if it is already past due.
   *
   * This exact value is also hardcoded in firestore.rules; the two must agree.
   */
  KEEP_UNTIL: 32_503_680_000_000,
} as const;

/**
 * Shared doodles drawn over the chat.
 *
 * Anchored to a message and swept on the same schedule, so a doodle lives
 * exactly as long as the messages it was drawn over. Stroke data is capped so a
 * single drawing cannot bloat a document or the write it costs.
 */
export const DOODLE = {
  /** Points are decimated to this spacing (px) before saving — a fine drawing
   *  gathers hundreds of points a second, most of them redundant. */
  MIN_POINT_GAP: 2.5,
  MAX_STROKES: 400,
  /** Base64 ceiling for the encrypted stroke array. */
  MAX_B64: 120_000,
  PALETTE: [
    '#ffffff',
    '#ff5a5a',
    '#ffb020',
    '#ffe14d',
    '#34d399',
    '#4d94ff',
    '#a78bfa',
    '#f472b6',
  ] as const,
} as const;

export const GIF = {
  API_KEY: import.meta.env.VITE_GIPHY_API_KEY ?? '',
  ENDPOINT: 'https://api.giphy.com/v1/gifs',
  /** Per page. Giphy caps this at 50; 30 fills the grid without a long wait. */
  LIMIT: 30,
  /**
   * Size ceiling for a single GIF.
   *
   * GIFs are chunked across documents, so the old 700 KB limit was far stricter
   * than storage required — it was mostly just discarding search results. 2 MB
   * still lands well inside the chunk budget while keeping far more of them.
   */
  MAX_BYTES: 2 * 1024 * 1024,
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

/**
 * Scheduled messages.
 *
 * A scheduled message is written to Firestore immediately with a FUTURE
 * createdAt (= the delivery time). Because it already lives in the cloud, it
 * reaches the other person at that time whether or not the sender is online —
 * no server-side job, which the free tier could not run anyway. The recipient's
 * client simply does not render messages dated in the future until they arrive.
 *
 * Honest limitation: the ciphertext sits in Firestore from the moment it is
 * scheduled, so a recipient who dug into the raw database (they hold the key)
 * could decrypt it early. The app hides it; it is not cryptographically sealed
 * until the delivery time. Fine between two people who trust each other.
 */
export const SCHEDULE = {
  /** Farthest ahead a message may be scheduled — matches the rules' bound. */
  MAX_AHEAD_MS: 7 * 24 * 60 * 60 * 1000,
  /** Soonest, so "schedule" is never just a delayed send by accident. */
  MIN_AHEAD_MS: 60 * 1000,
} as const;

/**
 * Reactions.
 *
 * The cap is PER PERSON, not per message: each participant owns their own key
 * in the reactions map, so a message can carry up to twice this many chips
 * before grouping. It exists only to bound the encrypted list against the
 * envelope ceiling the Security Rules enforce — twenty custom-emoji references
 * encode to roughly 880 base64 characters, comfortably inside the 2048 the
 * rules allow.
 *
 * MAX_PRESET is the quick-react preset size, kept equal so a full preset can be
 * applied to an empty message in one tap without anything being dropped.
 */
export const REACTIONS = {
  MAX_PER_PERSON: 20,
  MAX_PRESET: 20,
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

/**
 * Unlock backoff.
 *
 * Worth being exact about what this defends, because it is easy to credit it
 * with more than it does.
 *
 * It defends against a person typing guesses into this app's own UI — someone
 * who picked up an unlocked laptop and is trying birthdays. Against that it is
 * effective, and the numbers below are deliberately unfriendly.
 *
 * It defends against nothing else. The counter lives in IndexedDB on the device
 * doing the guessing (storage/throttle.ts) and is checked by our own code in
 * services/session.ts. Anyone attacking the database directly never executes
 * that check, and clearing site data resets it. The defence that actually holds
 * against an offline attack is the 2,000,000 PBKDF2 iterations plus a passphrase
 * long enough to make them matter.
 */
export const PASSPHRASE = {
  MIN_LENGTH: 12,
  /** Failed unlock attempts before backoff begins. */
  THROTTLE_AFTER_ATTEMPTS: 3,
  /** Backoff doubles from here: 10s, 20s, 40s, 80s … up to the cap. */
  THROTTLE_BASE_MS: 10_000,
  /**
   * Six hours.
   *
   * Chosen for its effect on a person, not on a program. By the eleventh wrong
   * guess the wait is measured in hours, which ends any attempt to sit and try
   * passwords by hand — and that is the entire threat this setting addresses.
   *
   * It does nothing whatsoever to a real brute-force attempt. See the note above
   * PASSPHRASE: the counter is client-side, so an attacker working against the
   * database never runs the check, and clearing site data resets it. Raising
   * this number feels like hardening and is not; the 2,000,000 KDF iterations
   * are what make guessing expensive, and they apply to everyone equally.
   *
   * The cost lands on you: mistype three times and you are waiting, on your own
   * device, with nobody able to clear it but you. Six hours is the point where
   * that is still recoverable — clear site data and re-enter — while being long
   * enough that nobody idly guesses their way in.
   */
  THROTTLE_MAX_MS: 6 * 60 * 60 * 1000,
} as const;

/**
 * Desktop notifications.
 *
 * The only part of this app that renders outside the page, where the operating
 * system decides who sees it — a locked phone, a mirrored display, a shoulder.
 * Everything shown there is chosen to be consistent with the public site.
 */
export const NOTIFICATIONS = {
  /** Put the message text in the notification body. Off: it is drawn by the OS. */
  SHOW_PREVIEW: false,
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
