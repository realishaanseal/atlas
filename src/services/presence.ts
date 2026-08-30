import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getServices } from '@/firebase/app';
import { paths } from '@/firebase/paths';
import { PRESENCE } from '@/config';
import type { ParticipantId, PresenceDoc } from '@/types';

/**
 * Presence: online, last seen, typing.
 *
 * Firestore has no `onDisconnect()` primitive (that is a Realtime Database
 * feature), so presence is heartbeat-plus-staleness rather than
 * server-detected. A client writes lastSeen every 45s; the peer treats
 * anything older than 90s as offline.
 *
 * The typing indicator writes `typingUntil = now + 5s` rather than separate
 * start and stop events. This is strictly better than the naive approach: a
 * crashed tab, a killed process, or a dropped connection can never leave the
 * indicator stuck on, because it expires on its own. It also halves the
 * writes.
 *
 * Cost: roughly 2 writes/minute/user for heartbeats, and typing is debounced
 * to at most one write per 2.5s. Well inside the Spark daily write budget.
 */

export interface PeerPresence {
  readonly online: boolean;
  readonly lastSeen: number;
  readonly typing: boolean;
}

export const OFFLINE: PeerPresence = { online: false, lastSeen: 0, typing: false };

function interpret(data: PresenceDoc | undefined, now: number): PeerPresence {
  if (!data) return OFFLINE;

  return {
    online: data.online && now - data.lastSeen < PRESENCE.OFFLINE_AFTER_MS,
    lastSeen: data.lastSeen,
    typing: data.typingUntil > now,
  };
}

export function watchPeer(
  peer: ParticipantId,
  onUpdate: (presence: PeerPresence) => void,
): Unsubscribe {
  const { db } = getServices();

  let latest: PresenceDoc | undefined;

  const unsubscribe = onSnapshot(doc(db, paths.presence(peer)), (snap) => {
    latest = snap.exists() ? (snap.data() as PresenceDoc) : undefined;
    onUpdate(interpret(latest, Date.now()));
  });

  // The peer going stale is the absence of a write, so no snapshot will fire.
  // Re-evaluate on a timer or they would appear online forever.
  const timer = setInterval(() => {
    onUpdate(interpret(latest, Date.now()));
  }, 15_000);

  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}

export class PresenceWriter {
  private typingUntil = 0;
  private lastTypingWrite = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly slot: ParticipantId;
  private readonly uid: string;

  constructor(slot: ParticipantId, uid: string) {
    this.slot = slot;
    this.uid = uid;
  }

  start(): void {
    void this.write(true);
    this.heartbeat = setInterval(() => {
      void this.write(true);
    }, PRESENCE.HEARTBEAT_MS);
  }

  /** Debounced. A fast typist produces ~1 write/2.5s, not one per keystroke. */
  noteTyping(): void {
    const now = Date.now();
    this.typingUntil = now + PRESENCE.TYPING_TTL_MS;
    if (now - this.lastTypingWrite < PRESENCE.TYPING_WRITE_INTERVAL_MS) return;
    this.lastTypingWrite = now;
    void this.write(true);
  }

  clearTyping(): void {
    this.typingUntil = 0;
    void this.write(true);
  }

  async stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.typingUntil = 0;
    await this.write(false);
  }

  private async write(online: boolean): Promise<void> {
    const { db } = getServices();
    try {
      await setDoc(doc(db, paths.presence(this.slot)), {
        owner: this.uid,
        online,
        lastSeen: Date.now(),
        typingUntil: this.typingUntil,
      } satisfies PresenceDoc);
    } catch (error) {
      // Presence is best-effort: a failed heartbeat must never surface to the
      // user or interrupt messaging.
      //
      // But swallowing it entirely once hid a real bug for a day — a rules
      // mismatch meant every write was rejected, and the only symptom was
      // "last seen" quietly freezing. Surfacing it in development costs
      // nothing and makes the next occurrence obvious.
      if (import.meta.env.DEV) console.warn('presence write rejected', error);
    }
  }
}
