import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ChevronDown, Clock, ImagePlus, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { springs } from '@/motion/springs';
import { Header } from '@/components/layout/Header';
import { Bubble } from '@/components/chat/Bubble';
import { Composer } from '@/components/chat/Composer';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { ImageViewer } from '@/components/chat/ImageViewer';
import { CameraSheet } from '@/components/chat/CameraSheet';
import { DateSeparator, UnreadSeparator } from '@/components/chat/Separators';
import { buildRenderList } from '@/utils/messageGroups';
import type { GifResult } from '@/services/gifs';
import { AppError } from '@/utils/result';
import { RETENTION_MS } from '@/config';
import { maskSpoilers } from '@/utils/spoiler';
import { encodeMentions, resolveMentionsPlain } from '@/utils/mention';
import { MentionNamesProvider } from '@/hooks/useMentionNames';
import { useMessages } from '@/hooks/useMessages';
import { usePins } from '@/hooks/usePins';
import { usePresence } from '@/hooks/usePresence';
import { usePeerName } from '@/hooks/usePeerName';
import { useNicknameSync } from '@/hooks/useNicknameSync';
import { useArchive } from '@/hooks/useArchive';
import { ArchiveManager } from '@/components/settings/ArchiveManager';
import { useBulkReactions } from '@/hooks/useBulkReactions';
import { BulkReactionsModal } from '@/components/settings/BulkReactionsModal';
import { SearchModal } from '@/components/chat/SearchModal';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useCall } from '@/hooks/useCall';
import { useIdleLock } from '@/hooks/useIdleLock';
import { useBackClose, useBackGuard } from '@/hooks/useBackGuard';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { primeSound, playTing } from '@/utils/sound';
import { CallScreen } from '@/components/call/CallScreen';
import { ScribbleSheet, type ScribbleStroke } from '@/components/chat/ScribbleSheet';
import { DoodleLayer } from '@/components/chat/DoodleLayer';
import { useDoodles } from '@/hooks/useDoodles';
import type { DoodleStroke, Message, ParticipantId, ReplyRef } from '@/types';

/**
 * How many files one Media selection may send.
 *
 * Each photo is several encrypted documents and each video considerably more,
 * so an accidental "select all" in the gallery could burn a meaningful slice of
 * the daily free-tier write budget in one gesture. Ten is generous for sharing
 * a handful of photos and cheap to stay inside.
 */
const MEDIA_BATCH_MAX = 10;

interface ConversationProps {
  cryptoKey: CryptoKey;
  slot: ParticipantId;
  uid: string;
  onLock: () => void;
}

export default function Conversation({ cryptoKey, slot, uid, onLock }: ConversationProps) {
  const {
    messages,
    connection,
    send,
    markVisibleRead,
    react,
    bulkReact,
    edit,
    scheduleMessage,
    cancelScheduled,
  } = useMessages(cryptoKey, slot);
  const bulkReactions = useBulkReactions();

  // A clock used to tell delivered messages from not-yet-due scheduled ones.
  // It ticks on an interval so scheduled messages surface at their time, AND is
  // refreshed the moment the message list changes — otherwise a just-sent normal
  // message is compared against a stale (up to 15s old) clock, reads as "in the
  // future", and is wrongly hidden as if it were scheduled.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 15000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    setNow(Date.now());
  }, [messages]);
  const { pins, pinnedIds, pinnedMessages, togglePin, unpin } = usePins(cryptoKey);
  const { doodles, save: saveDoodle } = useDoodles(cryptoKey);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [scribbleOpen, setScribbleOpen] = useState(false);
  const { peer, noteTyping, clearTyping } = usePresence(slot, uid);
  const peerSlot: ParticipantId = slot === 'a' ? 'b' : 'a';
  const peerName = usePeerName(peerSlot);
  const { theirNameForMe, publishMyNickname } = useNicknameSync(cryptoKey, slot);

  // Renaming updates the on-device label AND (on the B side only, gated inside
  // the hook) publishes it so the other person can see what they are called.
  const handleRename = useCallback(
    (next: string) => {
      peerName.rename(next);
      publishMyNickname(next);
    },
    [peerName, publishMyNickname],
  );

  // Migrate a nickname that was set before this feature existed: publish the
  // current on-device label once, so it appears for the peer without the user
  // having to re-type it. No-op on the A side (the hook declines to publish).
  const nicknameMigrated = useRef(false);
  useEffect(() => {
    if (nicknameMigrated.current) return;
    if (peerName.isCustom) {
      nicknameMigrated.current = true;
      publishMyNickname(peerName.name);
    }
  }, [peerName.isCustom, peerName.name, publishMyNickname]);

  const scroll = useAutoScroll<HTMLDivElement>(messages.length + (peer.typing ? 1 : 0));
  const call = useCall(cryptoKey, slot, (payload) => {
    void send(payload);
  });

  const { settings: notifSettings, update: updateNotif } = useNotificationSettings();

  // Resume the audio context now, while the unlock click is still recent, so a
  // ting can fire later even with the tab backgrounded.
  useEffect(() => {
    primeSound();
  }, []);

  // Never lock mid-call — the definition of "idle" is wrong during a call, and
  // dropping someone's call to show a password box would be indefensible.
  useIdleLock(onLock, call.phase === 'idle');

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [bulkReactOpen, setBulkReactOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Retention for the next message. Resets to the default on reload, so a
   *  short setting cannot be left on by accident for weeks. */
  const [retentionMs, setRetentionMs] = useState<number>(RETENTION_MS);

  /**
   * The Android back gesture. Installed here rather than in App so it exists
   * only while unlocked — backing out of a conversation must never land on the
   * password screen.
   */
  const showExitHint = useBackGuard();

  // Overlays this page owns, innermost-last. Each one is closed by back before
  // the gesture is allowed to mean "leave".
  useBackClose(viewerUrl !== null, () => {
    setViewerUrl(null);
  });
  useBackClose(cameraOpen, () => {
    setCameraOpen(false);
  });
  useBackClose(scribbleOpen, () => {
    setScribbleOpen(false);
  });
  // searchOpen's back handling lives in <Overlay>.
  // archiveOpen + bulkReactOpen back handling lives in <Overlay>.
  useBackClose(replyTo !== null, () => {
    setReplyTo(null);
  });

  /**
   * During a call, back does nothing at all.
   *
   * Registered as a no-op rather than left unhandled: without it, back would
   * count as an exit attempt, and two stray swipes mid-conversation would drop
   * the call. Hanging up is a deliberate act with its own button.
   */
  useBackClose(call.phase !== 'idle', () => {
    // Intentionally empty — the gesture is swallowed.
  });

  /**
   * The timeline is the live window merged with the pinned messages fetched by
   * id, deduplicated. A pin older than the live 50 is no longer in `messages`
   * but its document still exists (expiry pushed out while pinned), so merging
   * it back keeps pinned messages in place, in order, and jumpable.
   */
  const allMessages = useMemo(() => {
    if (pinnedMessages.length === 0) return messages;
    const byId = new Map<string, Message>();
    for (const m of pinnedMessages) byId.set(m.id, m);
    for (const m of messages) byId.set(m.id, m); // live copy wins
    return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
  }, [messages, pinnedMessages]);

  /**
   * Delivered messages only. A scheduled message is dated in the future, so it
   * is kept out of the timeline (for both people) until its time arrives — at
   * which point it slots in as the newest message.
   */
  const deliveredMessages = useMemo(
    () => allMessages.filter((m) => m.createdAt <= now),
    [allMessages, now],
  );

  // The local chat archive. A-side only — inert on any other slot (see the hook).
  const archive = useArchive(cryptoKey, slot, deliveredMessages);

  /** Our own not-yet-delivered scheduled messages, soonest first. */
  const scheduledMessages = useMemo(
    () =>
      messages
        .filter((m) => m.sender === slot && m.createdAt > now)
        .sort((a, b) => a.createdAt - b.createdAt),
    [messages, slot, now],
  );

  const liveIds = useMemo(() => new Set(deliveredMessages.map((m) => m.id)), [deliveredMessages]);

  // Notifications fire only for delivered messages, so a scheduled one pings
  // when it actually arrives rather than when it was written.
  useUnreadNotifications(deliveredMessages, slot, notifSettings);

  /**
   * Turns a finished scribble into a shared doodle.
   *
   * Anchors it to the first message crossing the top of the viewport, then
   * stores each point relative to that message: x as a fraction of the content
   * width (the two devices differ), y in pixels below the anchor. The doodle
   * then rides along with that message and expires with it.
   */
  const handleScribbleDone = (strokes: ScribbleStroke[]) => {
    const container = scroll.ref.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const containerRect = container.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const width = content.clientWidth || 1;

    let anchorId: string | null = null;
    let anchorTop = 0;
    for (const message of allMessages) {
      const el = document.getElementById(`msg-${message.id}`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.bottom > containerRect.top + 4) {
        anchorId = message.id;
        anchorTop = rect.top - contentRect.top;
        break;
      }
    }
    if (anchorId === null) return;

    const converted: DoodleStroke[] = strokes.map((stroke) => {
      const pts: number[] = [];
      for (const point of stroke.points) {
        pts.push(
          Math.round(((point.x - contentRect.left) / width) * 1e4) / 1e4,
          Math.round((point.y - contentRect.top - anchorTop) * 10) / 10,
        );
      }
      return { tool: stroke.tool, color: stroke.color, width: stroke.width, pts };
    });

    void saveDoodle(anchorId, converted).catch(() => {
      setUploadError('Could not save that doodle.');
    });
  };

  const handleTogglePin = (message: Message) => {
    const result = togglePin(message);
    if (!result.ok) {
      setPinNotice(result.reason);
      setTimeout(() => {
        setPinNotice(null);
      }, 3000);
    }
  };

  /**
   * Builds the quote snapshot at reply time rather than storing just an id.
   *
   * The excerpt lives inside the encrypted payload, so the quote still renders
   * after the original has expired and been swept — and displaying a reply
   * costs no extra read.
   */
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  /**
   * Scrolls to a quoted message and flashes it.
   *
   * Silently does nothing if the target has expired and been swept — the quote
   * still renders because its excerpt was snapshotted at send time, but there
   * is no longer anything to jump to, and an error for that would be noise.
   */
  const jumpToMessage = (messageId: string) => {
    const element = document.getElementById(`msg-${messageId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(messageId);
    setTimeout(() => {
      setHighlightedId(null);
    }, 1200);
  };

  const startReply = (message: Message) => {
    const preview =
      message.payload.kind === 'text'
        ? resolveMentionsPlain(maskSpoilers(message.payload.text), {
            mySlot: slot,
            peerName: peerName.name,
          }).slice(0, 120)
        : message.payload.kind === 'image'
          ? 'Photo'
          : message.payload.kind === 'video'
            ? 'Video'
            : message.payload.kind === 'file'
              ? message.payload.name
            : message.payload.kind === 'audio'
              ? 'Voice message'
              : 'Call';

    setReplyTo({ id: message.id, sender: message.sender, kind: message.payload.kind, preview });
  };

  /**
   * The unread divider is pinned once per session.
   *
   * It is computed from the last-read timestamp captured on mount and then
   * frozen. Recomputing as messages arrive would make the divider crawl down
   * the list while you are reading, which is worse than not having one.
   */
  const [lastReadAt, setLastReadAt] = useState<number | null>(null);
  const dividerPinned = useRef(false);
  const firstUnreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    void import('@/storage/db').then(async (db) => {
      setLastReadAt((await db.get<number>('last-read-at')) ?? 0);
    });
  }, []);

  if (!dividerPinned.current && lastReadAt !== null && messages.length > 0) {
    dividerPinned.current = true;
    firstUnreadIdRef.current =
      messages.find((m) => m.sender !== slot && m.createdAt > lastReadAt)?.id ?? null;
  }

  // Persist the read position as messages arrive, so the next session knows
  // where the divider belongs.
  useEffect(() => {
    const newest = messages.at(-1);
    if (!newest || document.visibilityState !== 'visible') return;
    void import('@/storage/db').then((db) => db.set('last-read-at', newest.createdAt));
  }, [messages]);

  const renderList = useMemo(
    () => buildRenderList(deliveredMessages, slot, firstUnreadIdRef.current),
    [deliveredMessages, slot],
  );

  const sendImage = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const { upload } = await import('@/services/images');
      const payload = await upload(cryptoKey, file);
      await send(payload, retentionMs);
    } catch (error) {
      setUploadError(
        error instanceof AppError && error.message !== error.code
          ? error.message
          : 'Could not send that image.',
      );
    } finally {
      setUploading(false);
    }
  };

  /**
   * Sends attachments, sharing the Media batch's rules: sequential, tolerant of
   * one failure, capped. Split from it only because files take a different
   * pipeline — nothing is re-encoded, the bytes go through untouched.
   */
  const sendFileBatch = async (files: File[]) => {
    const batch = files.slice(0, MEDIA_BATCH_MAX);
    setUploading(true);
    setUploadError(null);

    const failures: string[] = [];
    for (const file of batch) {
      try {
        const { upload } = await import('@/services/files');
        const payload = await upload(cryptoKey, file);
        await send(payload, retentionMs);
      } catch (error) {
        failures.push(
          error instanceof AppError && error.message !== error.code
            ? `${file.name}: ${error.message}`
            : file.name,
        );
      }
    }

    setUploading(false);

    if (files.length > MEDIA_BATCH_MAX) {
      setUploadError(
        `Only the first ${String(MEDIA_BATCH_MAX)} were sent — select fewer at a time.`,
      );
    } else if (failures.length === 1) {
      setUploadError(`Could not send ${failures[0] ?? 'that file'}.`);
    } else if (failures.length > 1) {
      setUploadError(`Could not send ${String(failures.length)} of ${String(batch.length)} files.`);
    }
  };

  /**
   * Sends a batch from the Media picker, one file at a time.
   *
   * Sequential on purpose. Each item is compressed, encrypted and written as
   * several documents, so firing them in parallel would spike the write rate
   * and, on a phone, try to hold every decoded image in memory at once.
   *
   * A failure does NOT abort the batch — the remaining files still go, and the
   * error names how many were skipped. Losing nine good photos because the
   * tenth was an unsupported format would be its own bug.
   */
  const sendMediaBatch = async (files: File[]) => {
    const batch = files.slice(0, MEDIA_BATCH_MAX);
    setUploading(true);
    setUploadError(null);

    const failures: string[] = [];
    for (const file of batch) {
      try {
        const isVideo = file.type.startsWith('video/');
        const { upload } = await (isVideo
          ? import('@/services/video')
          : import('@/services/images'));
        const payload = await upload(cryptoKey, file);
        await send(payload, retentionMs);
      } catch (error) {
        failures.push(
          error instanceof AppError && error.message !== error.code
            ? `${file.name}: ${error.message}`
            : file.name,
        );
      }
    }

    setUploading(false);

    if (files.length > MEDIA_BATCH_MAX) {
      setUploadError(
        `Only the first ${String(MEDIA_BATCH_MAX)} were sent — select fewer at a time.`,
      );
    } else if (failures.length === 1) {
      setUploadError(`Could not send ${failures[0] ?? 'that file'}.`);
    } else if (failures.length > 1) {
      setUploadError(`Could not send ${String(failures.length)} of ${String(batch.length)} files.`);
    }
  };


  /**
   * Downloads the GIF here, then hands it to the ordinary image pipeline.
   * That is what keeps the recipient off Giphy entirely — by the time the
   * message is written, the GIF is encrypted ciphertext in Firestore.
   */
  const sendGif = async (result: GifResult) => {
    setUploading(true);
    setUploadError(null);
    try {
      const [gifs, images] = await Promise.all([
        import('@/services/gifs'),
        import('@/services/images'),
      ]);
      const file = await gifs.fetchBytes(result);
      const payload = await images.upload(cryptoKey, file);
      await send(payload, retentionMs);
    } catch (error) {
      setUploadError(
        error instanceof AppError && error.message !== error.code
          ? error.message
          : 'Could not send that GIF.',
      );
    } finally {
      setUploading(false);
    }
  };

  const sendVoice = async (blob: Blob, durationMs: number, peaks: number[]) => {
    setUploading(true);
    setUploadError(null);
    try {
      const { upload } = await import('@/services/audio');
      const payload = await upload(cryptoKey, blob, durationMs, peaks);
      await send(payload, retentionMs);
    } catch (error) {
      setUploadError(
        error instanceof AppError && error.message !== error.code
          ? error.message
          : 'Could not send that recording.',
      );
    } finally {
      setUploading(false);
    }
  };

  // Mark the peer's messages read once they are actually on screen and the tab
  // has focus. Receipts should mean "seen", not "downloaded".
  useEffect(() => {
    if (document.visibilityState !== 'visible' || !scroll.following) return;
    markVisibleRead();
  }, [messages, scroll.following, markVisibleRead]);

  return (
    <MentionNamesProvider mySlot={slot} peerName={peerName.name}>
    <div
      className="relative flex h-full flex-col"
      onDragOver={(event) => {
        // Both preventDefault calls are required: without them the browser
        // navigates away to display the dropped file.
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        // Fires when crossing child boundaries too, so only clear when the
        // pointer has actually left the container.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = Array.from(event.dataTransfer.files).find((f) =>
          f.type.startsWith('image/'),
        );
        if (file) void sendImage(file);
      }}
    >
      <AnimatePresence>
        {dragging && (
          <m.div
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02, transition: { duration: 0.12 } }}
            transition={springs.gentle}
            className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center
                       justify-center gap-3 rounded-xl border-2 border-dashed border-accent
                       bg-bg-deep/80 backdrop-blur-md"
          >
            <m.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ImagePlus size={30} className="text-accent" aria-hidden />
            </m.div>
            <p className="text-sm font-medium text-text">Drop to send</p>
          </m.div>
        )}
      </AnimatePresence>

      <Header
        peer={peer}
        connection={connection}
        onVoiceCall={() => void call.start('audio')}
        onVideoCall={() => void call.start('video')}
        peerName={peerName.name}
        onRename={handleRename}
        theirNameForMe={theirNameForMe}
        canArchive={slot === 'a'}
        onOpenArchive={() => {
          setArchiveOpen(true);
        }}
        onOpenBulkReactions={() => {
          setBulkReactOpen(true);
        }}
        onOpenSearch={() => {
          setSearchOpen(true);
        }}
        pins={pins}
        onJumpToPin={jumpToMessage}
        onUnpin={unpin}
        pinLiveIds={liveIds}
        notifSound={notifSettings.sound}
        notifInTab={notifSettings.inTab}
        onToggleNotifSound={() => {
          const next = !notifSettings.sound;
          updateNotif({ sound: next });
          // Play once when turning it on, so they hear what it sounds like.
          if (next) playTing();
        }}
        onToggleNotifInTab={() => {
          updateNotif({ inTab: !notifSettings.inTab });
        }}
      />

      <div
        ref={scroll.ref}
        onScroll={scroll.onScroll}
        role="list"
        aria-label="Messages"
        className="flex-1 overflow-y-auto overscroll-contain"
      >
        <div
          ref={contentRef}
          className="relative mx-auto flex min-h-full max-w-[850px] flex-col justify-end gap-2 px-4 py-4"
        >
          <DoodleLayer doodles={doodles} contentRef={contentRef} revision={deliveredMessages.length} />

          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              Messages disappear after 30 days.
            </p>
          )}

          {/* `initial={false}` — the first 50-message hydration renders at rest;
              only messages that arrive afterwards spring in, and a removed one
              (an expiry sweep) animates out. */}
          <AnimatePresence initial={false}>
            {renderList.map((item) =>
              item.kind === 'date' ? (
                <DateSeparator key={item.key} timestamp={item.timestamp} />
              ) : item.kind === 'unread' ? (
                <UnreadSeparator key={item.key} />
              ) : (
                <Bubble
                  key={item.key}
                  message={item.message}
                  mine={item.mine}
                  mySlot={slot}
                  position={item.position}
                  cryptoKey={cryptoKey}
                  onOpenImage={setViewerUrl}
                  onReply={startReply}
                  onReact={(message, emoji) => {
                    void react(message.id, emoji);
                  }}
                  bulkReactions={bulkReactions.emojis}
                  onBulkReact={(message) => {
                    void bulkReact(message.id, bulkReactions.emojis);
                  }}
                  onJumpTo={jumpToMessage}
                  onTogglePin={handleTogglePin}
                  onEdit={(message, newText) => {
                    edit(message, newText);
                  }}
                  pinned={pinnedIds.has(item.message.id)}
                  highlighted={highlightedId === item.message.id}
                />
              ),
            )}
          </AnimatePresence>

          <AnimatePresence>
            {peer.typing && (
              <m.div
                key="typing"
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                transition={springs.gentle}
                style={{ transformOrigin: 'bottom left' }}
              >
                <TypingIndicator />
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
        <AnimatePresence>
          {!scroll.following && (
            <m.button
              type="button"
              onClick={scroll.scrollToBottom}
              aria-label="Scroll to latest"
              initial={{ opacity: 0, y: 8, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.8, transition: { duration: 0.14 } }}
              transition={springs.snappy}
              whileTap={{ scale: 0.9 }}
              className="panel pointer-events-auto flex size-9 items-center justify-center rounded-full
                         border border-hairline text-secondary depth-lg transition-colors
                         duration-150 hover:text-text"
            >
              <ChevronDown size={17} aria-hidden />
            </m.button>
          )}
        </AnimatePresence>
      </div>

      {uploadError !== null && (
        <p role="alert" className="px-4 pb-1 text-center text-xs text-danger">
          {uploadError}
        </p>
      )}

      {pinNotice !== null && (
        <p role="alert" className="px-4 pb-1 text-center text-xs text-muted">
          {pinNotice}
        </p>
      )}

      {/* Shown after the first back with nothing left to close. Floats above the
          composer so it cannot be mistaken for a message. */}
      {showExitHint && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <p
            role="status"
            className="animate-scale-in rounded-full bg-black/65 px-4 py-2 text-xs text-white/90
                       ring-1 ring-inset ring-white/15 backdrop-blur-xl"
          >
            Press back again to exit
          </p>
        </div>
      )}

      {scheduledMessages.length > 0 && (
        <div className="mx-auto w-full max-w-[850px] px-3">
          <button
            type="button"
            onClick={() => {
              setScheduledOpen((open) => !open);
            }}
            className="flex w-full items-center gap-2 rounded-t-md border border-b-0 border-hairline
                       bg-surface/70 px-3 py-1.5 text-xs text-secondary hover:text-text"
          >
            <Clock size={13} className="text-accent" aria-hidden />
            <span className="tabular-nums">{scheduledMessages.length}</span> scheduled
            <ChevronDown
              size={14}
              aria-hidden
              className={cn('ml-auto text-muted transition-transform', scheduledOpen && 'rotate-180')}
            />
          </button>

          {scheduledOpen && (
            <div className="max-h-52 overflow-y-auto border border-b-0 border-hairline bg-surface/95">
              {scheduledMessages.map((message) => (
                <div
                  key={message.id}
                  className="group flex items-start gap-2 border-b border-hairline px-3 py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.625rem] text-accent">
                      {new Date(message.createdAt).toLocaleString([], {
                        weekday: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="truncate text-xs text-secondary">
                      {message.payload.kind === 'text'
                        ? resolveMentionsPlain(maskSpoilers(message.payload.text), {
                            mySlot: slot,
                            peerName: peerName.name,
                          })
                        : 'Message'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void cancelScheduled(message.id);
                    }}
                    aria-label="Cancel scheduled message"
                    className="press flex size-7 shrink-0 items-center justify-center rounded-full
                               text-muted hover:bg-danger/15 hover:text-danger"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Composer
        onSend={(text) => {
          clearTyping();
          // Convert the display mentions the composer inserted into stable slot
          // tokens before the text is encrypted and sent.
          const encoded = encodeMentions(text, { mySlot: slot, peerSlot, peerName: peerName.name });
          void send({ kind: 'text', text: encoded, ...(replyTo ? { replyTo } : {}) }, retentionMs);
          setReplyTo(null);
        }}
        onSendImage={(file) => {
          void sendImage(file);
        }}
        onSendMedia={(files) => {
          void sendMediaBatch(files);
        }}
        onSendFiles={(files) => {
          void sendFileBatch(files);
        }}
        retentionMs={retentionMs}
        onRetentionChange={setRetentionMs}
        onSendVoice={(blob, durationMs, peaks) => {
          void sendVoice(blob, durationMs, peaks);
        }}
        onSendGif={(result) => {
          void sendGif(result);
        }}
        onOpenCamera={() => {
          setCameraOpen(true);
        }}
        onOpenScribble={() => {
          setScribbleOpen(true);
        }}
        onSchedule={(text, deliverAt) => {
          void scheduleMessage(
            { kind: 'text', text, ...(replyTo ? { replyTo } : {}) },
            deliverAt,
          );
          setReplyTo(null);
        }}
        onTyping={noteTyping}
        replyTo={replyTo}
        onCancelReply={() => {
          setReplyTo(null);
        }}
        disabled={connection === 'offline'}
        uploading={uploading}
      />

      {cameraOpen && (
        <CameraSheet
          onCapture={(file) => {
            void sendImage(file);
          }}
          onClose={() => {
            setCameraOpen(false);
          }}
        />
      )}

      <ImageViewer
        url={viewerUrl}
        onClose={() => {
          setViewerUrl(null);
        }}
      />

      {scribbleOpen && (
        <ScribbleSheet
          onDone={handleScribbleDone}
          onClose={() => {
            setScribbleOpen(false);
          }}
        />
      )}

      <SearchModal
        open={searchOpen}
        messages={deliveredMessages}
        mySlot={slot}
        peerName={peerName.name}
        onJump={jumpToMessage}
        onClose={() => {
          setSearchOpen(false);
        }}
      />

      <BulkReactionsModal
        open={bulkReactOpen}
        selected={bulkReactions.emojis}
        max={bulkReactions.max}
        onToggle={bulkReactions.toggle}
        onRemove={bulkReactions.remove}
        onClose={() => {
          setBulkReactOpen(false);
        }}
      />

      <ArchiveManager
        open={archiveOpen && archive.isArchivist}
        enabled={archive.enabled}
        stats={archive.stats}
        exporting={archive.exporting}
        peerName={peerName.name}
        onToggle={archive.toggle}
        onExport={() => {
          archive.exportNow(peerName.name);
        }}
        onClear={archive.clear}
        onClose={() => {
          setArchiveOpen(false);
        }}
      />

      <CallScreen
        phase={call.phase}
        kind={call.kind}
        error={call.error}
        muted={call.muted}
        cameraOff={call.cameraOff}
        peerMuted={call.peerMuted}
        peerCameraOff={call.peerCameraOff}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        onAccept={() => void call.accept()}
        onDecline={call.decline}
        onHangUp={call.hangUp}
        onToggleMute={call.toggleMute}
        onToggleCamera={call.toggleCamera}
        onSwitchCamera={call.switchCamera}
        canSwitchCamera={call.canSwitchCamera}
        sharingScreen={call.sharingScreen}
        canShareScreen={call.canShareScreen}
        onToggleScreenShare={call.toggleScreenShare}
        onDismissError={call.dismissError}
      />
    </div>
    </MentionNamesProvider>
  );
}
