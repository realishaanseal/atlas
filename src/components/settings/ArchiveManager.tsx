import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Download, HardDrive, Trash2, X } from 'lucide-react';
import type { ArchiveStats } from '@/services/archive';
import { cn } from '@/utils/cn';

interface ArchiveManagerProps {
  enabled: boolean;
  stats: ArchiveStats | null;
  exporting: boolean;
  peerName: string;
  onToggle: () => void;
  onExport: () => void;
  onClear: () => void;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toString()} KB`;
}

export function ArchiveManager({
  enabled,
  stats,
  exporting,
  peerName,
  onToggle,
  onExport,
  onClear,
  onClose,
}: ArchiveManagerProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  const since =
    stats?.firstCapturedAt != null
      ? new Date(stats.firstCapturedAt).toLocaleDateString([], {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;

  const hasMessages = (stats?.messageCount ?? 0) > 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat archive"
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop bg-bg-deep/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="animate-scale-in w-[min(27rem,92vw)] overflow-hidden rounded-lg border border-hairline
                   bg-surface shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-text">
            <Archive size={15} className="text-accent" aria-hidden />
            Chat archive
          </h2>
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

        <div className="space-y-4 p-4">
          <p className="text-[0.8125rem] leading-relaxed text-secondary">
            Messages vanish from the cloud after 24 hours. With this on, a copy of everything
            you see in your chat with {peerName} — text, photos, GIFs, voice notes, reactions —
            is kept privately on this device so you can keep it as a memory. It stays only here,
            never uploaded, and only you have it.
          </p>

          {/* capture toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={onToggle}
            className="flex w-full items-center gap-3 rounded-md border border-hairline px-3 py-2.5
                       text-left transition-colors duration-150 hover:bg-surface-raised"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-text">Keep a local copy</span>
              <span className="block text-[0.6875rem] text-muted">
                {enabled ? 'Saving new messages as they arrive.' : 'Paused — new messages aren’t saved.'}
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
                enabled ? 'bg-accent-solid' : 'bg-surface-raised',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-white transition-all duration-200',
                  enabled ? 'left-[1.125rem]' : 'left-0.5',
                )}
              />
            </span>
          </button>

          {/* stats */}
          <div className="flex items-center gap-3 rounded-md bg-surface-raised px-3 py-2.5">
            <HardDrive size={17} className="shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1 text-[0.8125rem]">
              <span className="text-text">
                {stats ? `${stats.messageCount.toString()} messages saved` : 'Reading…'}
              </span>
              {stats && (
                <span className="block text-[0.6875rem] text-muted">
                  {formatBytes(stats.totalBytes)} on this device{since ? ` · since ${since}` : ''}
                </span>
              )}
            </div>
          </div>

          {/* export */}
          <button
            type="button"
            disabled={!hasMessages || exporting}
            onClick={onExport}
            className={cn(
              'press flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium',
              'text-white shadow-glow',
              'animate-gradient bg-gradient-to-br from-accent-solid via-accent-solid-hover to-accent-solid-deep',
              'disabled:opacity-40 disabled:shadow-none',
            )}
          >
            <Download size={16} aria-hidden />
            {exporting ? 'Building file…' : 'Export as a file'}
          </button>
          <p className="-mt-2 text-[0.6875rem] leading-relaxed text-muted">
            Saves one self-contained HTML file with every message and all media inside — opens in
            any browser, forever. Re-export any time; each file is complete and up to date. Back it
            up somewhere safe for a permanent copy.
          </p>

          {/* danger */}
          {hasMessages &&
            (confirmClear ? (
              <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5">
                <span className="flex-1 text-[0.8125rem] text-text">Delete the saved copy?</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmClear(false);
                  }}
                  className="press rounded-md px-2.5 py-1 text-xs text-secondary hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClear();
                    setConfirmClear(false);
                  }}
                  className="press rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-white"
                >
                  Delete
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmClear(true);
                }}
                className="press flex w-full items-center justify-center gap-2 rounded-md py-2
                           text-xs text-muted hover:text-danger"
              >
                <Trash2 size={14} aria-hidden />
                Delete saved copy from this device
              </button>
            ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
