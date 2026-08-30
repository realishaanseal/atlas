/**
 * A tiny Result type.
 *
 * Crypto and network calls fail in ways the UI must handle explicitly. Using
 * a Result forces the caller to acknowledge the failure branch, and — more
 * importantly for this app — lets us return an opaque failure without ever
 * surfacing an exception message that might leak internal state to the user
 * or to an error reporter.
 */

export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type AppErrorCode =
  | 'bad-key'
  /** Unlock backoff. The message carries the remaining seconds as a string. */
  | 'rate-limited'
  | 'decrypt-failed'
  | 'device-not-paired'
  | 'pairing-full'
  | 'network'
  | 'permission-denied'
  | 'file-too-large'
  | 'unsupported-file'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
  }
}
