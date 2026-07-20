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

export type MessageKind = 'text' | 'image' | 'audio' | 'call';

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

/** Presence is deliberately coarse: no per-keystroke metadata leaks. */
export interface PresenceDoc {
  /** Anonymous-auth uid of the device that owns this slot. */
  readonly owner: string;
  readonly online: boolean;
  readonly lastSeen: number;
  /** Expires on its own so a crashed tab cannot appear "typing" forever. */
  readonly typingUntil: number;
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
  readonly deviceB: string | null;
  /**
   * Epoch ms until which a new device may take over an occupied slot. Only an
   * already-paired device can open this window, for at most 5 minutes. This is
   * how "replace a paired device" works without rules being able to verify
   * passphrase knowledge.
   */
  readonly repairUntil: number;
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
