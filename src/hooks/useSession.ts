import { useCallback, useRef, useState } from 'react';
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
 * public site's bundle.
 *
 *
 * NOTHING TOUCHES THE NETWORK UNTIL SOMEONE SUBMITS.
 *
 * This used to check on mount whether a passphrase had been established, which
 * meant an anonymous sign-in and a Firestore read fired on every single page
 * load. Visually that changes nothing — but the browser's network panel then
 * shows a page about mobile-game promo codes opening a connection to
 * `identitytoolkit.googleapis.com` and `firestore.googleapis.com` before anyone
 * has done anything, and that is not something an ordinary static site does.
 * Anyone who thinks to press F12 would have found it in about four seconds, and
 * it is the one tell that no amount of care over strings and chunk names could
 * cover up.
 *
 * So the session starts `idle` and stays there. A visit costs the site's own
 * assets and nothing else: no requests, no anonymous account, no IndexedDB. The
 * first contact with Firebase happens on a submission that has already passed
 * the length-and-whitespace filter in the comment box, which for an ordinary
 * comment is never.
 *
 * The cost is that we no longer know up front whether the workspace has a
 * passphrase yet. That turns out not to matter: the public entry point only
 * ever attempts an unlock, and establishing a passphrase happens on a separate
 * route that asks for the check explicitly.
 */

export type SessionStatus =
  | 'idle' // nothing contacted yet, and nothing will be until a submission
  | 'checking' // resolving setup vs unlock, only ever on the setup route
  | 'setup' // no passphrase established yet
  | 'locked' // an attempt was made and refused
  | 'working' // deriving key
  | 'unlocked'
  | 'unpaired' // both device slots already taken
  | 'error';

/**
 * Why the last attempt failed, as a code rather than a sentence.
 *
 * This hook is imported eagerly — it is what decides whether to show the public
 * site or the conversation, so it cannot be lazy — and every string literal in
 * it therefore ships to every visitor and is readable in the built bundle.
 * "Incorrect password." sitting in the JavaScript of a page about promo codes
 * is precisely the kind of thing this app's front door exists to avoid. The
 * error codes it switches on are named for the same reason.
 *
 * So the wording lives in the screens instead, each of which is lazily loaded
 * and each of which describes the same failure in the register its own audience
 * expects: a comment that would not post on the public site, a wrong passphrase
 * on the setup screen.
 */
export type SessionReason =
  | { readonly kind: 'bad-code' }
  | { readonly kind: 'rate-limited'; readonly seconds: number }
  | { readonly kind: 'network' }
  | { readonly kind: 'unknown' };

interface SessionState {
  readonly status: SessionStatus;
  readonly slot: ParticipantId | null;
  readonly uid: string | null;
  readonly reason: SessionReason | null;
}

const IDLE: SessionState = { status: 'idle', slot: null, uid: null, reason: null };

export function useSession() {
  const [state, setState] = useState<SessionState>(IDLE);
  const keyRef = useRef<CryptoKey | null>(null);

  /**
   * Asks whether a passphrase has been established. Costs a sign-in and a read,
   * so it is called only from the setup route — never on an ordinary visit.
   */
  const detect = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'checking', reason: null }));
    try {
      const { detectPhase } = await import('@/services/session');
      const phase = await detectPhase();
      setState({ status: phase === 'setup' ? 'setup' : 'locked', slot: null, uid: null, reason: null });
    } catch {
      setState({ status: 'error', slot: null, uid: null, reason: { kind: 'network' } });
    }
  }, []);

  const submit = useCallback(
    // Named neutrally rather than `passphrase`. Minification renames locals
    // anyway, but the sweep in scripts/check-bundle.mjs reads the source too,
    // and a rule nobody can keep green stops being read.
    async (input: string) => {
      // Establishing a passphrase is only ever reachable from the setup route,
      // which is the only thing that can put us in `setup`. From anywhere else —
      // including `idle`, where we have not asked and do not intend to — this is
      // an unlock attempt and nothing more. That is deliberate: the comment box
      // is public, and if it could establish a passphrase then the first visitor
      // to an unclaimed workspace would own it.
      const isSetup = state.status === 'setup';
      setState((prev) => ({ ...prev, status: 'working', reason: null }));

      try {
        const [session, auth] = await Promise.all([
          import('@/services/session'),
          import('@/services/auth'),
        ]);
        const result = isSetup ? await session.setup(input) : await session.unlock(input);

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

  return { ...state, submit, detect, lock, keyRef };
}

function toReason(error: unknown): SessionReason {
  if (!(error instanceof AppError)) return { kind: 'unknown' };

  switch (error.code) {
    case 'bad-key':
      return { kind: 'bad-code' };
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
