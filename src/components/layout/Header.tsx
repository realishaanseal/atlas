import { useEffect, useRef, useState } from 'react';
import {
  Settings,
  Lock,
  MonitorSmartphone,
  Smartphone,
  LogOut,
  Check,
  Phone,
  Video as VideoIcon,
  DoorOpen,
  Sparkles,
  Pin as PinIcon,
  Bell,
  Palette,
  Archive,
  Zap,
  Clock,
} from 'lucide-react';
import { EmojiManager } from '@/components/chat/EmojiManager';
import { ThemeManager } from '@/components/chat/ThemeManager';
import { NotificationSettingsModal } from '@/components/settings/NotificationSettingsModal';
import { PinPanel } from '@/components/chat/PinPanel';
import type { ConnectionState, Pin } from '@/types';
import type { PeerPresence } from '@/services/presence';
import { cn } from '@/utils/cn';

interface HeaderProps {
  peer: PeerPresence;
  connection: ConnectionState;
  onLock: () => void;
  onPairNewDevice: () => Promise<void>;
  onLinkDevice: () => Promise<void>;
  /** Only the A side can add a second device. */
  canLinkDevice: boolean;
  onUnpair: () => Promise<void>;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  peerName: string;
  onRename: (name: string) => void;
  /** What the peer calls us, if they have set a nickname. A side only. */
  theirNameForMe: string | null;
  pins: Pin[];
  onJumpToPin: (messageId: string) => void;
  onUnpin: (pin: Pin) => void;
  pinLiveIds: Set<string>;
  notifSound: boolean;
  notifInTab: boolean;
  onToggleNotifSound: () => void;
  onToggleNotifInTab: () => void;
  /** A-side only: opens the local chat archive. */
  canArchive: boolean;
  onOpenArchive: () => void;
  onOpenBulkReactions: () => void;
  /** A-side only: manual last-seen. `active` shows the state in the menu. */
  canSetLastSeen: boolean;
  lastSeenOverridden: boolean;
  onOpenLastSeen: () => void;
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
  onLinkDevice,
  canLinkDevice,
  onUnpair,
  onVoiceCall,
  onVideoCall,
  peerName,
  onRename,
  theirNameForMe,
  pins,
  onJumpToPin,
  onUnpin,
  pinLiveIds,
  notifSound,
  notifInTab,
  onToggleNotifSound,
  onToggleNotifInTab,
  canArchive,
  onOpenArchive,
  onOpenBulkReactions,
  canSetLastSeen,
  lastSeenOverridden,
  onOpenLastSeen,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiManagerOpen, setEmojiManagerOpen] = useState(false);
  const [themeManagerOpen, setThemeManagerOpen] = useState(false);
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);

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

  // Same dismissal pattern for the pin panel. The ref wraps both the button and
  // the panel, so the click that opens it is not counted as "outside".
  useEffect(() => {
    if (!pinsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!pinRef.current?.contains(event.target as Node)) setPinsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinsOpen]);

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
              <>
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
                {/* What they call you — only ever populated on this (the A) side;
                    shown here, in the nickname context, rather than cluttering
                    the header the rest of the time. */}
                {theirNameForMe !== null && theirNameForMe.length > 0 && (
                  <p className="mt-1 truncate text-[0.6875rem] text-muted">
                    {peerName} calls you{' '}
                    <span className="font-medium text-secondary">{theirNameForMe}</span>
                  </p>
                )}
              </>
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
                <>
                  <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 blur-[3px]" />
                  {/* A slow outward ping, so "online" reads as a live signal
                      rather than a static dot. */}
                  <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-success" />
                </>
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
          <div className="relative" ref={pinRef}>
            <button
              type="button"
              onClick={() => {
                setPinsOpen((open) => !open);
              }}
              aria-label={`Pinned messages${pins.length > 0 ? `, ${String(pins.length)}` : ''}`}
              aria-expanded={pinsOpen}
              aria-haspopup="dialog"
              className={cn(
                'press relative flex size-10 items-center justify-center rounded-full',
                pinsOpen ? 'bg-surface-raised text-accent' : 'text-secondary',
                'hover:bg-surface-raised hover:text-accent',
              )}
            >
              <PinIcon size={18} aria-hidden />
              {/* Count badge, like Discord's. Hidden at zero so the header stays
                  quiet when nothing is pinned. */}
              {pins.length > 0 && (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center
                             rounded-full bg-accent-solid px-1 text-[0.5625rem] font-semibold
                             leading-4 text-white"
                >
                  {pins.length}
                </span>
              )}
            </button>

            {pinsOpen && (
              <PinPanel
                pins={pins}
                onJump={onJumpToPin}
                onUnpin={onUnpin}
                liveIds={pinLiveIds}
                onClose={() => {
                  setPinsOpen(false);
                }}
              />
            )}
          </div>

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
            data-open={menuOpen}
            className="press group flex size-10 items-center justify-center rounded-full
                       text-secondary hover:bg-surface-raised hover:text-accent"
          >
            {/* Turns on hover AND stays turned while open, so the gear tracks
                the panel's state rather than only reacting to the click. */}
            <Settings size={18} aria-hidden className="icon-turn-full" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="glass animate-scale-in stagger absolute right-0 top-12 w-60
                         origin-top-right overflow-hidden rounded-md border border-border shadow-lift"
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

              {/* Add a SECOND device to your own side (A only), so you can be on
                  a laptop and a phone at once without unpairing anyone. */}
              {canLinkDevice && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void onLinkDevice().then(() => {
                      setLinkOpen(true);
                      setTimeout(() => {
                        setLinkOpen(false);
                      }, 5 * 60 * 1000);
                    });
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm
                             transition-colors duration-150 hover:bg-surface"
                >
                  {linkOpen ? (
                    <Check size={15} className="text-success" aria-hidden />
                  ) : (
                    <Smartphone size={15} className="text-secondary" aria-hidden />
                  )}
                  {linkOpen ? 'Unlock on your other device now' : 'Add another of my devices'}
                </button>
              )}

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

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setThemeManagerOpen(true);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm
                           transition-colors duration-150 hover:bg-surface"
              >
                <Palette size={15} className="text-secondary" aria-hidden />
                Theme
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setNotifModalOpen(true);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm
                           transition-colors duration-150 hover:bg-surface"
              >
                <Bell size={15} className="text-secondary" aria-hidden />
                Notifications
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenBulkReactions();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm
                           transition-colors duration-150 hover:bg-surface"
              >
                <Zap size={15} className="text-secondary" aria-hidden />
                Quick reactions
              </button>

              {canSetLastSeen && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenLastSeen();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm
                             transition-colors duration-150 hover:bg-surface"
                >
                  <Clock
                    size={15}
                    className={lastSeenOverridden ? 'text-accent' : 'text-secondary'}
                    aria-hidden
                  />
                  Last seen
                  {lastSeenOverridden && (
                    <span className="ml-auto text-[0.625rem] font-medium text-accent">Custom</span>
                  )}
                </button>
              )}

              {/* A-side only: the local chat archive. The other device never
                  sees this, by design — only this side keeps the memory. */}
              {canArchive && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenArchive();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm
                             transition-colors duration-150 hover:bg-surface"
                >
                  <Archive size={15} className="text-secondary" aria-hidden />
                  Chat archive
                </button>
              )}

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

      {themeManagerOpen && (
        <ThemeManager
          onClose={() => {
            setThemeManagerOpen(false);
          }}
        />
      )}

      {notifModalOpen && (
        <NotificationSettingsModal
          sound={notifSound}
          inTab={notifInTab}
          onToggleSound={onToggleNotifSound}
          onToggleInTab={onToggleNotifInTab}
          onClose={() => {
            setNotifModalOpen(false);
          }}
        />
      )}
    </header>
  );
}
