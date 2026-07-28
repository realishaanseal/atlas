import { useCallback, useEffect, useRef, useState } from 'react';
import { CALLS } from '@/config';
import type { CallDoc, CallKind, CallOutcome, MessagePayload, ParticipantId } from '@/types';
import { AppError } from '@/utils/result';

export type CallPhase =
  | 'idle'
  | 'calling' // outgoing, waiting for an answer
  | 'incoming' // being called
  | 'connecting' // answered, negotiating
  | 'active'
  | 'failed';

interface IncomingCall {
  readonly id: string;
  readonly doc: CallDoc;
}

/**
 * Call state machine.
 *
 * Streams live in STATE, not refs — and that distinction caused a real bug
 * worth remembering.
 *
 * They were originally refs, on the reasoning that a MediaStream is a live
 * object whose identity does not change as tracks are added. True, but it
 * misses the transition that matters: null → stream. That IS an identity
 * change, and nothing re-renders to pick it up.
 *
 * The result was a race. `ontrack` and the connectionstatechange to
 * 'connected' fire in either order. Whoever got `ontrack` first saw remote
 * video, because the subsequent setPhase re-rendered and read the ref;
 * whoever got 'connected' first saw nothing, because the ref was populated
 * after the last render. Caller worked, callee did not, from identical code.
 */
export function useCall(
  key: CryptoKey,
  slot: ParticipantId,
  onLog: (payload: Extract<MessagePayload, { kind: 'call' }>) => void,
) {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [kind, setKind] = useState<CallKind>('audio');
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  // The peer's own mic/camera state, received over the call's data channel.
  const [peerMuted, setPeerMuted] = useState(false);
  const [peerCameraOff, setPeerCameraOff] = useState(false);

  // Local state mirrored in refs so a toggle can report the pair to the peer
  // without either callback depending on the other's latest value.
  const mutedRef = useRef(false);
  const cameraOffRef = useRef(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const sessionRef = useRef<Awaited<ReturnType<typeof import('@/services/calls').place>> | null>(
    null,
  );
  // Mirror of localStream for the mute/camera toggles, which need the current
  // value inside callbacks without re-creating them on every stream change.
  const localStreamRef = useRef<MediaStream | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchOutgoingRef = useRef<(() => void) | null>(null);

  /**
   * Call-log bookkeeping.
   *
   * Only the CALLER writes the log entry, and only once. Both sides know the
   * outcome, so letting both write would produce duplicate entries — and the
   * caller is the one who knows whether it was answered, declined, or rang
   * out, which is exactly the information the entry carries.
   */
  const outgoingRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const loggedRef = useRef(false);
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  const writeLog = useCallback((outcome: CallOutcome) => {
    if (!outgoingRef.current || loggedRef.current) return;
    loggedRef.current = true;

    const connectedAt = connectedAtRef.current;
    onLogRef.current({
      kind: 'call',
      callKind: kindRef.current,
      outcome,
      ...(outcome === 'completed' && connectedAt !== null
        ? { durationMs: Date.now() - connectedAt }
        : {}),
    });
  }, []);

  const kindRef = useRef<CallKind>('audio');

  const reset = useCallback(() => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    if (dropTimerRef.current) clearTimeout(dropTimerRef.current);
    ringTimerRef.current = null;
    dropTimerRef.current = null;
    watchOutgoingRef.current?.();
    watchOutgoingRef.current = null;
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    sessionRef.current = null;
    outgoingRef.current = false;
    connectedAtRef.current = null;
    loggedRef.current = false;
    mutedRef.current = false;
    cameraOffRef.current = false;
    setPhase('idle');
    setIncoming(null);
    setMuted(false);
    setCameraOff(false);
    setPeerMuted(false);
    setPeerCameraOff(false);
  }, []);

  const hangUp = useCallback(() => {
    void (async () => {
      // Connected at any point means it happened; otherwise it rang out.
      writeLog(connectedAtRef.current !== null ? 'completed' : 'missed');
      await sessionRef.current?.close();
      reset();
    })();
  }, [reset, writeLog]);

  const onConnectionState = useCallback(
    (state: RTCPeerConnectionState) => {
      if (state === 'connected') {
        connectedAtRef.current ??= Date.now();

        // Cancel the ring timeout. Without this it fires 45 seconds into a
        // perfectly good call, logs it as missed, and hangs up on both people
        // — the caller sees the call end, the other side freezes on the last
        // frame because its peer vanished mid-stream.
        if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
        ringTimerRef.current = null;

        // A recovered connection cancels any pending drop.
        if (dropTimerRef.current) clearTimeout(dropTimerRef.current);
        dropTimerRef.current = null;

        setError(null);
        setPhase('active');
      }

      if (state === 'failed') {
        // Almost always a NAT traversal failure. Say so plainly rather than
        // showing a generic error — without TURN this is expected sometimes.
        setError('Could not establish a direct connection. Try again, or use a voice note.');
        setPhase('failed');
      }

      if (state === 'closed') hangUp();

      if (state === 'disconnected') {
        // 'disconnected' is frequently transient — a wifi hiccup, a network
        // change — and WebRTC often recovers on its own within seconds.
        // Hanging up immediately turns a two-second blip into a dropped call,
        // so give it a grace period and only end things if it does not come
        // back.
        dropTimerRef.current ??= setTimeout(() => {
          dropTimerRef.current = null;
          hangUp();
        }, CALLS.RECONNECT_GRACE_MS);
      }
    },
    [hangUp],
  );

  // Listen for incoming calls.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const calls = await import('@/services/calls');
      unsubscribe = calls.watchIncoming(
        slot,
        (id, callDoc) => {
          // Ignore a second call while already busy.
          if (sessionRef.current) return;
          setIncoming({ id, doc: callDoc });
          setKind(callDoc.kind);
          setPhase('incoming');
        },
        () => {
          if (!sessionRef.current) reset();
        },
      );
    })();

    return () => {
      unsubscribe?.();
    };
  }, [slot, reset]);

  const start = useCallback(
    async (callKind: CallKind) => {
      setError(null);
      setKind(callKind);
      kindRef.current = callKind;
      outgoingRef.current = true;
      loggedRef.current = false;
      connectedAtRef.current = null;
      setPhase('calling');

      try {
        const calls = await import('@/services/calls');
        const session = await calls.place(
          key,
          slot,
          callKind,
          (stream) => {
            setRemoteStream(stream);
          },
          onConnectionState,
          (meta) => {
            setPeerMuted(meta.muted);
            setPeerCameraOff(meta.cameraOff);
          },
        );
        sessionRef.current = session;
        localStreamRef.current = session.localStream;
        setLocalStream(session.localStream);

        watchOutgoingRef.current = calls.watchOutgoing(session.id, (state) => {
          if (state === 'declined') {
            setError('Call declined.');
            writeLog('declined');
            hangUp();
          }
          if (state === 'ended') hangUp();
        });

        ringTimerRef.current = setTimeout(() => {
          setError('No answer.');
          writeLog('missed');
          hangUp();
        }, CALLS.RING_TIMEOUT_MS);
      } catch (caught) {
        setError(caught instanceof AppError ? caught.message : 'Could not start the call.');
        setPhase('failed');
      }
    },
    [key, slot, onConnectionState, hangUp, writeLog],
  );

  const accept = useCallback(async () => {
    if (!incoming) return;
    // Answering an incoming call: the caller owns the log entry, not us.
    outgoingRef.current = false;
    kindRef.current = incoming.doc.kind;
    setPhase('connecting');

    try {
      const calls = await import('@/services/calls');
      const session = await calls.answer(
        key,
        incoming.id,
        incoming.doc,
        (stream) => {
          setRemoteStream(stream);
        },
        onConnectionState,
        (meta) => {
          setPeerMuted(meta.muted);
          setPeerCameraOff(meta.cameraOff);
        },
      );
      sessionRef.current = session;
      localStreamRef.current = session.localStream;
      setLocalStream(session.localStream);
      setIncoming(null);
    } catch (caught) {
      setError(caught instanceof AppError ? caught.message : 'Could not answer the call.');
      setPhase('failed');
    }
  }, [incoming, key, onConnectionState]);

  const declineCall = useCallback(() => {
    if (!incoming) return;
    void (async () => {
      const calls = await import('@/services/calls');
      await calls.decline(incoming.id);
      reset();
    })();
  }, [incoming, reset]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !mutedRef.current;
    for (const track of stream.getAudioTracks()) track.enabled = !next;
    mutedRef.current = next;
    setMuted(next);
    sessionRef.current?.sendMeta({ muted: next, cameraOff: cameraOffRef.current });
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOffRef.current;
    for (const track of stream.getVideoTracks()) track.enabled = !next;
    cameraOffRef.current = next;
    setCameraOff(next);
    sessionRef.current?.sendMeta({ muted: mutedRef.current, cameraOff: next });
  }, []);

  // Front/back camera switching, offered only when the device actually has more
  // than one camera — on a laptop with a single webcam the button would do
  // nothing, so it is hidden rather than dead.
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const facingRef = useRef<'user' | 'environment'>('user');

  useEffect(() => {
    if (kind !== 'video' || localStream === null) {
      setCanSwitchCamera(false);
      return;
    }
    // Device kinds are only populated once camera permission is granted, which
    // by now it is — the call is already running.
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => {
        setCanSwitchCamera(devices.filter((d) => d.kind === 'videoinput').length > 1);
      })
      .catch(() => {
        setCanSwitchCamera(false);
      });
  }, [kind, localStream]);

  const switchCamera = useCallback(() => {
    void (async () => {
      const session = sessionRef.current;
      const stream = localStreamRef.current;
      if (!session || !stream) return;

      const next = facingRef.current === 'user' ? 'environment' : 'user';
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: next },
          audio: false,
        });
        const track = fresh.getVideoTracks()[0];
        if (!track) return;

        // Preserve the current on/off state through the swap.
        track.enabled = !cameraOff;

        // replaceTrack swaps the outgoing camera without renegotiating — same
        // track kind, so no new offer/answer is needed and the call is not
        // disturbed.
        const sender = session.pc.getSenders().find((s) => s.track?.kind === 'video');
        await sender?.replaceTrack(track);

        // Swap the track into the existing local stream so the self-view
        // updates; the <video> is bound to this same MediaStream object.
        for (const old of stream.getVideoTracks()) {
          stream.removeTrack(old);
          old.stop();
        }
        stream.addTrack(track);
        facingRef.current = next;
      } catch {
        // Permission denied or the facing mode is unavailable — leave the
        // current camera as it was.
      }
    })();
  }, [cameraOff]);

  // Clean up if the component unmounts mid-call.
  useEffect(() => {
    return () => {
      void sessionRef.current?.close();
    };
  }, []);

  return {
    phase,
    kind,
    error,
    muted,
    cameraOff,
    peerMuted,
    peerCameraOff,
    localStream,
    remoteStream,
    start,
    accept,
    decline: declineCall,
    hangUp,
    toggleMute,
    toggleCamera,
    switchCamera,
    canSwitchCamera,
    dismissError: () => {
      setError(null);
      if (phase === 'failed') reset();
    },
  };
}
