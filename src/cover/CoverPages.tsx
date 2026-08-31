import { useState } from 'react';
import {
  EXPIRED_CODES,
  FAQ,
  GENERAL_CODES,
  LAST_CHECKED,
  NEW_PLAYER_CODES,
  NEW_PLAYER_RULE,
  NOT_WORKING_REASONS,
  ONE_PER_DAY,
  REDEEM_STEPS,
  SITE,
  SOURCES,
  formatDate,
  type Code,
} from './content';
import {
  BAND_NAME,
  BEGINNER_TIPS,
  CODE_MECHS,
  GAME_FACTS,
  GUIDES,
  MECHS,
  MECH_TIERS,
  TAGS,
  WEAPON_COUNT,
  WEAPON_TIERS,
  type Tier,
  type TierLabel,
} from './guides';
import { A, Breadcrumbs, Byline, ShareRow, Tags, Toc } from './Chrome';
import { AdSlot } from './AdSlot';
import { CommentBox } from './CommentBox';
import type { SessionReason, SessionStatus } from '@/hooks/useSession';

interface Gate {
  status: SessionStatus;
  reason: SessionReason | null;
  onSubmit: (text: string) => void | Promise<void>;
}

type Go = (href: string) => void;

// --- shared bits -----------------------------------------------------------

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="cv-reveal mt-9 scroll-mt-20 text-xl font-bold tracking-tight text-[#e8eaed]"
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[0.9375rem] leading-[1.7] text-[#9aa4b4]">{children}</p>;
}

function CodeRow({ entry }: { entry: Code }) {
  const [copied, setCopied] = useState(false);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#1a2029] px-3 py-3 last:border-0 sm:px-4">
      <code className="rounded bg-[#1f2836] px-2.5 py-1.5 font-mono text-sm font-semibold tracking-wide text-[#f59e0b]">
        {entry.code}
      </code>

      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm leading-relaxed text-[#e8eaed]">
          {entry.reward}
          {entry.isNew === true && (
            <span className="ml-2 rounded bg-[#f59e0b] px-1.5 py-0.5 align-middle text-[0.625rem] font-bold uppercase text-[#1a1204]">
              New
            </span>
          )}
        </p>
        {entry.note !== undefined && <p className="mt-0.5 text-xs text-[#6b7484]">{entry.note}</p>}
      </div>

      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(entry.code).then(
            () => {
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
              }, 1500);
            },
            () => undefined,
          );
        }}
        className="rounded border border-[#2b3442] px-3 py-1.5 text-xs font-medium text-[#cdd3dd]
                   transition-colors hover:border-[#f59e0b] hover:text-[#f59e0b]"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </li>
  );
}

const TIER_COLOUR: Record<TierLabel, string> = {
  S: 'bg-[#3a1f24] text-[#ff8a8a]',
  A: 'bg-[#3a2d1a] text-[#f5b048]',
  B: 'bg-[#3a3520] text-[#e8d45c]',
  C: 'bg-[#2a3320] text-[#a3cc5c]',
  D: 'bg-[#1f2c33] text-[#68b3c8]',
  E: 'bg-[#232630] text-[#8b93a3]',
  '?': 'bg-[#1c2029] text-[#5f6878]',
};

function TierTable({ tiers }: { tiers: readonly Tier[] }) {
  const colour = TIER_COLOUR;

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-[#232a36]">
      <table className="w-full border-collapse text-left">
        <tbody>
          {tiers.map((row) => (
            <tr key={row.tier} className="border-b border-[#1a2029] last:border-0">
              <th scope="row" className="w-[5.5rem] align-top p-3">
                <span
                  className={`flex size-9 items-center justify-center rounded font-bold ${colour[row.tier]}`}
                >
                  {row.tier}
                </span>
                <span className="mt-1.5 block text-[0.625rem] font-medium uppercase tracking-wide text-[#6b7484]">
                  {BAND_NAME[row.tier]}
                </span>
              </th>
              <td className="p-3 pl-0">
                <div className="flex flex-wrap gap-1.5">
                  {row.entries.map((name) => (
                    <span
                      key={name}
                      className="rounded-sm bg-[#181f2a] px-2 py-1 text-xs font-medium text-[#cdd3dd]"
                    >
                      {name}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[#6b7484]">{row.note}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RelatedGuides({ go, exclude }: { go: Go; exclude?: string }) {
  const items = GUIDES.filter((guide) => guide.href !== exclude);
  return (
    <section className="cv-reveal mt-10 border-t border-[#1e2530] pt-6">
      <h2 className="text-base font-bold text-[#e8eaed]">More Mech Arena guides</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((guide, i) => (
          <A
            key={guide.href}
            href={guide.href}
            go={go}
            style={{ '--cv-delay': `${String(i * 60)}ms` } as React.CSSProperties}
            className="cv-card cv-reveal rounded-md border border-[#232a36] bg-[#10141b] p-4"
          >
            <p className="text-sm font-semibold leading-snug text-[#cdd3dd]">{guide.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#6b7484]">{guide.blurb}</p>
            <p className="mt-2 text-[0.6875rem] text-[#4d5566]">
              Updated {formatDate(guide.updated)}
            </p>
          </A>
        ))}
      </div>
    </section>
  );
}

// --- pages -----------------------------------------------------------------

export function HomePage({ go, gate }: { go: Go; gate: Gate }) {
  return (
    <article>
      <Breadcrumbs
        go={go}
        trail={[{ label: 'Home', href: '/' }, { label: 'Mech Arena' }, { label: 'Promo codes' }]}
      />

      <h1 className="text-2xl font-bold leading-tight tracking-tight text-[#e8eaed] sm:text-[1.75rem]">
        Mech Arena codes (August 2026) — all working promo codes
      </h1>

      <Byline updated={formatDate(LAST_CHECKED)} published="19 November 2025" minutes={4} views="48.2k" />
      <ShareRow />

      <P>
        Plarium hands out Mech Arena promo codes fairly regularly, usually around events and
        updates, and they are worth collecting because a few of them are the cheapest A-Coins and
        Credits you will ever get. Below is every code that still works in August 2026, what each one
        gives you, and the ones that have already died so you stop retrying them.
      </P>
      <P>
        Two rules catch most people out. You can only redeem one code per day, and the new player
        codes have a 24 hour window that closes whether you use it or not. Both are covered further
        down.
      </P>

      <Toc
        items={[
          { id: 'active', label: 'Active codes' },
          { id: 'new-player', label: 'New and returning player codes' },
          { id: 'redeem', label: 'How to redeem' },
          { id: 'not-working', label: 'Why a code might not work' },
          { id: 'expired', label: 'Expired codes' },
          { id: 'faq', label: 'FAQ' },
          { id: 'comments', label: 'Comments' },
        ]}
      />

      <AdSlot placement="leaderboard" />

      <H2 id="active">Active Mech Arena codes</H2>
      <P>
        These work for everyone. Start from the bottom of the list — the oldest codes are the ones
        most likely to expire while you are waiting out the daily limit.
      </P>
      <ul className="mt-4 rounded-md border border-[#232a36] bg-[#141922]">
        {GENERAL_CODES.map((entry) => (
          <CodeRow key={entry.code} entry={entry} />
        ))}
      </ul>

      <div className="mt-4 rounded-md border-l-2 border-[#f59e0b] bg-[#171512] px-4 py-3">
        <p className="text-sm leading-relaxed text-[#cdd3dd]">{ONE_PER_DAY}</p>
      </div>

      <H2 id="new-player">New and returning player codes</H2>
      <P>
        These are the big ones — each grants a Rank 3 mech outright. The catch is in the rule below,
        and it is worth reading twice before you paste anything.
      </P>
      <div className="mt-3 rounded-md border border-[#3a2f1a] bg-[#191510] px-4 py-3">
        <p className="text-sm font-medium leading-relaxed text-[#e0c48a]">{NEW_PLAYER_RULE}</p>
      </div>
      <ul className="mt-4 rounded-md border border-[#232a36] bg-[#141922]">
        {NEW_PLAYER_CODES.map((entry) => (
          <CodeRow key={entry.code} entry={entry} />
        ))}
      </ul>

      <AdSlot placement="in-article" />

      <H2 id="redeem">How to redeem Mech Arena codes</H2>
      <P>
        Codes go in inside the game, not on a website. You need to have finished the tutorial first,
        or the option is not there at all.
      </P>
      <ol className="mt-4 space-y-2.5">
        {REDEEM_STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#1f2836] text-[0.6875rem] font-bold text-[#f59e0b]"
            >
              {index + 1}
            </span>
            <p className="text-sm leading-relaxed text-[#cdd3dd]">{step}</p>
          </li>
        ))}
      </ol>

      <H2 id="not-working">Why a code might not work</H2>
      <ul className="mt-3 space-y-2">
        {NOT_WORKING_REASONS.map((reason) => (
          <li key={reason} className="flex gap-2.5 text-sm leading-relaxed text-[#9aa4b4]">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-[#4d5566]" />
            {reason}
          </li>
        ))}
      </ul>

      <H2 id="expired">Expired Mech Arena codes</H2>
      <P>
        Left up on purpose. Half the comments on any code list are people reposting a code that died
        eight months ago, and a visible dead list cuts that down.
      </P>
      <ul className="mt-4 flex flex-wrap gap-1.5">
        {EXPIRED_CODES.map((code) => (
          <li
            key={code}
            className="rounded-sm bg-[#10141b] px-2 py-1 font-mono text-xs text-[#5a6272] line-through"
          >
            {code}
          </li>
        ))}
      </ul>

      <H2 id="faq">FAQ</H2>
      <dl className="mt-4 space-y-5">
        {FAQ.map((item) => (
          <div key={item.q}>
            <dt className="text-sm font-semibold text-[#cdd3dd]">{item.q}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-[#9aa4b4]">{item.a}</dd>
          </div>
        ))}
      </dl>

      <H2 id="sources">Where new codes come from</H2>
      <ul className="mt-3 space-y-2">
        {SOURCES.map((source) => (
          <li key={source} className="flex gap-2.5 text-sm leading-relaxed text-[#9aa4b4]">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-[#4d5566]" />
            {source}
          </li>
        ))}
      </ul>

      <Tags tags={TAGS} />
      <RelatedGuides go={go} exclude="/" />
      <CommentBox {...gate} />
    </article>
  );
}

export function TierListPage({ go }: { go: Go; gate: Gate }) {
  return (
    <article>
      <Breadcrumbs
        go={go}
        trail={[{ label: 'Home', href: '/' }, { label: 'Mech Arena' }, { label: 'Tier list' }]}
      />
      <h1 className="text-2xl font-bold leading-tight tracking-tight text-[#e8eaed] sm:text-[1.75rem]">
        Mech Arena tier list: every mech and weapon ranked (August 2026)
      </h1>
      <Byline updated="6 August 2026" published="2 March 2026" minutes={8} views="31.7k" />
      <ShareRow />

      <P>
        {MECHS.length} mechs and {WEAPON_COUNT} weapons, ranked. The gap between the top and the
        bottom of either list is large enough that what you pick matters more than how well you aim,
        and the wrong purchase costs credits you will not get back.
      </P>
      <P>
        Both lists use the same six bands. Meta is what you meet in every competitive lobby.
        Off-meta is not weaker, just narrower — several of those beat meta picks on the right setup.
        Usable and Midgame are perfectly fine to run. Early game is exactly what it says, and the
        bottom band is the only part of this page meant as an instruction rather than an opinion.
      </P>

      <Toc
        items={[
          { id: 'mechs', label: 'Mech tier list' },
          { id: 'weapons', label: 'Weapon tier list' },
          { id: 'codes', label: 'Which mech the promo codes give you' },
          { id: 'energy', label: 'Why energy matters more than tier' },
          { id: 'facts', label: 'Mech Arena at a glance' },
        ]}
      />

      <AdSlot placement="leaderboard" seed="tiers" />

      <H2 id="mechs">Mech tier list</H2>
      <TierTable tiers={MECH_TIERS} />

      <H2 id="weapons">Weapon tier list</H2>
      <P>
        Weapons are where most credits get wasted, because the damage number on the card is the least
        useful thing about a weapon. All {WEAPON_COUNT} of them, in the same six bands:
      </P>
      <TierTable tiers={WEAPON_TIERS} />
      <P>
        The bottom band is not a list of situational picks. Autocannons, Pulse Cannons, Carbines,
        Fragment Guns and the rest of that group are simply behind, and if an offer bundles one it is
        worth less than it looks.
      </P>

      <H2 id="codes">Which mech the promo codes give you</H2>
      <P>
        This is worth more than the rest of the page combined if your account is new. You can only
        redeem one new-player code, and the mechs they hand out are four tiers apart:
      </P>
      <div className="mt-4 overflow-hidden rounded-md border border-[#232a36]">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[#151b24]">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#6b7484]">
                Code
              </th>
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#6b7484]">
                Mech granted
              </th>
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#6b7484]">
                Tier
              </th>
            </tr>
          </thead>
          <tbody>
            {CODE_MECHS.map((row, index) => (
              <tr
                key={row.code}
                className={`border-t border-[#1a2029] ${index % 2 === 1 ? 'bg-[#10141b]' : ''}`}
              >
                <td className="px-3 py-2">
                  <code className="font-mono text-xs font-semibold text-[#f59e0b]">{row.code}</code>
                </td>
                <td className="px-3 py-2 text-sm text-[#e8eaed]">Rank 3 {row.mech}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex size-6 items-center justify-center rounded text-[0.6875rem] font-bold ${TIER_COLOUR[row.tier]}`}
                    >
                      {row.tier}
                    </span>
                    <span className="text-xs text-[#9aa4b4]">{BAND_NAME[row.tier]}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 rounded-md border-l-2 border-[#f59e0b] bg-[#171512] px-4 py-3">
        <p className="text-sm leading-relaxed text-[#cdd3dd]">
          <span className="font-semibold text-[#f59e0b]">Short version:</span> use GRASSHOPPER or
          CHILLBOT. Both hand you a meta mech for nothing. ROBOTRUSH gives a Shadow, which is an
          early game mech on 16 energy, and spending your one code on it is the most common
          avoidable mistake a new account makes.
        </p>
      </div>
      <P>
        The codes themselves are on the{' '}
        <A href="/" go={go} className="text-[#f59e0b] hover:underline">
          promo codes page
        </A>
        , along with the general codes anyone can use.
      </P>

      <AdSlot placement="in-article" seed="tiers" />

      <H2 id="energy">Why energy matters more than tier</H2>
      <P>
        Every mech has a maximum weapon energy of 16, 24 or 32, and that number quietly decides more
        than the tier does. A 16-energy mech like Shadow, Lancer or Tengu is locked out of most
        interesting loadouts no matter how it is ranked. A 32-energy mech like Panther, Onyx or
        Gatecrasher carries two real weapons at once, which is usually worth more than a slightly
        better ability.
      </P>
      <P>
        This is also why Paragon stays usable far longer than it should. It is a tutorial mech in
        Common rarity with 32 energy — the same pool the Legendaries get.
      </P>
      <P>
        Range matters as much as tier. A brawler wants short range burst; anything slow and durable
        wants mortars or racks it can fire from behind cover. A close range weapon on a mech that
        cannot close the distance wastes both the weapon and the energy it cost.
      </P>

      <H2 id="facts">Mech Arena at a glance</H2>
      <dl className="mt-4 grid gap-px overflow-hidden rounded-md border border-[#232a36] bg-[#232a36] sm:grid-cols-2">
        {GAME_FACTS.map((fact) => (
          <div key={fact.label} className="flex justify-between gap-4 bg-[#10141b] px-4 py-2.5">
            <dt className="text-sm text-[#6b7484]">{fact.label}</dt>
            <dd className="text-sm font-medium text-[#cdd3dd]">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <Tags tags={TAGS} />
      <RelatedGuides go={go} exclude="/mech-arena-tier-list" />
    </article>
  );
}

export function BeginnerPage({ go }: { go: Go; gate: Gate }) {
  return (
    <article>
      <Breadcrumbs
        go={go}
        trail={[{ label: 'Home', href: '/' }, { label: 'Mech Arena' }, { label: 'Beginner guide' }]}
      />
      <h1 className="text-2xl font-bold leading-tight tracking-tight text-[#e8eaed] sm:text-[1.75rem]">
        Mech Arena beginner guide: what to build first
      </h1>
      <Byline updated="29 July 2026" published="14 January 2026" minutes={6} views="12.4k" />
      <ShareRow />

      <P>
        Everything below is aimed at the first few weeks, where almost all the damage is
        self-inflicted. The single most expensive habit is levelling the gear you start with: those
        credits vanish the moment a higher Gear Hub tier opens, because anything from your top
        available tier beats a fully upgraded beginner mech.
      </P>

      <AdSlot placement="leaderboard" seed="beginner" />

      {BEGINNER_TIPS.map((tip, index) => (
        <section key={tip.title}>
          <H2 id={`tip-${String(index + 1)}`}>
            {index + 1}. {tip.title}
          </H2>
          <P>{tip.body}</P>
          {index === 2 && <AdSlot placement="in-article" seed="beginner" />}
        </section>
      ))}

      <Tags tags={TAGS} />
      <RelatedGuides go={go} exclude="/beginner-guide" />
    </article>
  );
}

export function RedeemPage({ go }: { go: Go; gate: Gate }) {
  return (
    <article>
      <Breadcrumbs
        go={go}
        trail={[{ label: 'Home', href: '/' }, { label: 'Mech Arena' }, { label: 'How to redeem' }]}
      />
      <h1 className="text-2xl font-bold leading-tight tracking-tight text-[#e8eaed] sm:text-[1.75rem]">
        How to redeem Mech Arena promo codes
      </h1>
      <Byline updated={formatDate(LAST_CHECKED)} published="19 November 2025" minutes={3} views="7.1k" />
      <ShareRow />

      <P>
        Mech Arena codes are entered inside the game rather than on a website, which trips people up
        because plenty of other Plarium titles do it the other way round. The promo code screen is
        also locked until the tutorial is finished, so a brand new account cannot use it immediately.
      </P>

      <AdSlot placement="leaderboard" seed="redeem" />

      <H2 id="steps">Step by step</H2>
      <ol className="mt-4 space-y-3">
        {REDEEM_STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1f2836] text-xs font-semibold text-[#f59e0b]"
            >
              {index + 1}
            </span>
            <p className="text-sm leading-relaxed text-[#cdd3dd]">{step}</p>
          </li>
        ))}
      </ol>

      <div className="mt-5 rounded-md border-l-2 border-[#f59e0b] bg-[#171512] px-4 py-3">
        <p className="text-sm leading-relaxed text-[#cdd3dd]">{ONE_PER_DAY}</p>
      </div>

      <H2 id="not-working">Why a code might not work</H2>
      <ul className="mt-3 space-y-2">
        {NOT_WORKING_REASONS.map((reason) => (
          <li key={reason} className="flex gap-2.5 text-sm leading-relaxed text-[#9aa4b4]">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-[#4d5566]" />
            {reason}
          </li>
        ))}
      </ul>

      <AdSlot placement="in-article" seed="redeem" />

      <H2 id="faq">FAQ</H2>
      <dl className="mt-4 space-y-5">
        {FAQ.map((item) => (
          <div key={item.q}>
            <dt className="text-sm font-semibold text-[#cdd3dd]">{item.q}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-[#9aa4b4]">{item.a}</dd>
          </div>
        ))}
      </dl>

      <Tags tags={TAGS} />
      <RelatedGuides go={go} exclude="/how-to-redeem" />
    </article>
  );
}

export function AboutPage({ go }: { go: Go; gate: Gate }) {
  return (
    <article>
      <Breadcrumbs go={go} trail={[{ label: 'Home', href: '/' }, { label: 'About' }]} />
      <h1 className="text-2xl font-bold tracking-tight text-[#e8eaed]">About {SITE.name}</h1>

      <P>
        This started as a notes file of codes that kept getting lost in a Discord server. Putting it
        on a page turned out to be less work than searching the same channel every week, and the
        guides grew out of answering the same three questions over and over.
      </P>
      <P>
        Codes get tried before they go up. Expired ones stay listed rather than being deleted,
        because otherwise the same dead codes get reposted a month later by someone who found them on
        another list.
      </P>
      <P>
        There is no account system and nothing is tracked beyond basic analytics. Comments are stored
        in your own browser rather than on a server, which is why they do not show up for anyone
        else.
      </P>
      <P>{SITE.disclaimer}</P>

      <RelatedGuides go={go} />
    </article>
  );
}

export function PrivacyPage({ go }: { go: Go; gate: Gate }) {
  return (
    <article>
      <Breadcrumbs go={go} trail={[{ label: 'Home', href: '/' }, { label: 'Privacy policy' }]} />
      <h1 className="text-2xl font-bold tracking-tight text-[#e8eaed]">Privacy policy</h1>
      <p className="mt-2 text-xs text-[#6b7484]">Last updated {formatDate(LAST_CHECKED)}</p>

      <H2 id="what-we-collect">What is collected</H2>
      <P>
        No account is required to use this site and none is offered. Nothing you type here is sent to
        a server by us. Comments are stored in your own browser using local storage, which is why
        they are visible to you and not to anyone else, and why clearing your browser data removes
        them.
      </P>

      <H2 id="cookies">Cookies and local storage</H2>
      <P>
        Local storage is used to remember your comment name, the comments you have left, and whether
        you have dismissed the cookie notice. Advertising, where it is served, may set its own
        cookies, which are governed by the advertiser rather than by this site.
      </P>

      <H2 id="third-parties">Third parties</H2>
      <P>
        Advertising slots on this site are served by third parties who may collect usage data
        according to their own policies. Blocking them with an extension or a browser that blocks ads
        by default does not affect anything else on the site.
      </P>

      <H2 id="disclaimer">Disclaimer</H2>
      <P>
        {SITE.disclaimer} Codes are collected from public announcements and community posts, and are
        checked before being listed, but expiry dates are set by the publisher and can change without
        notice. Nothing on this site modifies the game or interacts with your account in any way.
      </P>

      <H2 id="contact">Contact</H2>
      <P>
        Corrections and dead codes are best reported in the comments on the relevant page. They get
        read.
      </P>

      <RelatedGuides go={go} />
    </article>
  );
}

export function NotFoundPage({ go }: { go: Go }) {
  return (
    <article className="py-12 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#6b7484]">Error 404</p>
      <h1 className="mt-2 text-xl font-bold text-[#e8eaed]">Page not found</h1>
      <p className="mt-2 text-sm text-[#9aa4b4]">
        That link is dead, or the page moved when the guides were reorganised.
      </p>
      <p className="mt-6">
        <A
          href="/"
          go={go}
          className="inline-block rounded bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-[#1a1204] transition-colors hover:bg-[#fbbf24]"
        >
          Go to the codes
        </A>
      </p>
      <div className="mt-12 text-left">
        <RelatedGuides go={go} />
      </div>
    </article>
  );
}
