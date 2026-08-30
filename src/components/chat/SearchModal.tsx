import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { maskSpoilers } from '@/utils/spoiler';
import { resolveMentionsPlain } from '@/utils/mention';
import { cn } from '@/utils/cn';
import type { Message, ParticipantId } from '@/types';

interface SearchModalProps {
  messages: Message[];
  mySlot: ParticipantId;
  peerName: string;
  onJump: (messageId: string) => void;
  onClose: () => void;
}

/** Longest run of context to show around a hit. */
const SNIPPET_PAD = 40;

/**
 * Search across the conversation.
 *
 * Entirely on-device: messages are already decrypted in memory, so this costs
 * nothing in reads and never asks the database a question about your content.
 * That also bounds it honestly — it searches what is loaded (the live window
 * plus pinned messages), not the whole history, because anything older has
 * been swept from the server.
 */
export function SearchModal({ messages, mySlot, peerName, onJump, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];

    const hits: { message: Message; before: string; match: string; after: string }[] = [];

    // Newest first: when you search you are usually looking for something
    // recent, and the list reads the same way the chat does.
    for (const message of [...messages].reverse()) {
      if (message.payload.kind !== 'text') continue;

      // Searched against the readable form, so a search for the peer's nickname
      // matches an @mention that is stored as an opaque slot token.
      const text = resolveMentionsPlain(maskSpoilers(message.payload.text), {
        mySlot,
        peerName,
      });

      const index = text.toLowerCase().indexOf(needle);
      if (index === -1) continue;

      hits.push({
        message,
        before: (index > SNIPPET_PAD ? '…' : '') + text.slice(Math.max(0, index - SNIPPET_PAD), index),
        match: text.slice(index, index + needle.length),
        after: text.slice(index + needle.length, index + needle.length + SNIPPET_PAD),
      });

      if (hits.length >= 100) break;
    }

    return hits;
  }, [query, messages, mySlot, peerName]);

  const needle = query.trim();

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search messages"
      className="animate-backdrop fixed inset-0 z-50 flex items-start justify-center bg-bg-deep/80
                 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="animate-scale-in flex max-h-[70vh] w-[min(34rem,94vw)] flex-col overflow-hidden
                   rounded-lg border border-border bg-surface shadow-lift"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search size={16} className="shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Search messages"
            spellCheck={false}
            className="w-full bg-transparent text-base text-text placeholder:text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press flex size-8 shrink-0 items-center justify-center rounded-full text-muted
                       hover:bg-surface-raised hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {needle.length < 2 ? (
            <p className="px-3 py-8 text-center text-xs text-muted">
              Type at least two characters.
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted">
              Nothing found in the loaded conversation.
            </p>
          ) : (
            <>
              <p className="px-3 py-1.5 text-[0.625rem] uppercase tracking-wide text-muted">
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </p>
              {results.map(({ message, before, match, after }) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => {
                    onJump(message.id);
                    onClose();
                  }}
                  className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left
                             transition-colors hover:bg-surface-raised"
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        'text-[0.6875rem] font-medium',
                        message.sender === mySlot ? 'text-accent' : 'text-secondary',
                      )}
                    >
                      {message.sender === mySlot ? 'You' : peerName}
                    </span>
                    <span className="text-[0.625rem] text-muted">
                      {new Date(message.createdAt).toLocaleString([], {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </span>
                  <span className="truncate text-xs text-secondary">
                    {before}
                    <mark className="rounded bg-accent-solid/40 px-0.5 text-text">{match}</mark>
                    {after}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
