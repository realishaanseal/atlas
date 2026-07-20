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
 * Firebase and the crypto layer are imported dynamically so that neither is in
 * the lock screen's bundle. The screen paints before ~120 KB of SDK is parsed.
 */

export type SessionStatus =
  | 'checking' // determining setup vs unlock
  | 'setup' // no passphrase established yet
  | 'locked' // awaiting passphrase
  | 'working' // deriving key
  | 'unlocked'
  | 'unpaired' // both device slots already taken
  | 'error';

interface SessionState {
  readonly status: SessionStatus;
  readonly slot: ParticipantId | null;
  readonly uid: string | null;
  readonly message: string | null;
}

export function useSession() {
  const [state, setState] = useState<SessionState>({
    status: 'checking',
    slot: null,
    uid: null,
    message: null,
  });

  const keyRef = useRef<CryptoKey | null>(null);

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
          message: null,
        });
      } catch {
        if (cancelled) return;
        setState({
          status: 'error',
          slot: null,
          uid: null,
          message: 'Could not reach the workspace. Check your connection.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(
    async (passphrase: string) => {
      const isSetup = state.status === 'setup';
      setState((prev) => ({ ...prev, status: 'working', message: null }));

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
          message: null,
        });
      } catch (error) {
        if (error instanceof AppError && error.code === 'device-not-paired') {
          setState({ status: 'unpaired', slot: null, uid: null, message: null });
          return;
        }

        const message =
          error instanceof AppError && error.code === 'bad-passphrase'
            ? 'Incorrect password.'
            : error instanceof AppError && error.message !== error.code
              ? error.message
              : 'Something went wrong. Try again.';

        setState({ status: isSetup ? 'setup' : 'locked', slot: null, uid: null, message });
      }
    },
    [state.status],
  );

  const lock = useCallback(() => {
    keyRef.current = null;
    setState({ status: 'locked', slot: null, uid: null, message: null });
  }, []);

  return { ...state, submit, lock, keyRef };
}
