import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BellDot, Volume2, VolumeX, X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface NotificationSettingsModalProps {
  sound: boolean;
  inTab: boolean;
  onToggleSound: () => void;
  onToggleInTab: () => void;
  onClose: () => void;
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left
                 transition-colors duration-150 hover:bg-surface-raised"
    >
      <span className={cn('shrink-0', checked ? 'text-accent' : 'text-muted')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-text">{label}</span>
        <span className="block text-[0.6875rem] text-muted">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-accent-solid' : 'bg-surface-raised',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white transition-all duration-200',
            checked ? 'left-[1.125rem]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

export function NotificationSettingsModal({
  sound,
  inTab,
  onToggleSound,
  onToggleInTab,
  onClose,
}: NotificationSettingsModalProps) {
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notification settings"
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop bg-bg-deep/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="animate-scale-in w-[min(26rem,92vw)] overflow-hidden rounded-lg border border-border
                   bg-surface shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-text">Notifications</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press flex size-8 items-center justify-center rounded-full text-muted
                       hover:bg-surface-raised hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="p-2">
          <ToggleRow
            icon={sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            label="Alert sound"
            description="A soft chime when a message arrives while you're away from the tab."
            checked={sound}
            onToggle={onToggleSound}
          />
          <ToggleRow
            icon={<BellDot size={17} />}
            label="Unread badge in tab"
            description="Shows the unread count in the browser tab title."
            checked={inTab}
            onToggle={onToggleInTab}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
