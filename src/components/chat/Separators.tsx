import { formatDayLabel } from '@/utils/messageGroups';

export function DateSeparator({ timestamp }: { timestamp: number }) {
  return (
    <div className="my-2 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-border" />
      <span
        className="glass rounded-full border border-border px-3 py-1 text-[0.6875rem]
                   font-medium text-secondary"
      >
        {formatDayLabel(timestamp)}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function UnreadSeparator() {
  return (
    <div className="my-2 flex items-center gap-3" role="separator" aria-label="New messages">
      <span className="h-px flex-1 bg-accent/50" />
      <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-accent">
        New
      </span>
      <span className="h-px flex-1 bg-accent/50" />
    </div>
  );
}
