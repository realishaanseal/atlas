import { useEffect, useRef, useState } from 'react';
import { m, type Variants } from 'motion/react';
import {
  Settings,
  Phone,
  Video as VideoIcon,
  Sparkles,
  Pin as PinIcon,
  Bell,
  Palette,
  Archive,
  MonitorSmartphone,
  Zap,
  Search,
} from 'lucide-react';
import { EmojiManager } from '@/components/chat/EmojiManager';
import { ThemeManager } from '@/components/chat/ThemeManager';
import { NotificationSettingsModal } from '@/components/settings/NotificationSettingsModal';
import { PairDeviceModal } from '@/components/settings/PairDeviceModal';
import { PinPanel } from '@/components/chat/PinPanel';
import { Popover } from '@/components/ui/Popover';
import { springs } from '@/motion/springs';
import type { ConnectionState, Pin } from '@/types';
import type { PeerPresence } from '@/services/presence';
import { useBackClose } from '@/hooks/useBackGuard';
import { cn } from '@/utils/cn';

/** Menu rows cascade in on open, capped so the last one is never noticeably late. */
const MENU_ITEM: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...springs.snappy, delay: Math.min(i, 7) * 0.028 },
  }),
};

interface HeaderProps {
  peer: PeerPresence;
  connection: ConnectionState;
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
  onOpenSearch: () => void;
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
  onOpenSearch,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [emojiManagerOpen, setEmojiManagerOpen] = useState(false);
  const [themeManagerOpen, setThemeManagerOpen] = useState(false);
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  // menuOpen's back-gesture + dismiss handling lives in <Popover>.
  useBackClose(pinsOpen, () => {
    setPinsOpen(false);
  });
  useBackClose(emojiManagerOpen, () => {
    setEmojiManagerOpen(false);
  });
  useBackClose(themeManagerOpen, () => {
    setThemeManagerOpen(false);
  });
  // notifModalOpen's back handling lives in <Overlay>.
  useBackClose(editing, () => {
    setEditing(false);
  });

  const menuRef = useRef<HTMLDivElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);

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

  const menuItems: { icon: typeof Bell; label: string; action: () => void }[] = [
    { icon: Sparkles, label: 'Custom emoji', action: () => { setEmojiManagerOpen(true); } },
    { icon: Palette, label: 'Theme', action: () => { setThemeManagerOpen(true); } },
    { icon: Bell, label: 'Notifications', action: () => { setNotifModalOpen(true); } },
    { icon: Search, label: 'Search', action: onOpenSearch },
    { icon: Zap, label: 'Quick reactions', action: onOpenBulkReactions },
    ...(canArchive
      ? [
          { icon: Archive, label: 'Chat archive', action: onOpenArchive },
          // A-side only, same reason as the archive: this opens the window that
          // pairs a new device onto THIS side.
          { icon: MonitorSmartphone, label: 'Add one of my devices', action: () => { setPairOpen(true); } },
        ]
      : []),
  ];

  return (
    <header className="glass sticky top-0 z-10 border-b border-hairline pt-safe">
      <div className="mx-auto flex h-14 max-w-[850px] items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2.5">
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
            <m.button
              type="button"
              onClick={() => {
                setMenuOpen((open) => !open);
              }}
              aria-label="Settings"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              whileTap={{ scale: 0.9 }}
              transition={springs.snappy}
              className="group flex size-10 items-center justify-center rounded-full
                         text-secondary transition-colors hover:bg-surface-raised hover:text-accent"
            >
              <m.span
                aria-hidden
                animate={{ rotate: menuOpen ? 180 : 0 }}
                transition={springs.gentle}
                className="flex"
              >
                <Settings size={18} aria-hidden />
              </m.span>
            </m.button>

            <Popover
              open={menuOpen}
              onClose={() => {
                setMenuOpen(false);
              }}
              anchorRef={menuRef}
              role="menu"
              origin="top-right"
              className="glass right-0 top-12 w-60 overflow-hidden rounded-md border border-hairline
                         shadow-raised"
            >
              {menuItems.map((item, i) => (
                <m.button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  custom={i}
                  variants={MENU_ITEM}
                  onClick={() => {
                    setMenuOpen(false);
                    item.action();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm
                             text-secondary transition-colors duration-150 hover:bg-surface-raised
                             hover:text-text"
                >
                  <item.icon size={15} aria-hidden />
                  {item.label}
                </m.button>
              ))}
            </Popover>
          </div>
        </div>
      </div>

      {pairOpen && (
        <PairDeviceModal
          onClose={() => {
            setPairOpen(false);
          }}
        />
      )}

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

      <NotificationSettingsModal
        open={notifModalOpen}
        sound={notifSound}
        inTab={notifInTab}
        onToggleSound={onToggleNotifSound}
        onToggleInTab={onToggleNotifInTab}
        onClose={() => {
          setNotifModalOpen(false);
        }}
      />
    </header>
  );
}
