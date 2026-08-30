import type { ReactNode } from 'react';
import { m } from 'motion/react';
import { BellDot, Volume2, VolumeX, X } from 'lucide-react';
import { Overlay } from '@/components/ui/Overlay';
import { springs } from '@/motion/springs';
import { cn } from '@/utils/cn';

interface NotificationSettingsModalProps {
  open: boolean;
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
      className="press flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left
                 transition-colors duration-150 hover:bg-surface-raised"
    >
      <span className={cn('shrink-0 transition-colors', checked ? 'text-accent' : 'text-muted')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-text">{label}</span>
        <span className="block text-[0.6875rem] text-muted">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-accent-solid' : 'bg-surface-raised ring-1 ring-inset ring-hairline',
        )}
      >
        <m.span
          aria-hidden
          animate={{ x: checked ? 16 : 0 }}
          transition={springs.snappy}
          className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-contact"
        />
      </span>
    </button>
  );
}

export function NotificationSettingsModal({
  open,
  sound,
  inTab,
  onToggleSound,
  onToggleInTab,
  onClose,
}: NotificationSettingsModalProps) {
  return (
    <Overlay open={open} onClose={onClose} label="Notifications">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
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
    </Overlay>
  );
}
