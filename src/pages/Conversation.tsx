import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ImagePlus } from 'lucide-react';
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
import { useMessages } from '@/hooks/useMessages';
import { usePresence } from '@/hooks/usePresence';
import { usePeerName } from '@/hooks/usePeerName';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useCall } from '@/hooks/useCall';
import { useIdleLock } from '@/hooks/useIdleLock';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { CallScreen } from '@/components/call/CallScreen';
import type { Message, ParticipantId, ReplyRef } from '@/types';

interface ConversationProps {
  cryptoKey: CryptoKey;
  slot: ParticipantId;
  uid: string;
  onLock: () => void;
}

export default function Conversation({ cryptoKey, slot, uid, onLock }: ConversationProps) {
  const { messages, connection, send, markVisibleRead, react } = useMessages(cryptoKey, slot);
  const { peer, noteTyping, clearTyping } = usePresence(slot, uid);
  const peerName = usePeerName(slot === 'a' ? 'b' : 'a');
  const scroll = useAutoScroll<HTMLDivElement>(messages.length + (peer.typing ? 1 : 0));
  const call = useCall(cryptoKey, slot, (payload) => {
    void send(payload);
  });

  useUnreadNotifications(messages, slot);

  // Never lock mid-call — the definition of "idle" is wrong during a call, and
  // dropping someone's call to show a password box would be indefensible.
  useIdleLock(onLock, call.phase === 'idle');

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);

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
        ? message.payload.text.slice(0, 120)
        : message.payload.kind === 'image'
          ? 'Photo'
          : 'Voice message';

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
    () => buildRenderList(messages, slot, firstUnreadIdRef.current),
    [messages, slot],
  );

  const sendImage = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const { upload } = await import('@/services/images');
      const payload = await upload(cryptoKey, file);
      await send(payload);
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
      await send(payload);
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
      await send(payload);
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
      {dragging && (
        <div
          className="animate-rise pointer-events-none absolute inset-3 z-30 flex flex-col
                     items-center justify-center gap-3 rounded-xl border-2 border-dashed
                     border-accent bg-bg-deep/80 backdrop-blur-sm"
        >
          <ImagePlus size={30} className="text-accent" aria-hidden />
          <p className="text-sm font-medium text-text">Drop to send</p>
        </div>
      )}

      <Header
        peer={peer}
        connection={connection}
        onLock={onLock}
        onPairNewDevice={async () => {
          const { openRepairWindow } = await import('@/services/session');
          await openRepairWindow();
        }}
        onUnpair={async () => {
          const { releaseSlot } = await import('@/services/session');
          await releaseSlot(slot);
          onLock();
        }}
        onVoiceCall={() => void call.start('audio')}
        onVideoCall={() => void call.start('video')}
        peerName={peerName.name}
        onRename={peerName.rename}
      />

      <div
        ref={scroll.ref}
        onScroll={scroll.onScroll}
        role="list"
        aria-label="Messages"
        className="flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto flex min-h-full max-w-[850px] flex-col justify-end gap-2 px-4 py-4">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              Messages disappear after 24 hours.
            </p>
          )}

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
                onJumpTo={jumpToMessage}
                highlighted={highlightedId === item.message.id}
              />
            ),
          )}

          {peer.typing && <TypingIndicator />}
        </div>
      </div>

      {!scroll.following && (
        <button
          type="button"
          onClick={scroll.scrollToBottom}
          aria-label="Scroll to latest"
          className="absolute bottom-24 left-1/2 flex size-9 -translate-x-1/2 items-center
                     justify-center rounded-full border border-border bg-surface-raised
                     text-secondary shadow-soft transition-colors
                     duration-150 hover:text-text"
        >
          <ChevronDown size={17} aria-hidden />
        </button>
      )}

      {uploadError !== null && (
        <p role="alert" className="px-4 pb-1 text-center text-xs text-danger">
          {uploadError}
        </p>
      )}

      <Composer
        onSend={(text) => {
          clearTyping();
          void send({ kind: 'text', text, ...(replyTo ? { replyTo } : {}) });
          setReplyTo(null);
        }}
        onSendImage={(file) => {
          void sendImage(file);
        }}
        onSendVoice={(blob, durationMs, peaks) => {
          void sendVoice(blob, durationMs, peaks);
        }}
        onSendGif={(result) => {
          void sendGif(result);
        }}
        onOpenCamera={() => {
          setCameraOpen(true);
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

      {viewerUrl !== null && (
        <ImageViewer
          url={viewerUrl}
          onClose={() => {
            setViewerUrl(null);
          }}
        />
      )}

      <CallScreen
        phase={call.phase}
        kind={call.kind}
        error={call.error}
        muted={call.muted}
        cameraOff={call.cameraOff}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        onAccept={() => void call.accept()}
        onDecline={call.decline}
        onHangUp={call.hangUp}
        onToggleMute={call.toggleMute}
        onToggleCamera={call.toggleCamera}
        onDismissError={call.dismissError}
      />
    </div>
  );
}
