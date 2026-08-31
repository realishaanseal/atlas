/* eslint-disable react-refresh/only-export-components -- dev-only harness, never HMR-critical */
/**
 * Dev-only visual harness for the redesign.
 *
 * Never shipped: main.tsx only imports this behind `import.meta.env.DEV` and a
 * `?preview` query flag, so the production build dead-code-eliminates the whole
 * branch and this chunk is never emitted (verify:bundle confirms it).
 *
 * `/?preview`         interactive — real components, real motion
 * `/?preview&still`   a static "still life" of the material treatments, for
 *                     screenshots in environments where the rAF loop is frozen
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bell, Palette, Search, Sparkles, X, Zap } from 'lucide-react';
import { MotionProvider } from '@/motion/config';
import { ThemeProvider } from '@/hooks/useTheme';
import { CustomEmojiProvider } from '@/hooks/useCustomEmoji';
import { MentionNamesProvider } from '@/hooks/useMentionNames';
import { Header } from '@/components/layout/Header';
import { NotificationSettingsModal } from '@/components/settings/NotificationSettingsModal';
import { Overlay } from '@/components/ui/Overlay';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/utils/cn';
import type { PeerPresence } from '@/services/presence';

const peer: PeerPresence = { online: true, lastSeen: Date.now(), typing: false };
const noop = () => undefined;

function Bubble({ mine, children }: { mine: boolean; children: string }) {
  return (
    <div className={cn('flex w-full', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[70%] rounded-lg px-4 py-2.5 text-[0.9375rem] leading-relaxed',
          mine
            ? 'rounded-br-xs bg-gradient-to-b from-accent-solid to-accent-solid-deep text-white shadow-glow'
            : 'rounded-bl-xs border border-hairline bg-surface/80 text-text backdrop-blur-md depth',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A static mock of each surface, no motion — for screenshots. */
function StillLife() {
  return (
    <div className="mx-auto max-w-[850px] space-y-8 px-4 py-8">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">Message bubbles</p>
        <Bubble mine={false}>Hey — did the new build go out?</Bubble>
        <Bubble mine>Just pushed it. Grain, springs, layered glass, the lot.</Bubble>
        <Bubble mine={false}>The panels feel like actual glass now. Nice.</Bubble>
      </section>

      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">Menu panel</p>
        <div className="glass w-60 overflow-hidden rounded-md border border-hairline shadow-raised">
          {[
            { icon: Sparkles, label: 'Custom emoji' },
            { icon: Palette, label: 'Theme' },
            { icon: Bell, label: 'Notifications' },
            { icon: Search, label: 'Search' },
            { icon: Zap, label: 'Quick reactions' },
          ].map((it) => (
            <div
              key={it.label}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-secondary"
            >
              <it.icon size={15} aria-hidden />
              {it.label}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">Modal / sheet surface</p>
        <div className="w-[min(28rem,94vw)] overflow-hidden rounded-lg border border-hairline bg-surface shadow-raised">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <h2 className="text-sm font-medium text-text">Notifications</h2>
            <span className="flex size-8 items-center justify-center rounded-full text-muted">
              <X size={16} aria-hidden />
            </span>
          </div>
          <div className="space-y-1 p-2">
            {[
              ['Alert sound', true],
              ['Unread badge in tab', false],
            ].map(([label, on]) => (
              <div key={label as string} className="flex items-center gap-3 rounded-md px-2 py-2.5">
                <Bell size={17} className={on ? 'text-accent' : 'text-muted'} aria-hidden />
                <span className="flex-1 text-sm text-text">{label}</span>
                <span
                  className={cn(
                    'relative h-5 w-9 rounded-full',
                    on ? 'bg-accent-solid' : 'bg-surface-raised ring-1 ring-inset ring-hairline',
                  )}
                >
                  <span
                    className="absolute top-0.5 size-4 rounded-full bg-white shadow-contact"
                    style={{ left: on ? '1.125rem' : '0.125rem' }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">Buttons</p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-text depth">
            Secondary
          </span>
          <span className="rounded-md bg-gradient-to-b from-accent-solid to-accent-solid-deep px-3 py-2 text-sm font-medium text-white shadow-glow">
            Primary
          </span>
        </div>
      </section>
    </div>
  );
}

function Interactive() {
  const [notif, setNotif] = useState(false);
  const [sound, setSound] = useState(true);
  const [inTab, setInTab] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [modal, setModal] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <Header
        peer={peer}
        connection="online"
        onVoiceCall={noop}
        onVideoCall={noop}
        peerName="Alex"
        onRename={noop}
        theirNameForMe={null}
        pins={[]}
        onJumpToPin={noop}
        onUnpin={noop}
        pinLiveIds={new Set()}
        notifSound={sound}
        notifInTab={inTab}
        onToggleNotifSound={() => { setSound((s) => !s); }}
        onToggleNotifInTab={() => { setInTab((s) => !s); }}
        canArchive
        onOpenArchive={noop}
        onOpenBulkReactions={noop}
        onOpenSearch={noop}
      />

      <div className="mx-auto flex w-full max-w-[850px] flex-1 flex-col gap-2 overflow-y-auto px-4 py-6">
        <Bubble mine={false}>Hey — did the new build go out?</Bubble>
        <Bubble mine>Just pushed it. Grain, springs, the lot.</Bubble>
        <Bubble mine={false}>The panels feel like actual glass now.</Bubble>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => { setNotif(true); }} className="press rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-text depth">
            Notifications modal
          </button>
          <button type="button" onClick={() => { setSheet(true); }} className="press rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-text depth">
            Bottom sheet
          </button>
          <button type="button" onClick={() => { setModal(true); }} className="press rounded-md bg-gradient-to-b from-accent-solid to-accent-solid-deep px-3 py-2 text-sm font-medium text-white shadow-glow">
            Plain Overlay
          </button>
        </div>
      </div>

      <NotificationSettingsModal
        open={notif}
        sound={sound}
        inTab={inTab}
        onToggleSound={() => { setSound((s) => !s); }}
        onToggleInTab={() => { setInTab((s) => !s); }}
        onClose={() => { setNotif(false); }}
      />

      <Sheet open={sheet} onClose={() => { setSheet(false); }} label="Demo sheet" className="max-w-[560px]">
        <div className="px-5 pb-6 pt-2">
          <h2 className="text-base font-semibold text-text">A bottom sheet</h2>
          <p className="mt-1 text-sm text-secondary">
            Flick it down, tap the dim, or press Escape. Springs back if you do not pull far enough.
          </p>
          <div className="mt-4 space-y-2">
            {['One', 'Two', 'Three', 'Four'].map((r) => (
              <div key={r} className="rounded-md border border-hairline bg-surface-raised px-3 py-2.5 text-sm">
                {r}
              </div>
            ))}
          </div>
        </div>
      </Sheet>

      <Overlay open={modal} onClose={() => { setModal(false); }} label="Demo modal">
        <div className="p-5">
          <h2 className="text-base font-semibold text-text">Centred modal</h2>
          <p className="mt-1 text-sm text-secondary">
            Scales out of the surface, backdrop blurs in behind it.
          </p>
          <button type="button" onClick={() => { setModal(false); }} className="press mt-4 rounded-md bg-gradient-to-b from-accent-solid to-accent-solid-deep px-3 py-2 text-sm font-medium text-white shadow-glow">
            Done
          </button>
        </div>
      </Overlay>
    </div>
  );
}

/** A throwaway key so CustomEmojiProvider has something to hold; it never
 *  decrypts a real pack in the harness. */
function useFakeKey() {
  const [key, setKey] = useState<CryptoKey | null>(null);
  useEffect(() => {
    void crypto.subtle
      .generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      .then(setKey);
  }, []);
  return key;
}

function Preview() {
  const still = new URLSearchParams(window.location.search).has('still');
  const key = useFakeKey();
  if (still) {
    return (
      <MotionProvider>
        <ThemeProvider>
          <StillLife />
        </ThemeProvider>
      </MotionProvider>
    );
  }
  if (!key) return null;
  return (
    <MotionProvider>
      <ThemeProvider>
        <CustomEmojiProvider cryptoKey={key}>
          <MentionNamesProvider mySlot="a" peerName="Alex">
            <Interactive />
          </MentionNamesProvider>
        </CustomEmojiProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}

export function mountPreview(container: HTMLElement) {
  // `?reduce` also forces the reduced-motion media query so useReducedMotion()
  // picks it up, not just MotionConfig.
  if (new URLSearchParams(window.location.search).has('reduce')) {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.includes('prefers-reduced-motion')
        ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList)
        : real(q);
  }
  createRoot(container).render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  );
}
