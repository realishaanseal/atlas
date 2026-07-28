/**
 * Domain models.
 *
 * Two shapes exist for most concepts: the `*Doc` type is what Firestore
 * stores (encrypted, server-safe) and the plain type is what the UI renders
 * (decrypted, memory-only). Keeping them separate makes it structurally hard
 * to write plaintext to the database by accident.
 */

import type { B64, EncryptedEnvelope } from './crypto';

export type ParticipantId = 'a' | 'b';

export type MessageKind = 'text' | 'image' | 'audio' | 'call' | 'video';

export type CallOutcome = 'completed' | 'missed' | 'declined';

/** Delivery lifecycle, tracked locally and mirrored to the peer. */
export type DeliveryState = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

/**
 * A quoted reference to the message being replied to.
 *
 * The preview text is captured at send time and stored inside the encrypted
 * payload, rather than looked up when rendering. Two reasons: the quote still
 * renders after the original message has expired and been swept, and the
 * reply needs no extra read to display.
 */
export interface ReplyRef {
  readonly id: string;
  readonly sender: ParticipantId;
  readonly kind: MessageKind;
  /** Short excerpt, or a label like "Photo" for non-text messages. */
  readonly preview: string;
}

/** Decrypted plaintext payload. Exists only in memory, never serialized. */
export type MessagePayload = (
  | { kind: 'text'; text: string }
  | {
      kind: 'image';
      /** Document id in rooms/{roomId}/images holding the encrypted bytes. */
      imageId: string;
      /**
       * Per-image content key, wrapped under the conversation key. Costs
       * nothing now and means per-image revocation or expiring access can be
       * added later without re-architecting.
       */
      wrappedKey: EncryptedEnvelope;
      width: number;
      height: number;
      byteSize: number;
      /**
       * 'image/webp' for photos, which are re-encoded to strip EXIF.
       * 'image/gif' for GIFs, which are stored as-is so animation survives.
       */
      mime: 'image/webp' | 'image/gif';
      /** 16px blur placeholder, inlined so the bubble can paint immediately. */
      preview?: EncryptedEnvelope;
      /**
       * Number of documents this image is split across.
       *
       * Absent or 1 means a single document at images/{imageId}. Anything
       * larger means the bytes live at images/{imageId}-c0 … -c{n-1}, because
       * a Firestore document caps at 1 MiB and a real GIF routinely exceeds
       * it. Each chunk is encrypted independently with its own IV.
       */
      chunks?: number;
    }
  | {
      kind: 'video';
      /** Document id in rooms/{roomId}/videos holding the encrypted bytes. */
      videoId: string;
      /** Per-clip content key, wrapped under the conversation key. */
      wrappedKey: EncryptedEnvelope;
      width: number;
      height: number;
      byteSize: number;
      durationMs: number;
      /** Constrained to a safe video allowlist on playback, never trusted raw. */
      mime: string;
      /** First frame, canvas-encoded to WebP and encrypted — the bubble poster. */
      poster?: EncryptedEnvelope;
      /** Documents this clip is split across; absent or 1 means a single doc. */
      chunks?: number;
    }
  | {
      kind: 'audio';
      /** Document id in rooms/{roomId}/audio holding the encrypted bytes. */
      audioId: string;
      wrappedKey: EncryptedEnvelope;
      durationMs: number;
      byteSize: number;
      mime: string;
      /**
       * Amplitude peaks, 0–100, sampled while recording. Stored so the
       * waveform renders instantly rather than after decrypting and decoding
       * the whole clip.
       */
      peaks: number[];
    }
  | {
      /**
       * A call log entry, written by the caller once the call resolves.
       *
       * Encrypted like everything else. "They had a 12-minute video call at
       * 11pm" is exactly the kind of metadata the rest of the app refuses to
       * hand over, so it would be odd to store it in the clear.
       */
      kind: 'call';
      callKind: CallKind;
      outcome: CallOutcome;
      /** Present only for completed calls. */
      durationMs?: number;
    }
) & { replyTo?: ReplyRef };

/** What Firestore actually holds. Nothing here reveals content. */
export interface MessageDoc {
  readonly id: string;
  readonly sender: ParticipantId;
  /** Server-assigned; used for ordering and never trusted from the client. */
  readonly createdAt: number;
  /** Absolute epoch ms after which this doc is invalid and swept. */
  readonly expiresAt: number;
  /** The entire payload, including its kind, encrypted as one blob. */
  readonly body: EncryptedEnvelope;
  /** Read receipt. Set by the recipient only; rules enforce that. */
  readonly readAt?: number;
  /** When the sender last edited the text. Absent means never edited. */
  readonly editedAt?: number;
  /**
   * The body as it was BEFORE the first edit, encrypted.
   *
   * Snapshotted once, on the first edit, and immutable after — so the edit
   * history shows the true original however many times the message is later
   * changed. Only the sender can write it, and only their own message.
   */
  readonly originalBody?: EncryptedEnvelope;
  /**
   * One reaction per participant, keyed by slot, each encrypted.
   *
   * Encrypted rather than a plain emoji string because a reaction is content:
   * "she reacted 😭 to that message" is exactly the kind of thing the rest of
   * the app refuses to leak. Rules let each participant write only their own
   * key, which is what keeps it from becoming a general write channel into
   * someone else's message.
   */
  readonly reactions?: Partial<Record<ParticipantId, EncryptedEnvelope>>;
}

/** A message as the UI sees it. */
export interface Message {
  readonly id: string;
  readonly sender: ParticipantId;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly payload: MessagePayload;
  readonly state: DeliveryState;
  readonly readAt?: number;
  /** When the message was last edited; drives the "edited" label. */
  readonly editedAt?: number;
  /** The original text, decrypted, shown when the edit history is opened. */
  readonly originalText?: string;
  /**
   * Decrypted reactions, keyed by slot.
   *
   * A list per person rather than a single emoji, so both participants can
   * react with the same one and the UI can group them with a count — and so
   * one person can leave several reactions, as Discord allows.
   */
  readonly reactions: Partial<Record<ParticipantId, string[]>>;
}

/**
 * A custom emoji as Firestore holds it.
 *
 * Note the absence of `expiresAt`. This is the only collection in the app
 * exempt from the 24-hour sweep, because a pack that expired would defeat the
 * purpose. The name is encrypted alongside the bytes — a plaintext list of
 * shortcodes would be a readable index of the pair's private jokes.
 */
export interface CustomEmojiDoc {
  readonly owner: string;
  readonly createdAt: number;
  /** Encrypted shortcode, without the surrounding colons. */
  readonly name: EncryptedEnvelope;
  readonly mime: 'image/webp' | 'image/gif';
  readonly width: number;
  readonly height: number;
  readonly data: EncryptedEnvelope;
}

/** A custom emoji as the UI sees it: decrypted, with a live object URL. */
export interface CustomEmoji {
  readonly id: string;
  /** Shortcode without colons, e.g. `party_parrot`. */
  readonly name: string;
  readonly mime: 'image/webp' | 'image/gif';
  readonly width: number;
  readonly height: number;
  /** Object URL, owned and revoked by the emoji store. */
  readonly url: string;
  readonly createdAt: number;
  readonly byteSize: number;
}

/**
 * How a custom emoji is referenced in a reaction.
 *
 * Reactions are stored as an encrypted array of strings, and the Security Rules
 * validate the envelope rather than its contents — so carrying a custom emoji
 * needed no rules change and no migration. A reaction is either a literal
 * Unicode emoji or this prefix followed by a document id.
 */
export const CUSTOM_REACTION_PREFIX = 'custom:';

/**
 * A pinned message as Firestore holds it.
 *
 * Like custom emoji, this collection does NOT expire — a pin that vanished
 * with the message would defeat the point of pinning. And because the original
 * message IS swept after 24 hours, the pin cannot just reference it: the
 * displayable content is snapshotted INTO the pin (encrypted) at pin time, the
 * same trick `ReplyRef` uses so a quote outlives its original.
 *
 * The document id is the message id, which makes pinning idempotent (re-pinning
 * writes the same id) and unpinning a plain delete.
 */
export interface PinDoc {
  readonly owner: string;
  /** When it was pinned; the rules bound this for clock-skew, nothing more. */
  readonly pinnedAt: number;
  /** Encrypted snapshot — see PinSnapshot. */
  readonly snapshot: EncryptedEnvelope;
}

/**
 * The nickname one participant gave the other, published so the OTHER can see
 * what they are called.
 *
 * `usePeerName` keeps each person's label for their peer purely on-device; this
 * document is the deliberate, one-directional exception. It lives at
 * `nicknames/{slot}`, where `slot` is the SETTER's slot — so `nicknames/b`
 * holds B's label for A, and only A reads it. The name is encrypted, like every
 * other piece of content, so no plaintext label ever touches the database. No
 * expiry: a nickname that evaporated every 24h would be pointless, same as
 * emoji and pins.
 */
export interface NicknameDoc {
  /** Encrypted nickname string (the setter's label for the other person). */
  readonly name: EncryptedEnvelope;
  /** Clock-skew bound only. */
  readonly updatedAt: number;
}

/**
 * Points at the media documents a pinned message depends on.
 *
 * Carried in the snapshot so unpinning knows which image/audio documents to
 * restore to normal expiry — the panel can unpin a message that is not on
 * screen, so the payload is not otherwise available at that moment.
 */
export interface PinMediaRef {
  readonly kind: 'image' | 'audio' | 'video';
  readonly id: string;
  /** Image chunk count, when the image is split across documents. */
  readonly chunks?: number;
}

/** The decrypted snapshot carried inside a PinDoc. */
export interface PinSnapshot {
  readonly sender: ParticipantId;
  readonly kind: MessageKind;
  /** Original send time, for display and ordering. */
  readonly createdAt: number;
  /** Full text for text messages, so the pin stays readable after the sweep. */
  readonly text?: string;
  /** Short label for the bar: an excerpt, or "Photo" / "Voice message". */
  readonly preview: string;
  /** Present for image and audio messages; drives media expiry restore. */
  readonly media?: PinMediaRef;
}

/** A pin as the UI sees it: decrypted, with the message id it points at. */
export interface Pin extends PinSnapshot {
  /** Equal to the original message id — used to jump to it while it survives. */
  readonly messageId: string;
  readonly pinnedAt: number;
}

/**
 * A shared doodle drawn over the conversation.
 *
 * Anchored to a message: its strokes are positioned relative to that message,
 * so the drawing rides along as the chat scrolls and expires when the message
 * does (24h). Synced and encrypted like everything else — a drawing is content.
 *
 * X coordinates are a fraction of the chat width (0–1), because the two devices
 * have different widths; Y is pixels below the anchor, since line height is the
 * same on both.
 */
export interface DoodleStroke {
  readonly tool: 'pen' | 'brush';
  readonly color: string;
  readonly width: number;
  /** Flat [x0, y0, x1, y1, …]; x is a 0–1 fraction of width, y is px. */
  readonly pts: number[];
}

export interface DoodleDoc {
  readonly owner: string;
  /** The message this doodle is positioned against. */
  readonly anchorId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  /** Encrypted array of DoodleStroke. */
  readonly data: EncryptedEnvelope;
}

export interface Doodle {
  readonly id: string;
  readonly anchorId: string;
  readonly createdAt: number;
  readonly strokes: DoodleStroke[];
}

/** Presence is deliberately coarse: no per-keystroke metadata leaks. */
export interface PresenceDoc {
  /** Anonymous-auth uid of the device that owns this slot. */
  readonly owner: string;
  readonly online: boolean;
  readonly lastSeen: number;
  /** Expires on its own so a crashed tab cannot appear "typing" forever. */
  readonly typingUntil: number;
  /**
   * A manually chosen "last seen" time, displayed to the peer INSTEAD of the
   * real `lastSeen`.
   *
   * `lastSeen` itself cannot be faked: the Security Rules pin it to within a
   * minute of the server clock, deliberately, so the staleness logic that drives
   * the online indicator stays trustworthy. This is a separate, presentation-only
   * field — the peer's client shows it when present, and everything else
   * (heartbeats, staleness, delivery) keeps using the real value.
   *
   * Absent means "no override", which is the normal state.
   */
  readonly lastSeenOverride?: number;
}

/**
 * Singleton room document.
 *
 * The two device slots live here as fields rather than as a `devices`
 * collection. That makes the two-device cap structural — there is no third
 * field to write — and lets Security Rules check pairing with one cached
 * get() instead of counting a collection, which rules cannot do cheaply.
 */
export interface RoomDoc {
  readonly schemaVersion: 1;
  readonly createdAt: number;
  /** Anonymous-auth uid, or null if the slot is free. */
  readonly deviceA: string | null;
  /**
   * A SECOND device on the A side, so one person can be signed in on two
   * devices (e.g. a laptop and a phone) at once. The B side stays single.
   * Optional — rooms created before this existed simply do not have the field,
   * which the rules tolerate.
   */
  readonly deviceA2?: string | null;
  readonly deviceB: string | null;
  /**
   * Epoch ms until which a new device may take over an occupied slot. Only an
   * already-paired device can open this window, for at most 5 minutes. This is
   * how "replace a paired device" works without rules being able to verify
   * passphrase knowledge.
   */
  readonly repairUntil: number;
  /**
   * When set, the next device to join during the window fills the empty second
   * A slot rather than taking over B — how "add another of my own devices"
   * routes the newcomer to the right side.
   */
  readonly linkTarget?: 'a' | null;
}

/** Public KDF parameters plus the key verifier. Written once, never updated. */
export interface KdfDoc {
  readonly v: 1;
  readonly algorithm: 'PBKDF2';
  readonly hash: 'SHA-256';
  readonly iterations: number;
  readonly salt: B64;
  readonly verifier: EncryptedEnvelope;
  readonly createdAt: number;
}

export type ConnectionState = 'connecting' | 'online' | 'offline' | 'reconnecting';

export type CallKind = 'audio' | 'video';

export type CallState = 'ringing' | 'accepted' | 'declined' | 'ended';

/**
 * Call signalling document.
 *
 * `offer` and `answer` are encrypted envelopes, not raw SDP. SDP contains
 * both parties' IP addresses; encrypting it means the database learns that a
 * call happened between two paired devices, and nothing about where either of
 * them is.
 */
export interface CallDoc {
  readonly caller: ParticipantId;
  readonly kind: CallKind;
  readonly state: CallState;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly offer: EncryptedEnvelope;
  readonly answer?: EncryptedEnvelope;
}
