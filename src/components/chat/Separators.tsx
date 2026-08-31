import { m } from 'motion/react';
import { formatDayLabel } from '@/utils/messageGroups';
import { springs } from '@/motion/springs';

export function DateSeparator({ timestamp }: { timestamp: number }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className="my-3 flex items-center gap-3"
      role="separator"
    >
      <span className="h-px flex-1 bg-hairline" />
      <span
        className="glass rounded-full border border-hairline px-3 py-1 text-[0.6875rem]
                   font-medium text-secondary shadow-contact"
      >
        {formatDayLabel(timestamp)}
      </span>
      <span className="h-px flex-1 bg-hairline" />
    </m.div>
  );
}

export function UnreadSeparator() {
  return (
    <m.div
      initial={{ opacity: 0, scaleX: 0.9 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={springs.gentle}
      className="my-3 flex items-center gap-3"
      role="separator"
      aria-label="New messages"
    >
      <span className="h-px flex-1 bg-accent/45" />
      <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-accent">New</span>
      <span className="h-px flex-1 bg-accent/45" />
    </m.div>
  );
}
