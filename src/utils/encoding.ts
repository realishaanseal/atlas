import type { B64 } from '@/types';

/**
 * Base64url codec.
 *
 * We use base64url (RFC 4648 §5) rather than standard base64 because the
 * output ends up in Firestore document fields and Storage object paths, where
 * `+` and `/` are awkward. No padding is emitted.
 */

export function toBase64(bytes: Uint8Array): B64 {
  let binary = '';
  // Chunked to avoid blowing the argument limit on large image buffers.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') as B64;
}

export function fromBase64(value: B64 | string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encodeUtf8 = (text: string): Uint8Array => encoder.encode(text);
export const decodeUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes);
