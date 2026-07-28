import { X, Image as ImageIcon, Film, Mic, Pin } from 'lucide-react';
import { useMentionNames } from '@/hooks/useMentionNames';
import { resolveMentionsPlain } from '@/utils/mention';
import type { Pin as PinType } from '@/types';

interface PinPanelProps {
  pins: PinType[];
  /** Jumps to the message; present in the timeline as long as it stays pinned. */
  onJump: (messageId: string) => void;
  onUnpin: (pin: PinType) => void;
  /** Ids currently in the timeline — pinned messages are kept loaded, so this
      is normally every pin, but a message deleted out from under a stale pin
      would not be. */
  liveIds: Set<string>;
  onClose: () => void;
}

function KindIcon({ kind }: { kind: PinType['kind'] }) {
  if (kind === 'image') return <ImageIcon size={12} className="shrink-0 text-muted" aria-hidden />;
  if (kind === 'video') return <Film size={12} className="shrink-0 text-muted" aria-hidden />;
  if (kind === 'audio') return <Mic size={12} className="shrink-0 text-muted" aria-hidden />;
  return null;
}

/**
 * The pinned-messages dropdown, opened from the header's pin button.
 *
 * Dumb/presentational: dismissal (outside click, Escape) is owned by the Header
 * so the click that opens it is not immediately read as "outside". Same pattern
 * as the settings menu.
 *
 * A pin can outlive its message — the persistent store is the whole point — so
 * "jump to message" is only offered while the original is still in the live
 * list. Once swept, the pinned text stays readable here but there is nowhere to
 * jump, and the row says so rather than scrolling to nothing.
 */
export function PinPanel({ pins, onJump, onUnpin, liveIds, onClose }: PinPanelProps) {
  const { mySlot, peerName } = useMentionNames();
  return (
    <div
      role="dialog"
      aria-label="Pinned messages"
      className="animate-scale-in absolute right-0 top-12 z-30 w-[min(22rem,86vw)] overflow-hidden
                 rounded-md border border-border bg-surface/97 shadow-lift backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <Pin size={14} className="text-accent" aria-hidden />
        <span className="text-sm font-medium text-text">Pinned messages</span>
        {pins.length > 0 && (
          <span className="ml-auto text-xs tabular-nums text-muted">{pins.length}</span>
        )}
      </div>

      {pins.length === 0 ? (
        <p className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-muted">
          <Pin size={18} aria-hidden />
          No pinned messages yet. Right-click a message and choose Pin.
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {pins.map((entry) => {
            const canJump = liveIds.has(entry.messageId);
            return (
              <div
                key={entry.messageId}
                className="group flex items-start gap-2 rounded-sm px-2.5 py-2 hover:bg-surface-raised"
              >
                <button
                  type="button"
                  disabled={!canJump}
                  onClick={() => {
                    onJump(entry.messageId);
                    onClose();
                  }}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <span className="mb-0.5 flex items-center gap-1.5">
                    <KindIcon kind={entry.kind} />
                    {/* The masked preview, never the full `text` — a pinned
                        spoiler must stay hidden in the list. The real message,
                        with its revealable spoiler, is a jump away. Mention
                        tokens are resolved to readable names for the viewer. */}
                    <span className="line-clamp-2 text-xs text-text">
                      {resolveMentionsPlain(entry.preview, { mySlot, peerName })}
                    </span>
                  </span>
                  <span className="text-[0.625rem] text-muted">
                    {new Date(entry.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {!canJump && ' · unavailable'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUnpin(entry);
                  }}
                  aria-label="Unpin"
                  className="press flex size-7 shrink-0 items-center justify-center rounded-full
                             text-muted opacity-0 transition-opacity hover:bg-danger/15
                             hover:text-danger focus:opacity-100 group-hover:opacity-100"
                >
                  <X size={13} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
