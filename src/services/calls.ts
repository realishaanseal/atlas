import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  limit,
  type Unsubscribe,
} from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { CALLS } from '@/config';
import { encryptJson, decryptJson, randomId } from '@/crypto';
import type { CallDoc, CallKind, CallState, ParticipantId } from '@/types';
import { AppError } from '@/utils/result';

/**
 * WebRTC calling, signalled over Firestore.
 *
 * Media never touches a server: WebRTC negotiates a direct path between the
 * two browsers and streams over it. WebRTC also mandates DTLS-SRTP, so the
 * media is encrypted in transit no matter what we do.
 *
 * What this module adds is encrypted SIGNALLING. The SDP offer/answer and
 * every ICE candidate contain IP addresses — public, local, and sometimes
 * mDNS hostnames. Written in the clear, as almost every tutorial does, they
 * would tell Firebase where both people are and precisely when they spoke.
 * Encrypting them under the conversation key reduces what the database learns
 * to "two paired devices exchanged some ciphertext".
 */

/** The peer's own mic/camera state, carried over the data channel. */
export interface PeerMeta {
  readonly muted: boolean;
  readonly cameraOff: boolean;
}

export interface CallSession {
  readonly id: string;
  readonly kind: CallKind;
  readonly pc: RTCPeerConnection;
  readonly localStream: MediaStream;
  /** Tell the peer our current mic/camera state. */
  sendMeta: (meta: PeerMeta) => void;
  close: () => Promise<void>;
}

/**
 * A tiny data channel carrying each side's mic/camera state.
 *
 * WebRTC does not tell the far end that a track was disabled — `track.enabled =
 * false` just sends black frames or silence — so "the other person muted" has
 * to be signalled explicitly. The channel rides the existing peer connection
 * (DTLS-encrypted like the media) and carries only two booleans, so it needs no
 * application-level encryption of its own.
 *
 * The caller creates the channel before the offer so it is negotiated up front;
 * the callee receives it via `ondatachannel`. On open, each side sends its
 * current state so a party who muted before connecting is shown correctly.
 */
function setupMetaChannel(
  pc: RTCPeerConnection,
  isCaller: boolean,
  onPeerMeta: (meta: PeerMeta) => void,
): { send: (meta: PeerMeta) => void } {
  let channel: RTCDataChannel | null = null;
  let latest: PeerMeta = { muted: false, cameraOff: false };

  const wire = (ch: RTCDataChannel) => {
    channel = ch;
    ch.onopen = () => {
      try {
        ch.send(JSON.stringify(latest));
      } catch {
        // A closed channel just means the call is ending.
      }
    };
    ch.onmessage = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as Partial<PeerMeta>;
        onPeerMeta({ muted: Boolean(parsed.muted), cameraOff: Boolean(parsed.cameraOff) });
      } catch {
        // Ignore anything that is not the expected shape.
      }
    };
  };

  if (isCaller) wire(pc.createDataChannel('meta'));
  else pc.ondatachannel = (event) => {
    wire(event.channel);
  };

  return {
    send: (meta: PeerMeta) => {
      latest = meta;
      if (channel && channel.readyState === 'open') {
        try {
          channel.send(JSON.stringify(meta));
        } catch {
          // Dropped state update; the next toggle will resend.
        }
      }
    },
  };
}

function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: [...CALLS.ICE_SERVERS],
    // Trickle ICE: candidates are sent as they are discovered rather than
    // waiting for gathering to finish. Meaningfully faster connect time.
    iceCandidatePoolSize: 4,
  });
}

async function getLocalStream(kind: CallKind): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video:
        kind === 'video'
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
          : false,
    });
  } catch {
    throw new AppError(
      'unknown',
      kind === 'video'
        ? 'Camera or microphone unavailable. Check browser permissions.'
        : 'Microphone unavailable. Check browser permissions.',
    );
  }
}

/** Pushes locally-gathered ICE candidates, encrypted, to our side's subcollection. */
function publishCandidates(
  key: CryptoKey,
  pc: RTCPeerConnection,
  callId: string,
  side: 'caller' | 'callee',
): void {
  const { db } = getServices();
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    void (async () => {
      try {
        const sealed = await encryptJson(key, event.candidate?.toJSON());
        await addDoc(collection(db, paths.callCandidates(callId, side)), { data: sealed });
      } catch {
        // A dropped candidate degrades connectivity but does not break the
        // call — other candidates may still produce a working path.
      }
    })();
  };
}

/** Consumes the peer's encrypted ICE candidates as they arrive. */
function consumeCandidates(
  key: CryptoKey,
  pc: RTCPeerConnection,
  callId: string,
  side: 'caller' | 'callee',
): Unsubscribe {
  const { db } = getServices();
  return onSnapshot(collection(db, paths.callCandidates(callId, side)), (snapshot) => {
    void (async () => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue;
        try {
          const candidate = await decryptJson<RTCIceCandidateInit>(
            key,
            (change.doc.data() as { data: Parameters<typeof decryptJson>[1] }).data,
          );
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Malformed or undecryptable candidate — skip it.
        }
      }
    })();
  });
}

// --- outgoing --------------------------------------------------------------

export async function place(
  key: CryptoKey,
  slot: ParticipantId,
  kind: CallKind,
  onRemoteStream: (stream: MediaStream) => void,
  onStateChange: (state: RTCPeerConnectionState) => void,
  onPeerMeta: (meta: PeerMeta) => void,
): Promise<CallSession> {
  const { db } = getServices();

  const localStream = await getLocalStream(kind);
  const pc = createPeerConnection();
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  // Before the offer, so the channel is part of the initial negotiation.
  const meta = setupMetaChannel(pc, true, onPeerMeta);

  const remoteStream = new MediaStream();
  pc.ontrack = (event) => {
    for (const track of event.streams[0]?.getTracks() ?? []) remoteStream.addTrack(track);
    onRemoteStream(remoteStream);
  };
  pc.onconnectionstatechange = () => {
    onStateChange(pc.connectionState);
  };

  const callId = randomId();
  publishCandidates(key, pc, callId, 'caller');

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const createdAt = Date.now();
  await setDoc(doc(db, paths.call(callId)), {
    caller: slot,
    kind,
    state: 'ringing' satisfies CallState,
    createdAt,
    expiresAt: createdAt + CALLS.RETENTION_MS,
    offer: await encryptJson(key, { type: offer.type, sdp: offer.sdp }),
  });

  // Wait for the answer, then finish the handshake.
  const unsubscribeCall = onSnapshot(doc(db, paths.call(callId)), (snap) => {
    void (async () => {
      const data = snap.data() as CallDoc | undefined;
      if (!data?.answer || pc.currentRemoteDescription) return;
      try {
        const answer = await decryptJson<RTCSessionDescriptionInit>(key, data.answer);
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch {
        // Undecryptable answer means a key mismatch; the call simply fails.
      }
    })();
  });

  const unsubscribeCandidates = consumeCandidates(key, pc, callId, 'callee');

  return {
    id: callId,
    kind,
    pc,
    localStream,
    sendMeta: meta.send,
    close: async () => {
      unsubscribeCall();
      unsubscribeCandidates();
      await teardown(callId, pc, localStream);
    },
  };
}

// --- incoming --------------------------------------------------------------

export async function answer(
  key: CryptoKey,
  callId: string,
  callDoc: CallDoc,
  onRemoteStream: (stream: MediaStream) => void,
  onStateChange: (state: RTCPeerConnectionState) => void,
  onPeerMeta: (meta: PeerMeta) => void,
): Promise<CallSession> {
  const { db } = getServices();

  const localStream = await getLocalStream(callDoc.kind);
  const pc = createPeerConnection();
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  // The caller's channel arrives via ondatachannel; register before applying
  // the offer so it is not missed.
  const meta = setupMetaChannel(pc, false, onPeerMeta);

  const remoteStream = new MediaStream();
  pc.ontrack = (event) => {
    for (const track of event.streams[0]?.getTracks() ?? []) remoteStream.addTrack(track);
    onRemoteStream(remoteStream);
  };
  pc.onconnectionstatechange = () => {
    onStateChange(pc.connectionState);
  };

  publishCandidates(key, pc, callId, 'callee');

  const offer = await decryptJson<RTCSessionDescriptionInit>(key, callDoc.offer);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const localAnswer = await pc.createAnswer();
  await pc.setLocalDescription(localAnswer);

  await updateDoc(doc(db, paths.call(callId)), {
    state: 'accepted' satisfies CallState,
    answer: await encryptJson(key, { type: localAnswer.type, sdp: localAnswer.sdp }),
  });

  const unsubscribeCandidates = consumeCandidates(key, pc, callId, 'caller');

  return {
    id: callId,
    kind: callDoc.kind,
    pc,
    localStream,
    sendMeta: meta.send,
    close: async () => {
      unsubscribeCandidates();
      await teardown(callId, pc, localStream);
    },
  };
}

export async function decline(callId: string): Promise<void> {
  const { db } = getServices();
  await updateDoc(doc(db, paths.call(callId)), { state: 'declined' satisfies CallState });
}

/** Watches for a call addressed to us. */
export function watchIncoming(
  slot: ParticipantId,
  onIncoming: (callId: string, call: CallDoc) => void,
  onEnded: (callId: string) => void,
): Unsubscribe {
  const { db } = getServices();

  const q = query(
    collection(db, paths.calls()),
    where('expiresAt', '>', Date.now()),
    limit(10),
  );

  return onSnapshot(q, (snapshot) => {
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data() as CallDoc;
      if (data.caller === slot) continue; // our own outgoing call

      if (change.type === 'added' && data.state === 'ringing') {
        onIncoming(change.doc.id, data);
      }
      if (
        (change.type === 'modified' && (data.state === 'ended' || data.state === 'declined')) ||
        change.type === 'removed'
      ) {
        onEnded(change.doc.id);
      }
    }
  });
}

/** Watches our own outgoing call for decline/end by the peer. */
export function watchOutgoing(
  callId: string,
  onResolved: (state: CallState) => void,
): Unsubscribe {
  const { db } = getServices();
  return onSnapshot(doc(db, paths.call(callId)), (snap) => {
    const data = snap.data() as CallDoc | undefined;
    if (!data) {
      onResolved('ended');
      return;
    }
    if (data.state !== 'ringing') onResolved(data.state);
  });
}

/**
 * Closes the connection and removes the signalling documents.
 *
 * Deleting matters more here than for messages: the call document holds
 * encrypted ICE candidates, and leaving them lying around is pointless
 * residue. Rules also permit deleting call docs freely, unlike messages.
 */
async function teardown(
  callId: string,
  pc: RTCPeerConnection,
  localStream: MediaStream,
): Promise<void> {
  for (const track of localStream.getTracks()) track.stop();
  pc.onicecandidate = null;
  pc.ontrack = null;
  pc.onconnectionstatechange = null;
  pc.ondatachannel = null;
  pc.close();

  const { db } = getServices();
  try {
    await updateDoc(doc(db, paths.call(callId)), { state: 'ended' satisfies CallState });

    for (const side of ['caller', 'callee'] as const) {
      const candidates = await getDocs(collection(db, paths.callCandidates(callId, side)));
      await Promise.allSettled(candidates.docs.map((snap) => deleteDoc(snap.ref)));
    }
    await deleteDoc(doc(db, paths.call(callId)));
  } catch {
    // Best effort. The document expires within the hour regardless.
  }
}
