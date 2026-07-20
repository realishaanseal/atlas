import { useEffect, useRef, useState } from 'react';
import {
  Settings,
  Lock,
  MonitorSmartphone,
  LogOut,
  Check,
  Phone,
  Video as VideoIcon,
  DoorOpen,
  Sparkles,
} from 'lucide-react';
import { EmojiManager } from '@/components/chat/EmojiManager';
import type { ConnectionState } from '@/types';
import type { PeerPresence } from '@/services/presence';
import { cn } from '@/utils/cn';

interface HeaderProps {
  peer: PeerPresence;
  connection: ConnectionState;
  onLock: () => void;
  onPairNewDevice: () => Promise<void>;
  onUnpair: () => Promise<void>;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  peerName: string;
  onRename: (name: string) => void;
}

function relativeTime(timestamp: number): string {
  if (timestamp === 0) return 'never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function Header({
  peer,
  connection,
  onLock,
  onPairNewDevice,
  onUnpair,
  onVoiceCall,
  onVideoCall,
  peerName,
  onRename,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiManagerOpen, setEmojiManagerOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const status =
    connection === 'offline'
      ? 'Reconnecting…'
      : peer.typing
        ? 'Typing…'
        : peer.online
          ? 'Online'
          : `Last seen ${relativeTime(peer.lastSeen)}`;

  return (
    <header className="glass sticky top-0 z-10 border-b border-border pt-safe">
      <div className="mx-auto flex h-14 max-w-[850px] items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Deliberately on the opposite side of the header from the call
              buttons. It was previously beside them, where a mistap starts a
              video call instead of ending your session — the two actions are
              nothing alike and should not be neighbours.

              Permanently red rather than red-on-hover: this is the only
              control here that discards state, and it should read that way
              before you touch it.

              window.close() only works for tabs a script opened, so on a
              normally-opened tab it silently fails — hence the fallback.
              `replace` rather than `assign` overwrites the history entry, so
              Back cannot return to the conversation. */}
          <button
            type="button"
            onClick={() => {
              onLock();
              window.close();
              setTimeout(() => {
                window.location.replace('https://www.google.com');
              }, 120);
            }}
            aria-label="Lock and leave"
            title="Lock and leave"
            className="press flex size-9 shrink-0 items-center justify-center rounded-full
                       text-danger hover:bg-danger/15"
          >
            <DoorOpen size={18} aria-hidden />
          </button>

          <div className="min-w-0">
            {editing ? (
              <input
                autoFocus
                defaultValue={peerName}
                maxLength={32}
                onBlur={(event) => {
                  onRename(event.target.value);
                  setEditing(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onRename(event.currentTarget.value);
                    setEditing(false);
                  }
                  if (event.key === 'Escape') setEditing(false);
                }}
                aria-label="Nickname"
                className="w-40 rounded-sm border border-accent bg-surface px-1.5 py-0.5
                           text-[0.9375rem] font-semibold text-text focus:outline-none"
              />
            ) : (
              /* Right-click to rename, like Discord. Also reachable by
                 keyboard — a context-menu-only affordance would be
                 unusable without a mouse. */
              <h1
                onContextMenu={(event) => {
                  event.preventDefault();
                  setEditing(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === 'F2') setEditing(true);
                }}
                tabIndex={0}
                role="button"
                title="Right-click to set a nickname"
                className="cursor-default truncate rounded-sm text-[0.9375rem] font-semibold
                           tracking-[-0.01em] outline-none"
              >
                {peerName}
              </h1>
            )}
          {/* The status dot is decorative reinforcement only — the adjacent
              text always states the status in words. Colour never carries
              meaning on its own here. */}
          <p
            className={cn(
              'flex items-center gap-1.5 truncate text-xs transition-colors duration-200',
              connection === 'offline'
                ? 'text-danger'
                : peer.online
                  ? 'text-success'
                  : 'text-muted',
            )}
            aria-live="polite"
          >
            {/* The halo is a second element rather than a box-shadow so it can
                be sized independently of the dot and stay crisp. */}
            <span aria-hidden className="relative flex size-1.5 shrink-0">
              {peer.online && connection !== 'offline' && (
                <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 blur-[3px]" />
              )}
              <span
                className={cn(
                  'relative inline-flex size-1.5 rounded-full transition-colors duration-300',
                  connection === 'offline'
                    ? 'bg-danger'
                    : peer.online
                      ? 'bg-success'
                      : 'bg-muted',
                )}
              />
            </span>
              {status}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onVoiceCall}
            disabled={connection === 'offline'}
            aria-label="Start voice call"
            className="press flex size-10 items-center justify-center rounded-full text-secondary
                       hover:bg-surface-raised hover:text-accent disabled:opacity-40"
          >
            <Phone size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onVideoCall}
            disabled={connection === 'offline'}
            aria-label="Start video call"
            className="press flex size-10 items-center justify-center rounded-full text-secondary
                       hover:bg-surface-raised hover:text-accent disabled:opacity-40"
          >
            <VideoIcon size={18} aria-hidden />
          </button>


          <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((open) => !open);
            }}
            aria-label="Settings"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="press flex size-10 items-center justify-center rounded-full text-secondary
                       hover:bg-surface-raised hover:text-accent"
          >
            <Settings
              size={18}
              aria-hidden
              className={cn(
                'transition-transform duration-500 ease-spring',
                menuOpen && 'rotate-90',
              )}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="glass animate-rise absolute right-0 top-12 w-60 overflow-hidden
                         rounded-md border border-border shadow-lift"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void onPairNewDevice().then(() => {
                    setPairingOpen(true);
                    setTimeout(() => {
                      setPairingOpen(false);
                    }, 5 * 60 * 1000);
                  });
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm
                           transition-colors duration-150 hover:bg-surface"
              >
                {pairingOpen ? (
                  <Check size={15} className="text-success" aria-hidden />
                ) : (
                  <MonitorSmartphone size={15} className="text-secondary" aria-hidden />
                )}
                {pairingOpen ? 'Open for 5 minutes' : 'Pair a new device'}
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setEmojiManagerOpen(true);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm
                           transition-colors duration-150 hover:bg-surface"
              >
                <Sparkles size={15} className="text-secondary" aria-hidden />
                Custom emoji
              </button>

              {/* Plain lock: returns to the password screen without leaving
                  the page. The quick-exit version lives in the header. */}
              <button
                type="button"
                role="menuitem"
                onClick={onLock}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm
                           transition-colors duration-150 hover:bg-surface"
              >
                <Lock size={15} className="text-secondary" aria-hidden />
                Lock
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void onUnpair();
                }}
                className="flex w-full items-center gap-2.5 border-t border-border px-3.5 py-2.5
                           text-left text-sm text-danger transition-colors
                           duration-150 hover:bg-surface"
              >
                <LogOut size={15} aria-hidden />
                Unpair this device
              </button>
            </div>
            )}
          </div>
        </div>
      </div>

      {emojiManagerOpen && (
        <EmojiManager
          onClose={() => {
            setEmojiManagerOpen(false);
          }}
        />
      )}
    </header>
  );
}
