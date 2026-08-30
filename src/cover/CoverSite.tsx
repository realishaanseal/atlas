import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { SITE } from './content';
import {
  AboutPage,
  BeginnerPage,
  HomePage,
  NotFoundPage,
  PrivacyPage,
  RedeemPage,
  TierListPage,
} from './CoverPages';
import { A, CookieBar, Sidebar, SiteFooter } from './Chrome';
import type { SessionReason, SessionStatus } from '@/hooks/useSession';
import './cover.css';

/**
 * The public face of the site.
 *
 * Everything a visitor sees lives here, and nothing here imports anything from
 * the conversation half of the app — deliberately, because this module is what
 * ends up in the eagerly loaded bundle. If it pulled in the chat, the crypto
 * layer or `@/config`, the strings from all three would ship to every visitor
 * and be readable in the network tab, which would defeat the whole exercise.
 *
 * The only shared imports are `useSession`'s TYPES, erased at compile time, and
 * the session callbacks passed in as props.
 */

/**
 * Where the first-run passphrase screen lives.
 *
 * It has to exist somewhere: if the key-derivation document is ever deleted —
 * as it is during a passphrase rotation — a new one must be established, and
 * the comment box deliberately refuses to do it. Anything typed there is either
 * a comment or an unlock attempt, never a setup, so a visitor cannot claim the
 * workspace by being the first to guess that it is unclaimed.
 *
 * Unlisted rather than secret: nothing links to it, and it renders a 404 unless
 * a passphrase genuinely needs establishing. It is not a security boundary —
 * the passphrase is. Change it if you like; nothing else references it.
 */
export const SETUP_PATH = '/admin/restore';

const LockScreen = lazy(() => import('@/pages/LockScreen'));

type RouteName =
  | 'home'
  | 'redeem'
  | 'tiers'
  | 'beginner'
  | 'about'
  | 'privacy'
  | 'setup'
  | 'missing';

const ROUTES: Record<string, RouteName> = {
  '/': 'home',
  '/how-to-redeem': 'redeem',
  '/mech-arena-tier-list': 'tiers',
  // The weapons list used to be its own page and is now a section of the tier
  // list. The old path still resolves rather than 404ing, which is what any
  // site does after merging two pages.
  '/best-weapons': 'tiers',
  '/beginner-guide': 'beginner',
  '/about': 'about',
  '/privacy': 'privacy',
  [SETUP_PATH]: 'setup',
};

function parse(pathname: string): RouteName {
  const path = pathname.replace(/\/+$/, '') || '/';
  return ROUTES[path] ?? 'missing';
}

const TITLES: Record<RouteName, string> = {
  home: `Mech Arena codes (August 2026) — all working promo codes | ${SITE.name}`,
  redeem: `How to redeem Mech Arena promo codes | ${SITE.name}`,
  tiers: `Mech Arena tier list: every mech and weapon ranked | ${SITE.name}`,
  beginner: `Mech Arena beginner guide | ${SITE.name}`,
  about: `About | ${SITE.name}`,
  privacy: `Privacy policy | ${SITE.name}`,
  setup: SITE.name,
  missing: `Page not found | ${SITE.name}`,
};

interface CoverSiteProps {
  status: SessionStatus;
  reason: SessionReason | null;
  onSubmit: (text: string) => void | Promise<void>;
  /** Asks the session layer whether a passphrase exists. Costs network. */
  onDetect: () => void | Promise<void>;
  /** True while the site is animating away after a successful unlock. */
  exiting?: boolean;
}

export default function CoverSite({
  status,
  reason,
  onSubmit,
  onDetect,
  exiting = false,
}: CoverSiteProps) {
  const [route, setRoute] = useState<RouteName>(() =>
    parse(typeof window === 'undefined' ? '/' : window.location.pathname),
  );

  /**
   * Relaxes the app's fixed-height, overflow-hidden shell while the site is up.
   *
   * Dropped the moment the exit animation starts rather than on unmount. The
   * site outlives a successful unlock by one animation so it can fade out over
   * the conversation, and for those few hundred milliseconds the conversation is
   * already mounted underneath — with `height: auto` still in force it would lay
   * itself out taller than the screen before snapping back.
   */
  useEffect(() => {
    if (exiting) return;
    const root = document.documentElement;
    root.classList.add('cover');
    return () => {
      root.classList.remove('cover');
    };
  }, [exiting]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(parse(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  useEffect(() => {
    document.title = TITLES[route];
  }, [route]);

  const go = useCallback((href: string) => {
    // Fragment links stay on the page; the browser handles the scroll.
    if (href.startsWith('#')) return;
    const [path, hash] = href.split('#');
    window.history.pushState({}, '', href);
    setRoute(parse(path ?? '/'));
    if (hash === undefined) {
      window.scrollTo({ top: 0 });
    } else {
      // Let the new page mount before looking for the anchor.
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView();
      });
    }
  }, []);

  /**
   * The only thing on the whole site that reaches the network before a
   * submission, and it fires only on a route nothing links to.
   */
  useEffect(() => {
    if (route === 'setup' && status === 'idle') void onDetect();
  }, [route, status, onDetect]);

  const gate = { status, reason, onSubmit };

  if (route === 'setup') {
    if (status === 'idle' || status === 'checking') return <div className="min-h-dvh" />;
    if (status !== 'setup' && status !== 'working') {
      return (
        <Shell route={route} go={go}>
          <NotFoundPage go={go} />
        </Shell>
      );
    }
    return (
      <div className="min-h-dvh">
        <Suspense fallback={<div className="min-h-dvh" />}>
          <LockScreen status={status} reason={reason} onSubmit={onSubmit} />
        </Suspense>
      </div>
    );
  }

  return (
    <Shell route={route} go={go}>
      {route === 'home' && <HomePage go={go} gate={gate} />}
      {route === 'redeem' && <RedeemPage go={go} gate={gate} />}
      {route === 'tiers' && <TierListPage go={go} gate={gate} />}
      {route === 'beginner' && <BeginnerPage go={go} gate={gate} />}
      {route === 'about' && <AboutPage go={go} gate={gate} />}
      {route === 'privacy' && <PrivacyPage go={go} gate={gate} />}
      {route === 'missing' && <NotFoundPage go={go} />}
    </Shell>
  );
}

const NAV: readonly { readonly href: string; readonly label: string; readonly route: RouteName }[] = [
  { href: '/', label: 'Codes', route: 'home' },
  { href: '/mech-arena-tier-list', label: 'Tier list', route: 'tiers' },
  { href: '/beginner-guide', label: 'Guides', route: 'beginner' },
];

function Shell({
  route,
  go,
  children,
}: {
  route: RouteName;
  go: (href: string) => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Thin accent strip. Every site in this genre has one and it is the
          cheapest thing that stops a header looking like a wireframe. */}
      <div aria-hidden className="h-0.5 bg-gradient-to-r from-[#f59e0b] via-[#c2410c] to-[#f59e0b]" />

      <header className="sticky top-0 z-30 border-b border-[#232a36] bg-[#0f131a]/97 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3.5 sm:px-8">
          <A href="/" go={go} className="flex shrink-0 items-center gap-2">
            <Mark />
            <span className="text-base font-extrabold tracking-tight text-[#e8eaed]">
              {SITE.name}
            </span>
          </A>

          <nav className="ml-auto hidden items-center gap-5 text-sm sm:flex">
            {NAV.map((item) => (
              <A
                key={item.href}
                href={item.href}
                go={go}
                className={
                  route === item.route
                    ? 'font-semibold text-[#f59e0b]'
                    : 'text-[#9aa4b4] transition-colors hover:text-[#e8eaed]'
                }
              >
                {item.label}
              </A>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => {
              setMenuOpen((open) => !open);
            }}
            aria-expanded={menuOpen}
            aria-label="Menu"
            className="ml-auto rounded border border-[#2b3442] px-2.5 py-1.5 text-xs text-[#9aa4b4] sm:hidden"
          >
            Menu
          </button>
        </div>

        {menuOpen && (
          <nav className="border-t border-[#232a36] sm:hidden">
            {NAV.map((item) => (
              <A
                key={item.href}
                href={item.href}
                go={go}
                className="block border-b border-[#1a2029] px-4 py-3 text-sm text-[#cdd3dd] last:border-0"
              >
                {item.label}
              </A>
            ))}
          </nav>
        )}
      </header>

      <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-7 sm:px-8">
        <div className="flex flex-col gap-10 lg:flex-row xl:gap-14">
          <main className="min-w-0 flex-1">{children}</main>
          <Sidebar go={go} />
        </div>
      </div>

      <SiteFooter go={go} />
      <CookieBar />
    </div>
  );
}

/** Site mark. A blocky chevron, generic enough to be any gaming site. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden focusable="false">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#f59e0b" />
      <path
        d="M8 7l5 5-5 5"
        stroke="#1a1204"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M15 16h2" stroke="#1a1204" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
