import { MESSAGES } from '@/config';
import { encodeUtf8, decodeUtf8 } from '@/utils/encoding';
import { AppError } from '@/utils/result';

/**
 * Length-hiding padding for text messages.
 *
 * AES-GCM ciphertext is the same length as its plaintext, so without padding
 * the size of a stored document reveals roughly how long the message was.
 * "ok" and "I'm leaving you" are trivially distinguishable to anyone with
 * database access, and a sequence of message lengths is a surprisingly strong
 * fingerprint.
 *
 * Padding to a small set of buckets reduces that to a coarse signal. It does
 * not eliminate it — a 4000-character message is still visibly long — but it
 * collapses the common case, where nearly all messages fall into one or two
 * buckets.
 *
 * Layout: [4-byte big-endian length][utf-8 bytes][zero fill to bucket size]
 */

const HEADER_BYTES = 4;

export function pad(text: string): Uint8Array {
  const bytes = encodeUtf8(text);
  const needed = bytes.length + HEADER_BYTES;

  const bucket = MESSAGES.PADDING_BUCKETS.find((size) => size >= needed);
  if (bucket === undefined) throw new AppError('unknown', 'Message exceeds maximum length');

  const out = new Uint8Array(bucket);
  new DataView(out.buffer).setUint32(0, bytes.length, false);
  out.set(bytes, HEADER_BYTES);
  return out;
}

export function unpad(padded: Uint8Array): string {
  if (padded.length < HEADER_BYTES) throw new AppError('decrypt-failed');

  const length = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(
    0,
    false,
  );
  if (length > padded.length - HEADER_BYTES) throw new AppError('decrypt-failed');

  return decodeUtf8(padded.subarray(HEADER_BYTES, HEADER_BYTES + length));
}
