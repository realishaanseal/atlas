import { Phone, PhoneMissed, Video, VideoOff } from 'lucide-react';
import type { Message, MessagePayload } from '@/types';
import { cn } from '@/utils/cn';

type CallPayload = Extract<MessagePayload, { kind: 'call' }>;

interface CallLogEntryProps {
  message: Message;
  payload: CallPayload;
  mine: boolean;
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${String(seconds)}s`;
  return `${String(minutes)}m ${String(seconds)}s`;
}

function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * A call log line, rendered centred rather than as a bubble.
 *
 * Call records are events rather than messages — nobody replies to one — so
 * they read better as a divider than as something either person "said".
 */
export function CallLogEntry({ message, payload, mine }: CallLogEntryProps) {
  const missed = payload.outcome !== 'completed';
  const isVideo = payload.callKind === 'video';

  const Icon = missed ? (isVideo ? VideoOff : PhoneMissed) : isVideo ? Video : Phone;

  const label = missed
    ? payload.outcome === 'declined'
      ? mine
        ? `${isVideo ? 'Video' : 'Voice'} call declined`
        : `${isVideo ? 'Video' : 'Voice'} call you declined`
      : mine
        ? `${isVideo ? 'Video' : 'Voice'} call — no answer`
        : `Missed ${isVideo ? 'video' : 'voice'} call`
    : `${isVideo ? 'Video' : 'Voice'} call${
        payload.durationMs === undefined ? '' : ` · ${formatDuration(payload.durationMs)}`
      }`;

  return (
    <div className="my-2 flex justify-center" role="listitem">
      <div
        className={cn(
          'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs',
          'bg-surface/70 backdrop-blur-sm',
          missed ? 'border-danger/40 text-danger' : 'border-border text-secondary',
        )}
      >
        <Icon size={13} aria-hidden />
        <span>{label}</span>
        <span className="text-muted">{timeLabel(message.createdAt)}</span>
      </div>
    </div>
  );
}
