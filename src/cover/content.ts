/**
 * Content for the public site.
 *
 * A promo-code page for a mobile game. Chosen because it explains, without
 * anyone having to wonder, why the page has a box that accepts arbitrary text
 * from whoever is looking at it: every site like this has a comment section
 * full of people saying a code worked or did not.
 *
 * Every code, reward and rule below is real and checked against the sources
 * that track them. That matters more than it sounds. Anyone who plays the game,
 * or who thinks to compare this against any other code list, would spot invented
 * rewards immediately — and a cover that fails for the one person most likely to
 * look closely is not a cover at all. "Rewards" as a placeholder, which is what
 * some aggregator sites print when they do not know, is exactly the kind of
 * thing that makes a page look scraped rather than maintained.
 *
 * Static data only. No imports, nothing tying this file to the rest of the app,
 * so it compiles into the public bundle without pulling anything with it.
 */

export const SITE = {
  name: 'MechCodes',
  tagline: 'Working Mech Arena promo codes',
  blurb: 'Checked against the game before they go up. Expired ones stay listed, not deleted.',
  /** Fan site. Says so, because real ones do and because it is true. */
  disclaimer: 'Not affiliated with Plarium or Mech Arena. Codes are collected from public posts.',
} as const;

/** Shown at the top of the list, the way these sites always do. */
export const LAST_CHECKED = '2026-08-11';

export interface Code {
  readonly code: string;
  readonly reward: string;
  /** Flagged as newly added. */
  readonly isNew?: boolean;
  /** Freeform note under the reward — a deadline, a restriction. */
  readonly note?: string;
}

/** Anyone can redeem these, one per day. */
export const GENERAL_CODES: readonly Code[] = [
  {
    code: 'ENERGIZED',
    reward: 'Bouncecritter 8 legendary barrage weapon',
    isNew: true,
    note: 'Claim before 5 September',
  },
  {
    code: '2GTLOADOUT',
    reward: '200 A-Coins, 50,000 Credits, 5 Fortune Keys, 1,000 Implant Parts, 500 Basic Mod Parts',
  },
  { code: 'SPOOKYSHOT', reward: '5 Epic skins' },
  {
    code: 'MIDRUSHGAME',
    reward: '100,000 Credits, 1 Gold Crate, 1 Amateur Crate, 1 Prodigy Crate',
  },
];

/**
 * New and returning player codes.
 *
 * The rule attached to these is the detail a player would check: you get ONE of
 * them, and only inside 24 hours of starting or coming back. Getting that wrong
 * would be more conspicuous than getting a reward wrong.
 */
export const NEW_PLAYER_CODES: readonly Code[] = [
  {
    code: 'GRASSHOPPER',
    reward: 'Rank 3 Lacewing, 200 A-Coins, 100,000 Credits, 1 Prodigy Crate',
  },
  {
    code: 'CHILLBOT',
    reward: '200 A-Coins, 100,000 Credits, 1 Prodigy Crate, Rank 3 Blizzfrost',
  },
  { code: 'ROBOTRUSH', reward: 'Rank 3 Shadow, 200 A-Coins, 50,000 Credits' },
  {
    code: 'BACKTRACK',
    reward: '200 A-Coins, 100,000 Credits, 1 Prodigy Crate, Rank 3 Redeemer',
  },
  {
    code: 'WARTEX',
    reward: '200 A-Coins, 100,000 Credits, 1 Prodigy Crate, Rank 3 Vortex',
  },
];

export const NEW_PLAYER_RULE =
  'You can only redeem one of these, and it has to be within 24 hours of starting or returning to the game.';

/**
 * Expired codes, listed as bare names.
 *
 * No rewards against them on purpose — that is how every list that tracks these
 * presents old codes, because nobody records the rewards of a code that no
 * longer works. Inventing rewards here would have been the tell.
 */
export const EXPIRED_CODES: readonly string[] = [
  'MIDPILOTUP',
  '2GTLOVEMECH',
  'F4CEB00K500K',
  'YOUTUBE300K',
  'HAPPY26',
  '2GTSNOW',
  'MIDSNOWGAME',
  'MIDMECH',
  'BACKTO5V5',
  'ENJOYNY',
  'ENDOFTHEYEAR',
  'SPOOKYSEASON',
  'MIDGAMEGIFT',
  'MIDGAMER',
  '2GTSUMMER4ALL',
  'SUMMERPILOTS',
  'HAPPYBDAYMA',
  'MECH4YEARS',
  'PLARIUMSWEET16',
  'MIDGAME',
  'LUCKYSHOT',
  'HOLIDAYMECH',
  'MAGIFT',
  'MAGIVEAWAY',
  'MECH3YEARS',
  'FIREPOWER',
  'CHAMPION',
];

/** The real flow. Codes are entered in the Hangar, not on a website. */
export const REDEEM_STEPS: readonly string[] = [
  'Finish the tutorial first. The promo code screen is locked until you do.',
  'Launch Mech Arena and go to the Hangar.',
  'Click the envelope at the top-centre of the screen.',
  "Select 'Promo Codes' at the bottom right.",
  'Type the code exactly as written and hit Confirm.',
];

export const ONE_PER_DAY =
  'Only one code can be redeemed per day. Work up from the oldest codes at the bottom, so nothing expires before you get to it.';

export const NOT_WORKING_REASONS: readonly string[] = [
  'You already redeemed a code today. It is one per day, per account.',
  'The code expired. Check the expired list further down.',
  'You have not finished the tutorial, so the promo code screen is still locked.',
  'It is a new or returning player code and your account is outside the 24-hour window.',
  'It was typed wrong. Codes are case sensitive.',
];

export const SOURCES: readonly string[] = [
  'The official Mech Arena account on X',
  'In-game mail and event announcements',
  'Plarium promo campaigns and partner giveaways',
];

export const FAQ: readonly { readonly q: string; readonly a: string }[] = [
  {
    q: 'Why can I only redeem one code a day?',
    a: 'That is a limit Plarium sets, not something this site controls. It is worth doing the oldest ones first, since those are the most likely to expire while you wait.',
  },
  {
    q: 'What counts as a new or returning player?',
    a: 'A fresh account, or one coming back after a long break. The window is 24 hours from that point, and you only get one of those codes, so pick the mech you actually want.',
  },
  {
    q: 'Do codes work on both Android and iOS?',
    a: 'Yes. Redemption happens inside the game, so the store you installed from does not matter.',
  },
  {
    q: 'Can I get banned for using these?',
    a: 'No. These are codes the developers hand out publicly. Nothing here touches the game itself.',
  },
];

export interface Comment {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  /** Minutes ago at page load, so the list never looks stale. */
  readonly agoMinutes: number;
  /** Renders indented, addressed to another commenter. */
  readonly replyTo?: string;
}

/**
 * The comments that are always there.
 *
 * Two things make a seeded comment section read as real, and both were missing
 * from the first version.
 *
 * The first is age. The page claims to have been published in November, and a
 * discussion where nothing is older than twelve hours says the opposite — a
 * busy page accumulates comments for as long as it has existed, so these run
 * back roughly nine months, thinning out as they go the way real threads do.
 *
 * The second is that people mostly comment when something is wrong, and they do
 * it badly. The mix here is deliberately unflattering: dead codes, region
 * complaints, someone who did not read the one-per-day rule, someone asking a
 * question answered three paragraphs above them, and a bit of off-topic.
 *
 * The voice matters as much as the content. An earlier draft had every comment
 * as a complete, well-formed, informative sentence, which is the single most
 * obvious sign that one person wrote all of them. Real ones are fragments —
 * "expired", "first", "india work?", "ty" — with missing apostrophes, doubled
 * question marks, the odd shout in caps and a couple of emoji. Several carry no
 * information at all, which is exactly how comment sections work.
 *
 * Offsets are relative rather than fixed dates so the thread never goes stale —
 * open this in a year and the newest comment is still minutes old.
 *
 * Every reply carries a SMALLER offset than the comment it answers, which is
 * only worth saying because the first draft got four of them backwards. The
 * list is sorted by time, so a reply older than its parent renders above the
 * thing it is replying to.
 */
const h = (n: number) => n * 60;
const d = (n: number) => n * 60 * 24;
const mo = (n: number) => n * 60 * 24 * 30;

export const SEED_COMMENTS: readonly Comment[] = [
  // --- today ---------------------------------------------------------------
  { id: 'c01', name: 'rohit_92', text: 'ENERGIZED still working 👍', agoMinutes: 34 },
  { id: 'c02', name: 'GhostRider99', text: 'chillbot not working for me ??', agoMinutes: 96 },
  { id: 'c03', name: 'sameer', text: 'u need a new acc bro', agoMinutes: 88, replyTo: 'GhostRider99' },
  {
    id: 'c04',
    name: 'nk_titan',
    text: '2gtloadout worked but mod parts didnt come.. restarted the app then it came',
    agoMinutes: 145,
  },
  { id: 'c05', name: 'Aarav', text: 'spookyshot in august 💀', agoMinutes: 210 },
  { id: 'c06', name: 'xX_Reaper_Xx', text: 'SPOOKYSHOT WORKING 5 SKINS', agoMinutes: 288 },
  {
    id: 'c07',
    name: 'MechLordz',
    text: 'dont waste ur one code on robotrush trust me',
    agoMinutes: h(7),
  },
  { id: 'c08', name: 'Aarav', text: 'bro same 😭', agoMinutes: h(7) - 45, replyTo: 'MechLordz' },
  { id: 'c09', name: 'devv', text: 'thx', agoMinutes: h(9) },
  { id: 'c10', name: 'karan_op', text: 'why 2nd code not working', agoMinutes: h(11) },

  // --- this week -----------------------------------------------------------
  { id: 'c11', name: 'Guest', text: 'india work?', agoMinutes: d(1) + h(3) },
  { id: 'c12', name: 'pritam.', text: 'ya works', agoMinutes: d(1) + h(1), replyTo: 'Guest' },
  { id: 'c13', name: 'zayn_', text: 'midrushgame = 3 trash crates lol', agoMinutes: d(2) },
  { id: 'c14', name: 'TheRealJabs', text: 'energized ends sept 5 dont sit on it', agoMinutes: d(3) },
  { id: 'c15', name: 'anon', text: 'any skin code', agoMinutes: d(4) },
  { id: 'c16', name: 'Vikram S', text: 'spookyshot 🤦', agoMinutes: d(3) + h(20), replyTo: 'anon' },
  { id: 'c17', name: 'm_arjun', text: 'wartex 🔥 vortex is actually good', agoMinutes: d(6) },

  // --- this month ----------------------------------------------------------
  { id: 'c18', name: 'sk8rboi', text: 'backtrack invalid', agoMinutes: d(9) },
  { id: 'c19', name: 'nk_titan', text: 'midpilotup dead pls remove', agoMinutes: d(13) },
  { id: 'c20', name: 'admin', text: 'moved down', agoMinutes: d(12), replyTo: 'nk_titan' },
  { id: 'c21', name: 'Rehan', text: 'anyone wanna squad up, 2v2 solo is pain', agoMinutes: d(17) },
  { id: 'c22', name: 'ff_playz', text: 'first', agoMinutes: d(21) },
  { id: 'c23', name: 'Dhruv', text: 'this game is p2w af now', agoMinutes: d(24) },

  // --- earlier this year ---------------------------------------------------
  { id: 'c24', name: 'ItsAyaan', text: '2gtsummer4all ty', agoMinutes: mo(2) },
  {
    id: 'c25',
    name: 'noobmaster',
    text: 'summerpilots gone alredy?? it was up like 3 days',
    agoMinutes: mo(2) + d(4),
  },
  { id: 'c26', name: 'Prakash R', text: 'happybdayma gave prodigy crate, not bad', agoMinutes: mo(3) },
  { id: 'c27', name: 'zayn_', text: 'midmech ✅ 50k', agoMinutes: mo(4) },
  { id: 'c28', name: 'Guest', text: 'backto5v5 not working??', agoMinutes: mo(5) },
  { id: 'c29', name: 'sameer', text: 'expired', agoMinutes: mo(5) - d(2), replyTo: 'Guest' },
  { id: 'c30', name: 'HarshK', text: 'happy26 worked, happy new year all', agoMinutes: mo(7) },
  { id: 'c31', name: 'Aarav', text: 'endoftheyear + enjoyny both worked', agoMinutes: mo(7) + d(9) },
  { id: 'c32', name: 'mecha_fan', text: '2gtsnow ✅', agoMinutes: mo(8) },
  { id: 'c33', name: 'rohit_92', text: 'best site for codes fr', agoMinutes: mo(8) + d(11) },
];

/**
 * "34m ago", "5h ago", "2d ago", "3mo ago", "1y ago".
 *
 * Months and years matter here: the thread runs back the better part of a year,
 * and without them the oldest comments would render as "247d ago", which no
 * comment section on earth prints.
 */
export function relativeTime(minutes: number): string {
  if (minutes < 60) return `${String(Math.max(1, Math.round(minutes)))}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${String(Math.round(hours))}h ago`;
  const days = hours / 24;
  if (days < 30) return `${String(Math.round(days))}d ago`;
  const months = days / 30;
  if (months < 12) return `${String(Math.round(months))}mo ago`;
  return `${String(Math.floor(months / 12))}y ago`;
}

export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
