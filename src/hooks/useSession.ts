import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParticipantId } from '@/types';
import { AppError } from '@/utils/result';

/**
 * Session state machine.
 *
 * The derived CryptoKey is held in a ref, not in React state. Two reasons:
 * it must never end up in a snapshot, devtools serialisation, or error
 * boundary payload, and it is not a value the UI ever renders — only its
 * presence matters, which `status` already expresses.
 *
 * Firebase and the crypto layer are imported dynamically, so neither is in the
 * lock screen's bundle. The screen paints before ~120 KB of SDK is parsed.
 */

export type SessionStatus =
  | 'checking' // determining setup vs unlock
  | 'setup' // no passphrase established yet
  | 'locked' // awaiting passphrase
  | 'working' // deriving key
  | 'unlocked'
  | 'unpaired' // both device slots already taken
  | 'error';

/**
 * Why the last attempt failed, as a code rather than a sentence. The wording
 * lives in the lock screen, which is the only thing that renders it.
 */
export type SessionReason =
  | { readonly kind: 'bad-passphrase' }
  | { readonly kind: 'rate-limited'; readonly seconds: number }
  | { readonly kind: 'network' }
  | { readonly kind: 'unknown' };

interface SessionState {
  readonly status: SessionStatus;
  readonly slot: ParticipantId | null;
  readonly uid: string | null;
  readonly reason: SessionReason | null;
}

export function useSession() {
  const [state, setState] = useState<SessionState>({
    status: 'checking',
    slot: null,
    uid: null,
    reason: null,
  });

  const keyRef = useRef<CryptoKey | null>(null);

  // Whether a passphrase has been established decides which form the lock
  // screen shows, so it is asked once, up front.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { detectPhase } = await import('@/services/session');
        const phase = await detectPhase();
        if (cancelled) return;
        setState({
          status: phase === 'setup' ? 'setup' : 'locked',
          slot: null,
          uid: null,
          reason: null,
        });
      } catch {
        if (cancelled) return;
        setState({ status: 'error', slot: null, uid: null, reason: { kind: 'network' } });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(
    async (passphrase: string) => {
      const isSetup = state.status === 'setup';
      setState((prev) => ({ ...prev, status: 'working', reason: null }));

      try {
        const [session, auth] = await Promise.all([
          import('@/services/session'),
          import('@/services/auth'),
        ]);
        const result = isSetup ? await session.setup(passphrase) : await session.unlock(passphrase);

        keyRef.current = result.key;
        setState({
          status: 'unlocked',
          slot: result.slot,
          uid: auth.currentUid(),
          reason: null,
        });
      } catch (error) {
        if (error instanceof AppError && error.code === 'device-not-paired') {
          setState({ status: 'unpaired', slot: null, uid: null, reason: null });
          return;
        }

        setState({
          status: isSetup ? 'setup' : 'locked',
          slot: null,
          uid: null,
          reason: toReason(error),
        });
      }
    },
    [state.status],
  );

  const lock = useCallback(() => {
    keyRef.current = null;
    setState({ status: 'locked', slot: null, uid: null, reason: null });
  }, []);

  return { ...state, submit, lock, keyRef };
}

function toReason(error: unknown): SessionReason {
  if (!(error instanceof AppError)) return { kind: 'unknown' };

  switch (error.code) {
    case 'bad-key':
      return { kind: 'bad-passphrase' };
    case 'rate-limited': {
      // The message is the remaining seconds, put there by services/session.
      const seconds = Number.parseInt(error.message, 10);
      return { kind: 'rate-limited', seconds: Number.isFinite(seconds) ? seconds : 0 };
    }
    case 'network':
    case 'permission-denied':
      return { kind: 'network' };
    default:
      return { kind: 'unknown' };
  }
}
