import { useState } from 'react';

/**
 * Ad placements.
 *
 * Two things about the structure took a wrong version each to get right.
 *
 * First: the creative cannot live inside the `<ins class="adsbygoogle">`
 * element. Content blockers do not wait to see whether an ad loads — Brave,
 * uBlock and every list they ship hide that selector outright, so anything
 * nested in it disappears too. The creative therefore sits in a plain container
 * whose class names match no filter list, with an empty `<ins>` alongside it
 * carrying the client and slot attributes for anyone reading view-source.
 *
 * Second: the creatives were originally dark saturated gradients, which is not
 * what advertising looks like. A real display unit is an iframe served by the
 * ad network, so it carries the advertiser's own styling — and that is almost
 * always a white card with dark text, a small logo, a plain CTA and the
 * AdChoices marker in the corner. On a dark page the ad is meant to look like a
 * foreign object pasted in, because that is exactly what it is. Matching the
 * site's palette was the giveaway.
 *
 * No ad script and no image requests: every creative is CSS and text. The
 * click-through URLs are real, but they are plain anchors, so nothing leaves the
 * origin until somebody actually clicks one.
 */

type Placement = 'leaderboard' | 'rectangle' | 'skyscraper' | 'in-article';

/** Publisher id. Format is real; the account is not. */
const AD_CLIENT = 'ca-pub-4362817750913684';

const SLOT_IDS: Record<Placement, string> = {
  leaderboard: '7318204465',
  rectangle: '2946130887',
  skyscraper: '5501773219',
  'in-article': '9084362551',
};

const MIN_HEIGHT: Record<Placement, number> = {
  leaderboard: 110,
  rectangle: 250,
  skyscraper: 420,
  'in-article': 180,
};

interface Creative {
  readonly brand: string;
  /** Shown under the headline the way a display URL is. */
  readonly domain: string;
  readonly headline: string;
  readonly sub: string;
  readonly cta: string;
  readonly href: string;
  /** Brand colour, used only for the logo tile and the CTA. */
  readonly accent: string;
  readonly onAccent: string;
}

/**
 * The pool.
 *
 * Deliberately mostly unrelated to the site's subject. Programmatic networks
 * fill slots from whatever is bidding, so a page about a mobile game shows food
 * delivery and web hosting far more often than it shows other games. A site
 * where every ad is neatly on-topic looks curated, which is the opposite of how
 * advertising works.
 *
 * Categories left out on purpose: gambling, crypto trading, loans, dating and
 * weight loss. All of them are everywhere in the real ad ecosystem, and all of
 * them are ones where an ad somebody actually clicked could do harm.
 *
 * Taglines stay general rather than quoting prices or discounts. A fabricated
 * "70% off" is the one thing here that could be checked and found wrong.
 */
const CREATIVES: readonly Creative[] = [
  {
    brand: 'RAID: Shadow Legends',
    domain: 'plarium.com',
    headline: 'Collect over 900 champions',
    sub: 'Free to play on mobile and PC, from the makers of Mech Arena.',
    cta: 'Install',
    href: 'https://plarium.com/en/games/raid-shadow-legends/',
    accent: '#7a2b6b',
    onAccent: '#ffffff',
  },
  {
    brand: 'Swiggy',
    domain: 'swiggy.com',
    headline: 'Dinner sorted in minutes',
    sub: 'Thousands of restaurants delivering near you.',
    cta: 'Order now',
    href: 'https://www.swiggy.com',
    accent: '#fc8019',
    onAccent: '#ffffff',
  },
  {
    brand: 'Hostinger',
    domain: 'hostinger.in',
    headline: 'Put your project online',
    sub: 'Hosting, domains and one-click installs.',
    cta: 'See plans',
    href: 'https://www.hostinger.in',
    accent: '#673de6',
    onAccent: '#ffffff',
  },
  {
    brand: 'NordVPN',
    domain: 'nordvpn.com',
    headline: 'Play on public Wi-Fi safely',
    sub: 'Encrypted connection on up to 10 devices at once.',
    cta: 'Learn more',
    href: 'https://nordvpn.com',
    accent: '#2f6fe0',
    onAccent: '#ffffff',
  },
  {
    brand: 'Duolingo',
    domain: 'duolingo.com',
    headline: 'Fifteen minutes a day',
    sub: 'Learn a language free, on your phone.',
    cta: 'Install',
    href: 'https://www.duolingo.com',
    accent: '#58cc02',
    onAccent: '#ffffff',
  },
  {
    brand: 'boAt',
    domain: 'boat-lifestyle.com',
    headline: 'Earbuds built for gaming',
    sub: 'Low latency mode and long battery life.',
    cta: 'Shop',
    href: 'https://www.boat-lifestyle.com',
    accent: '#e11d48',
    onAccent: '#ffffff',
  },
  {
    brand: 'Coursera',
    domain: 'coursera.org',
    headline: 'Learn Python from scratch',
    sub: 'Courses from universities, at your own pace.',
    cta: 'Start free',
    href: 'https://www.coursera.org',
    accent: '#0056d2',
    onAccent: '#ffffff',
  },
  {
    brand: 'G2A',
    domain: 'g2a.com',
    headline: 'Game keys and gift cards',
    sub: 'Marketplace with instant digital delivery.',
    cta: 'Browse',
    href: 'https://www.g2a.com',
    accent: '#f26722',
    onAccent: '#ffffff',
  },
  {
    brand: 'Myntra',
    domain: 'myntra.com',
    headline: 'End of season styles',
    sub: 'Thousands of brands, easy returns.',
    cta: 'Shop now',
    href: 'https://www.myntra.com',
    accent: '#ff3f6c',
    onAccent: '#ffffff',
  },
  {
    brand: 'Canva',
    domain: 'canva.com',
    headline: 'Design anything, free',
    sub: 'Thumbnails, posters and banners in the browser.',
    cta: 'Try it',
    href: 'https://www.canva.com',
    accent: '#00c4cc',
    onAccent: '#052b2e',
  },
  {
    brand: 'Naukri',
    domain: 'naukri.com',
    headline: 'Internships for students',
    sub: 'Upload a CV and let recruiters find you.',
    cta: 'Search jobs',
    href: 'https://www.naukri.com',
    accent: '#4a90d9',
    onAccent: '#ffffff',
  },
  {
    brand: 'Amazon',
    domain: 'amazon.in',
    headline: 'Mobile game controllers',
    sub: 'Clip-on gamepads for Android and iOS.',
    cta: 'Shop now',
    href: 'https://www.amazon.in/s?k=mobile+game+controller',
    accent: '#ff9900',
    onAccent: '#111111',
  },
  {
    brand: 'Discord',
    domain: 'discord.com',
    headline: 'Join the Mech Arena server',
    sub: 'Patch notes, code drops and squad finding.',
    cta: 'Open',
    href: 'https://discord.com/invite/bHEbyH9',
    accent: '#5865f2',
    onAccent: '#ffffff',
  },
  {
    brand: 'Notion',
    domain: 'notion.so',
    headline: 'Notes that keep up with you',
    sub: 'Free for personal use, works offline.',
    cta: 'Get started',
    href: 'https://www.notion.so',
    accent: '#191919',
    onAccent: '#ffffff',
  },
];

/** Text ads, the other half of what programmatic advertising looks like. */
const TEXT_ADS: readonly { readonly title: string; readonly site: string; readonly href: string }[] =
  [
    { title: 'Compare broadband plans in your area', site: 'jio.com', href: 'https://www.jio.com' },
    {
      title: 'Refurbished phones with a one-year warranty',
      site: 'cashify.in',
      href: 'https://www.cashify.in',
    },
    { title: 'Student laptop deals', site: 'flipkart.com', href: 'https://www.flipkart.com' },
    {
      title: 'Free online courses with certificates',
      site: 'coursera.org',
      href: 'https://www.coursera.org',
    },
  ];

/**
 * Rotates between page loads the way an ad network does, but stays fixed for the
 * life of the session so slots do not churn as you navigate.
 */
const SESSION_OFFSET = Math.floor(Math.random() * CREATIVES.length);

function pick(seed: string): Creative {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return CREATIVES[(Math.abs(hash) + SESSION_OFFSET) % CREATIVES.length] ?? CREATIVES[0]!;
}

/**
 * The AdChoices marker: a small blue triangle with an arrow, top right.
 *
 * This is the single most recognisable signature of a programmatic ad, and its
 * absence is more noticeable than any amount of layout detail.
 */
function AdChoices() {
  return (
    <span className="absolute right-0 top-0 flex items-center gap-1 bg-white/90 pl-1">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
        <path d="M0 0h12L0 12z" fill="#4285f4" />
        <path d="M2.6 2.1h1.5v1.5H2.6z" fill="#ffffff" />
        <path d="M2.6 4.4h1.5v3.2H2.6z" fill="#ffffff" />
      </svg>
      <span className="pr-0.5 text-[0.5625rem] leading-none text-[#5f6368]">✕</span>
    </span>
  );
}

export function AdSlot({ placement, seed = '' }: { placement: Placement; seed?: string }) {
  const [closed, setClosed] = useState(false);
  const minHeight = MIN_HEIGHT[placement];

  // Roughly a third of in-article slots come through as text blocks.
  const asText = placement === 'in-article' && (SESSION_OFFSET + seed.length) % 3 === 0;

  if (closed) {
    return (
      <div
        className="my-6 flex items-center justify-center rounded-sm border border-dashed border-[#1e2530]"
        style={{ minHeight: 90 }}
        aria-hidden
      />
    );
  }

  return (
    // Class names here are deliberately bland. `ad-`, `-ads`, `sponsor` and
    // `banner` all appear in filter lists as substring matches, and any of them
    // would get this container hidden on the browsers most likely to be used.
    <aside className="promo-unit my-6 w-full" role="presentation">
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span className="text-[0.625rem] uppercase tracking-[0.12em] text-[#4d5566]">
          Advertisement
        </span>
        <button
          type="button"
          onClick={() => {
            setClosed(true);
          }}
          aria-label="Close"
          className="px-1 text-[0.625rem] leading-none text-[#4d5566] hover:text-[#9aa4b4]"
        >
          ✕
        </button>
      </div>

      {asText ? <TextBlock /> : <Banner placement={placement} seed={seed} minHeight={minHeight} />}

      {/* Kept empty and hidden. Blockers remove it by selector; without one it
          would otherwise reserve blank space under the creative. */}
      <ins
        className="adsbygoogle"
        style={{ display: 'none' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={SLOT_IDS[placement]}
        data-ad-format={placement === 'in-article' ? 'fluid' : 'auto'}
        data-full-width-responsive="true"
      />
    </aside>
  );
}

function Banner({
  placement,
  seed,
  minHeight,
}: {
  placement: Placement;
  seed: string;
  minHeight: number;
}) {
  const creative = pick(placement + seed);
  const wide = placement === 'leaderboard';

  return (
    <a
      href={creative.href}
      target="_blank"
      rel="nofollow sponsored noopener noreferrer"
      className={`group relative overflow-hidden rounded-sm border border-[#dadce0] bg-white ${
        wide ? 'flex items-center gap-4 p-4' : 'flex flex-col justify-center p-4'
      }`}
      style={{ minHeight }}
    >
      <AdChoices />

      <span className={wide ? 'flex min-w-0 flex-1 items-center gap-4' : 'block'}>
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded text-base font-black"
          style={{ backgroundColor: creative.accent, color: creative.onAccent }}
        >
          {creative.brand.charAt(0)}
        </span>

        <span className={wide ? 'min-w-0' : 'mt-3 block'}>
          <span className="block text-[0.9375rem] font-medium leading-snug text-[#202124]">
            {creative.headline}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-[#5f6368]">
            {creative.sub}
          </span>
          <span className="mt-1 block text-xs text-[#1e8e3e]">{creative.domain}</span>
        </span>
      </span>

      <span
        className={`${wide ? 'shrink-0' : 'mt-4 inline-block'} rounded-sm px-4 py-2 text-sm font-medium`}
        style={{ backgroundColor: creative.accent, color: creative.onAccent }}
      >
        {creative.cta}
      </span>

      {!wide && (
        <span className="absolute bottom-2 left-4 text-[0.5625rem] text-[#80868b]">
          Ads by Google
        </span>
      )}
    </a>
  );
}

function TextBlock() {
  const start = SESSION_OFFSET % TEXT_ADS.length;
  const items = [0, 1, 2].map((offset) => TEXT_ADS[(start + offset) % TEXT_ADS.length]!);

  return (
    <div className="relative rounded-sm border border-[#dadce0] bg-white p-4">
      <AdChoices />
      <p className="mb-3 text-[0.6875rem] text-[#80868b]">Ads by Google</p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.title}>
            <a
              href={item.href}
              target="_blank"
              rel="nofollow sponsored noopener noreferrer"
              className="block"
            >
              <span className="block text-sm text-[#1a0dab] hover:underline">{item.title}</span>
              <span className="block text-xs text-[#1e8e3e]">{item.site}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
