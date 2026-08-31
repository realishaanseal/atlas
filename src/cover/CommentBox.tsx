import { useEffect, useId, useRef, useState } from 'react';
import { SEED_COMMENTS, relativeTime } from './content';
import type { SessionReason, SessionStatus } from '@/hooks/useSession';

interface CommentBoxProps {
  status: SessionStatus;
  reason: SessionReason | null;
  /** Attempts an unlock. Resolves whether it worked or not; see below. */
  onSubmit: (text: string) => void | Promise<void>;
}

interface StoredComment {
  id: string;
  name: string;
  text: string;
  at: number;
}

const STORE_KEY = 'mc.comments';
const NAME_KEY = 'mc.name';

/**
 * Minimum length of an unbroken token before it is worth checking.
 *
 * Anything with a space in it, or shorter than this, is posted straight away
 * without touching the crypto layer. That matters for two reasons: key
 * derivation is two million PBKDF2 rounds and takes about a second on a phone,
 * so running it on every "code worked ty" would make the comment box visibly
 * slow — and every failed attempt counts toward the unlock backoff, so a chatty
 * comment section would eventually lock out the real passphrase.
 *
 * Promo codes run about eight to twelve characters, ordinary comments contain
 * spaces, and the generated passphrase is six hyphenated words and four digits
 * (34 characters at the shortest possible). Sixteen separates them cleanly.
 */
const CHECK_MIN_LENGTH = 16;

const isSingleToken = (text: string): boolean =>
  text.length >= CHECK_MIN_LENGTH && !/\s/.test(text);

function loadStored(): StoredComment[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredComment[]) : [];
  } catch {
    return [];
  }
}

/** Stable colour per name, so the same commenter keeps the same avatar. */
const AVATAR_COLOURS = [
  'bg-[#3a2d1a] text-[#f5b048]',
  'bg-[#1f2c33] text-[#68b3c8]',
  'bg-[#2a3320] text-[#a3cc5c]',
  'bg-[#332030] text-[#cc7fb8]',
  'bg-[#232630] text-[#9aa4b4]',
  'bg-[#33241f] text-[#e08a6a]',
];

const AVATAR_FALLBACK = 'bg-[#232630] text-[#9aa4b4]';

function avatarClass(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length] ?? AVATAR_FALLBACK;
}

/**
 * The comment section, and the way in.
 *
 * Submitting the passphrase here opens the conversation instead of posting.
 * Everything else posts, immediately and for real — the comments persist in
 * localStorage, so the section behaves exactly as a visitor would expect and
 * keeps whatever they wrote when they come back.
 *
 * The important guarantee is the negative one: the passphrase must never end up
 * displayed as a comment. So a submission that reaches the crypto layer is only
 * posted if the answer came back as a definite "that is not the passphrase". If
 * the attempt was refused for any other reason — offline, rate limited, no free
 * device slot — the text is put back in the box and an ordinary-sounding failure
 * is shown, because in every one of those cases the string might be the real
 * passphrase and posting it would put it on the screen in plain sight.
 */
export function CommentBox({ status, reason, onSubmit }: CommentBoxProps) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [mine, setMine] = useState<StoredComment[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [oldestFirst, setOldestFirst] = useState(false);
  const [shown, setShown] = useState(6);

  const nameId = useId();
  const textId = useId();
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // Props are read after an await, so the latest values have to come from refs.
  const mounted = useRef(true);
  const reasonRef = useRef(reason);
  const statusRef = useRef(status);
  reasonRef.current = reason;
  statusRef.current = status;

  useEffect(() => {
    // Reset on every mount, not just the first. StrictMode in development runs
    // mount, unmount, mount — a flag only set to false in the cleanup would stay
    // false for the rest of the session, and every comment typed after that
    // would silently fail to post.
    mounted.current = true;
    setMine(loadStored());
    setName(localStorage.getItem(NAME_KEY) ?? '');
    return () => {
      mounted.current = false;
    };
  }, []);

  const post = (body: string) => {
    const entry: StoredComment = {
      id: `c${String(Date.now())}`,
      name: name.trim().length > 0 ? name.trim().slice(0, 24) : 'Guest',
      text: body,
      at: Date.now(),
    };
    const next = [entry, ...mine].slice(0, 200);
    setMine(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      if (name.trim().length > 0) localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      // Private browsing, or the quota is full. The comment still shows.
    }
  };

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const body = text.trim();
    if (body.length === 0 || busy) return;

    if (!isSingleToken(body)) {
      post(body);
      setText('');
      setNotice(null);
      return;
    }

    // Cleared before the attempt, not after: on a successful unlock this
    // component is torn down mid-flight, and the passphrase should not be
    // sitting in a textarea in the DOM while that happens.
    setText('');
    setBusy(true);
    setNotice(null);

    await onSubmit(body);
    if (!mounted.current) return;

    setBusy(false);
    const why = reasonRef.current;

    // The only branch that posts. Anything else and the text might have been
    // the passphrase, so it goes back in the box rather than onto the page.
    if (statusRef.current !== 'unpaired' && why?.kind === 'bad-code') {
      post(body);
      return;
    }

    setText(body);
    setNotice(
      why?.kind === 'rate-limited' && why.seconds > 0
        ? `Slow down — try again in ${String(why.seconds)}s.`
        : "Couldn't post that. Check your connection and try again.",
    );
  };

  const now = Date.now();
  const all = [
    ...mine.map((entry) => ({
      id: entry.id,
      name: entry.name,
      text: entry.text,
      order: entry.at,
      when: relativeTime(Math.max(1, (now - entry.at) / 60000)),
      replyTo: undefined as string | undefined,
    })),
    ...SEED_COMMENTS.map((entry) => ({
      id: entry.id,
      name: entry.name,
      text: entry.text,
      order: now - entry.agoMinutes * 60000,
      when: relativeTime(entry.agoMinutes),
      replyTo: entry.replyTo,
    })),
  ].sort((a, b) => (oldestFirst ? a.order - b.order : b.order - a.order));

  const visible = all.slice(0, shown);

  return (
    <section id="comments" className="mt-12 border-t border-[#1e2530] pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#e8eaed]">
          {all.length} comments
        </h2>
        <label className="flex items-center gap-2 text-xs text-[#6b7484]">
          Sort
          <select
            value={oldestFirst ? 'old' : 'new'}
            onChange={(event) => {
              setOldestFirst(event.target.value === 'old');
            }}
            className="rounded border border-[#2b3442] bg-[#0f131a] px-2 py-1 text-xs text-[#cdd3dd] focus:border-[#f59e0b] focus:outline-none"
          >
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
          </select>
        </label>
      </div>

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="mt-4 rounded-md border border-[#232a36] bg-[#10141b] p-4"
      >
        <label htmlFor={nameId} className="sr-only">
          Name
        </label>
        <input
          id={nameId}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder="Name (optional)"
          maxLength={24}
          autoComplete="off"
          className="mb-2 w-full rounded-sm border border-[#2b3442] bg-[#0f131a] px-3 py-2 text-sm
                     text-[#e8eaed] placeholder:text-[#6b7484] focus:border-[#f59e0b] focus:outline-none
                     sm:max-w-xs"
        />

        <label htmlFor={textId} className="sr-only">
          Comment
        </label>
        <textarea
          id={textId}
          ref={areaRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            // Enter posts, Shift+Enter makes a new line. Standard everywhere.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit(event);
            }
          }}
          rows={3}
          maxLength={500}
          placeholder="Did the code work? Leave a comment"
          autoComplete="off"
          spellCheck={false}
          className="w-full resize-y rounded-sm border border-[#2b3442] bg-[#0f131a] px-3 py-2 text-sm
                     text-[#e8eaed] placeholder:text-[#6b7484] focus:border-[#f59e0b] focus:outline-none"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#6b7484]">
            {notice ?? 'Be civil. Spam and link drops get removed.'}
          </p>
          <button
            type="submit"
            disabled={busy || text.trim().length === 0}
            className="shrink-0 rounded-sm bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-[#1a1204]
                       transition-colors hover:bg-[#fbbf24] disabled:cursor-not-allowed
                       disabled:bg-[#2b3442] disabled:text-[#6b7484]"
          >
            {busy ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </form>

      <ul className="mt-6 space-y-5">
        {visible.map((entry) => (
          <li key={entry.id} className={entry.replyTo !== undefined ? 'ml-6 sm:ml-11' : ''}>
            <div className="flex gap-3">
              <span
                aria-hidden
                className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase ${avatarClass(entry.name)}`}
              >
                {entry.name.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold text-[#cdd3dd]">{entry.name}</span>{' '}
                  <span className="text-xs text-[#6b7484]">{entry.when}</span>
                </p>
                <p className="mt-0.5 break-words text-sm leading-relaxed text-[#9aa4b4]">
                  {entry.replyTo !== undefined && (
                    <span className="text-[#f59e0b]">@{entry.replyTo} </span>
                  )}
                  {entry.text}
                </p>
                <div className="mt-1.5 flex gap-3 text-[0.6875rem] text-[#4d5566]">
                  <button
                    type="button"
                    onClick={() => {
                      setText((current) =>
                        current.startsWith(`@${entry.name} `) ? current : `@${entry.name} ${current}`,
                      );
                      areaRef.current?.focus();
                    }}
                    className="hover:text-[#9aa4b4]"
                  >
                    Reply
                  </button>
                  <span aria-hidden>·</span>
                  <button type="button" className="hover:text-[#9aa4b4]">
                    Report
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {shown < all.length && (
        <button
          type="button"
          onClick={() => {
            setShown((current) => current + 6);
          }}
          className="mt-6 w-full rounded-sm border border-[#2b3442] py-2.5 text-sm text-[#9aa4b4]
                     transition-colors hover:border-[#f59e0b] hover:text-[#f59e0b]"
        >
          Load more comments ({all.length - shown})
        </button>
      )}
    </section>
  );
}
