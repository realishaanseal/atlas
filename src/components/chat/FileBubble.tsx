import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { MessagePayload } from '@/types';

type FilePayload = Extract<MessagePayload, { kind: 'file' }>;

interface FileBubbleProps {
  cryptoKey: CryptoKey;
  payload: FilePayload;
  mine: boolean;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toString()} KB`;
  return `${String(bytes)} B`;
}

/**
 * An attachment: name, size, and a download that decrypts on demand.
 *
 * Nothing is fetched until you ask for it. Attachments can be tens of
 * megabytes, and eagerly decrypting every one that scrolls past would be both
 * slow and a needless amount of plaintext held in memory.
 */
export function FileBubble({ cryptoKey, payload, mine }: FileBubbleProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    void (async () => {
      try {
        const { download } = await import('@/services/files');
        await download(cryptoKey, payload);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <button
      type="button"
      onClick={save}
      className={cn(
        'flex w-[min(74vw,17rem)] items-center gap-3 rounded-md p-1 text-left',
        'transition-colors duration-150',
        mine ? 'hover:bg-white/10' : 'hover:bg-surface-raised',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-md',
          mine ? 'bg-white/15 text-white' : 'bg-surface-raised text-accent',
        )}
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" aria-hidden />
        ) : (
          <FileText size={18} aria-hidden />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{payload.name}</span>
        <span className={cn('block text-[0.6875rem]', mine ? 'text-white/70' : 'text-muted')}>
          {failed ? 'Expired or unavailable' : busy ? 'Decrypting…' : formatSize(payload.byteSize)}
        </span>
      </span>

      <Download
        size={16}
        aria-hidden
        className={cn('shrink-0', mine ? 'text-white/80' : 'text-secondary')}
      />
    </button>
  );
}
