import { useEffect, useState } from 'react';
import { AdSlot } from './AdSlot';
import { POPULAR } from './guides';
import { SITE } from './content';

/**
 * The furniture around the content: breadcrumbs, bylines, sidebar, cookie bar,
 * share row, tags.
 *
 * None of it does anything. That is the point — it is the scaffolding every
 * site in this genre carries, and a page without it reads as hand-built no
 * matter how good the writing is.
 */

export function A({
  href,
  go,
  children,
  className,
}: {
  href: string;
  go: (href: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        go(href);
      }}
      className={className}
    >
      {children}
    </a>
  );
}

export function Breadcrumbs({
  go,
  trail,
}: {
  go: (href: string) => void;
  trail: readonly { readonly label: string; readonly href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
      {trail.map((crumb, index) => (
        <span key={crumb.label} className="flex items-center gap-1.5">
          {index > 0 && (
            <span aria-hidden className="text-[#4d5566]">
              ›
            </span>
          )}
          {crumb.href !== undefined ? (
            <A href={crumb.href} go={go} className="text-[#6b7484] hover:text-[#f59e0b]">
              {crumb.label}
            </A>
          ) : (
            <span className="text-[#9aa4b4]">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Byline({
  updated,
  published,
  minutes,
  views,
}: {
  updated: string;
  published: string;
  minutes: number;
  views?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-[#1e2530] py-3">
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-full bg-[#2b3442] text-xs font-bold text-[#cdd3dd]"
      >
        RK
      </span>
      <div className="text-xs leading-tight">
        <p className="font-medium text-[#cdd3dd]">Ravi K.</p>
        <p className="text-[#6b7484]">
          Updated {updated} · Published {published}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-3 text-xs text-[#6b7484]">
        <span>{minutes} min read</span>
        {views !== undefined && (
          <>
            <span aria-hidden>·</span>
            <span>{views} views</span>
          </>
        )}
      </div>
    </div>
  );
}

export function ShareRow() {
  const [copied, setCopied] = useState(false);

  const buttons: readonly { readonly label: string; readonly short: string }[] = [
    { label: 'Share on X', short: 'X' },
    { label: 'Share on Reddit', short: 'Reddit' },
    { label: 'Share on WhatsApp', short: 'WhatsApp' },
  ];

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs text-[#6b7484]">Share</span>
      {buttons.map((button) => (
        <a
          key={button.short}
          // Real share links, and the only outbound links on the site. They go
          // nowhere until clicked, so nothing is requested on load.
          href={shareHref(button.short)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={button.label}
          className="rounded border border-[#2b3442] px-2.5 py-1 text-xs text-[#9aa4b4]
                     transition-colors hover:border-[#f59e0b] hover:text-[#f59e0b]"
        >
          {button.short}
        </a>
      ))}
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(window.location.href).then(
            () => {
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
              }, 1500);
            },
            () => undefined,
          );
        }}
        className="rounded border border-[#2b3442] px-2.5 py-1 text-xs text-[#9aa4b4]
                   transition-colors hover:border-[#f59e0b] hover:text-[#f59e0b]"
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}

function shareHref(network: string): string {
  const url = typeof window === 'undefined' ? '' : encodeURIComponent(window.location.href);
  switch (network) {
    case 'X':
      return `https://twitter.com/intent/tweet?url=${url}`;
    case 'Reddit':
      return `https://reddit.com/submit?url=${url}`;
    default:
      return `https://api.whatsapp.com/send?text=${url}`;
  }
}

export function Toc({ items }: { items: readonly { readonly id: string; readonly label: string }[] }) {
  const [open, setOpen] = useState(true);

  return (
    <nav className="mt-6 rounded-md border border-[#232a36] bg-[#10141b]">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-[#cdd3dd]"
      >
        Contents
        <span aria-hidden className="text-xs text-[#6b7484]">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-[#232a36] px-4 py-3 text-sm">
          {items.map((item, index) => (
            <li key={item.id} className="flex gap-2">
              <span aria-hidden className="text-[#4d5566]">
                {index + 1}.
              </span>
              <a href={`#${item.id}`} className="text-[#f59e0b] hover:underline">
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}

export function Tags({ tags }: { tags: readonly string[] }) {
  return (
    <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-[#1e2530] pt-6">
      <span className="mr-1 text-xs uppercase tracking-wide text-[#6b7484]">Tags</span>
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-sm bg-[#161c26] px-2 py-1 text-xs text-[#9aa4b4]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function Sidebar({ go }: { go: (href: string) => void }) {
  return (
    <aside className="w-full shrink-0 lg:w-[336px]">
      <AdSlot placement="rectangle" seed="side-top" />

      <section className="rounded-md border border-[#232a36] bg-[#10141b]">
        <h2 className="border-b border-[#232a36] px-4 py-2.5 text-sm font-semibold text-[#cdd3dd]">
          Popular this week
        </h2>
        <ol className="divide-y divide-[#1a2029]">
          {POPULAR.map((item, index) => (
            <li key={item.href + item.title}>
              <A
                href={item.href}
                go={go}
                className="flex gap-3 px-4 py-3 transition-colors hover:bg-[#141922]"
              >
                <span
                  aria-hidden
                  className="text-base font-bold leading-none text-[#2b3442]"
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm leading-snug text-[#cdd3dd]">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-[#6b7484]">{item.views} views</span>
                </span>
              </A>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 rounded-md border border-[#232a36] bg-[#10141b] p-4">
        <h2 className="text-sm font-semibold text-[#cdd3dd]">Get new codes by email</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-[#9aa4b4]">
          One mail when codes drop. No spam, unsubscribe whenever.
        </p>
        <NewsletterForm />
      </section>

      <div className="mt-6 lg:sticky lg:top-6">
        <AdSlot placement="skyscraper" seed="side-tall" />
      </div>
    </aside>
  );
}

function NewsletterForm() {
  const [value, setValue] = useState('');
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="mt-3 rounded-sm bg-[#12291f] px-3 py-2 text-xs text-[#4ade80]">
        Almost there — check your inbox to confirm.
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.includes('@')) return;
        // Goes nowhere. There is no list, and a subscribe box that made a
        // request would be the only outbound call on the page.
        setDone(true);
      }}
      className="mt-3"
    >
      <label className="sr-only" htmlFor="nl-email">
        Email address
      </label>
      <input
        id="nl-email"
        type="email"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        placeholder="you@example.com"
        className="w-full rounded-sm border border-[#2b3442] bg-[#0f131a] px-3 py-2 text-sm
                   text-[#e8eaed] placeholder:text-[#6b7484] focus:border-[#f59e0b] focus:outline-none"
      />
      <button
        type="submit"
        className="mt-2 w-full rounded-sm bg-[#f59e0b] px-3 py-2 text-sm font-semibold text-[#1a1204]
                   transition-colors hover:bg-[#fbbf24]"
      >
        Subscribe
      </button>
    </form>
  );
}

const COOKIE_KEY = 'mc.consent';

export function CookieBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(COOKIE_KEY) === null) setVisible(true);
    } catch {
      // Storage blocked. Skip the bar rather than showing it on every load.
    }
  }, []);

  if (!visible) return null;

  const dismiss = (value: string) => {
    try {
      localStorage.setItem(COOKIE_KEY, value);
    } catch {
      // Nothing to do; hiding it for this session is enough.
    }
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#232a36] bg-[#0f131a]/97 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 sm:px-8">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-[#9aa4b4]">
          This site uses cookies for basic analytics and to remember your preferences. See our{' '}
          <a href="/privacy" className="text-[#f59e0b] hover:underline">
            privacy policy
          </a>
          .
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              dismiss('rejected');
            }}
            className="rounded border border-[#2b3442] px-3 py-1.5 text-xs text-[#9aa4b4] hover:border-[#4d5566]"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => {
              dismiss('accepted');
            }}
            className="rounded bg-[#f59e0b] px-3 py-1.5 text-xs font-semibold text-[#1a1204] hover:bg-[#fbbf24]"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

export function SiteFooter({ go }: { go: (href: string) => void }) {
  const columns: readonly { readonly heading: string; readonly links: readonly { readonly label: string; readonly href: string }[] }[] =
    [
      {
        heading: 'Guides',
        links: [
          { label: 'Promo codes', href: '/' },
          { label: 'Mech tier list', href: '/mech-arena-tier-list' },
          { label: 'Weapon tier list', href: '/mech-arena-tier-list#weapons' },
          { label: 'Beginner guide', href: '/beginner-guide' },
        ],
      },
      {
        heading: 'Site',
        links: [
          { label: 'About', href: '/about' },
          { label: 'How to redeem', href: '/how-to-redeem' },
          { label: 'Privacy policy', href: '/privacy' },
          { label: 'Disclaimer', href: '/privacy#disclaimer' },
        ],
      },
    ];

  return (
    <footer className="mt-12 border-t border-[#232a36] bg-[#0f131a]">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-12 sm:grid-cols-4 sm:px-8">
        <div>
          <p className="text-base font-bold tracking-tight text-[#e8eaed]">{SITE.name}</p>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-[#6b7484]">{SITE.blurb}</p>
        </div>

        {columns.map((column) => (
          <div key={column.heading}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9aa4b4]">
              {column.heading}
            </h3>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <A href={link.href} go={go} className="text-sm text-[#6b7484] hover:text-[#f59e0b]">
                    {link.label}
                  </A>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[#1a2029]">
        <div className="mx-auto max-w-[1400px] px-4 py-5 text-xs leading-relaxed text-[#4d5566] sm:px-8">
          <p>
            © {new Date().getFullYear()} {SITE.name}. All rights reserved.
          </p>
          <p className="mt-1.5">{SITE.disclaimer} All game images and titles are the property of their respective owners and are used here for informational purposes only.</p>
        </div>
      </div>
    </footer>
  );
}
