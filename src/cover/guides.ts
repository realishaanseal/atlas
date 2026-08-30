/**
 * The rest of the site's content: tier lists, guides, sidebar furniture.
 *
 * A code page on its own is not a site. Every real one in this genre sits
 * inside a small pile of guides, a "popular this week" list and a footer full
 * of policy links, and the absence of all that is most of what makes a single
 * page look hand-built.
 *
 * Mech names, roles, rarities, energy capacities and weapon names are the real
 * figures. The tier placements are opinions, which is what a tier list is — but
 * every name on the list exists in the game.
 */

export type TierLabel = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | '?';

export type MechRole = 'Attacker' | 'Scout' | 'Tank' | 'Support' | '—';

export interface Mech {
  readonly name: string;
  /** Battlefield role, as the game classifies it. */
  readonly role: MechRole;
  readonly rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
  /** Max weapon energy. This is the number that actually shapes a build. */
  readonly energy?: 16 | 24 | 32;
  /** Which Gear Hub tier it sits in, I through X. */
  readonly hub: string;
  readonly tier: TierLabel;
}


/**
 * Every mech and where it sits in the meta.
 *
 * Only `name` and `tier` are rendered — the tier lists are built from this. Role,
 * rarity, energy and Gear Hub tier are kept because they were verified against
 * two wikis and are the expensive part to reconstruct, so a future table can be
 * built straight from here.
 *
 * Prices are deliberately absent. They move with every balance pass and store
 * rotation, and the two wikis already disagree about which mechs can be bought
 * with currency at all. Rankings age far more gracefully than numbers do.
 */
export const MECHS: readonly Mech[] = [
  // Meta
  { name: 'Redox', role: 'Attacker', rarity: 'Legendary', energy: 32, hub: 'VII', tier: 'S' },
  { name: 'Blizzfrost', role: 'Scout', rarity: 'Legendary', hub: 'IX', tier: 'S' },
  { name: 'Outlaw', role: 'Attacker', rarity: 'Legendary', hub: 'IX', tier: 'S' },
  { name: 'Deathwalker', role: 'Tank', rarity: 'Legendary', energy: 32, hub: 'IX', tier: 'S' },
  { name: 'Surge', role: 'Scout', rarity: 'Legendary', energy: 24, hub: 'VII', tier: 'S' },
  { name: 'Citadel', role: 'Support', rarity: 'Legendary', hub: 'IX', tier: 'S' },
  { name: 'Nomad', role: 'Scout', rarity: 'Legendary', energy: 24, hub: 'VIII', tier: 'S' },
  { name: 'Lacewing', role: 'Scout', rarity: 'Legendary', hub: 'VIII', tier: 'S' },
  { name: 'Tailsting', role: '—', rarity: 'Legendary', hub: 'X', tier: 'S' },
  { name: 'Seeker', role: 'Attacker', rarity: 'Legendary', energy: 24, hub: 'IX', tier: 'S' },

  // Off-meta
  { name: 'Orion', role: 'Support', rarity: 'Epic', energy: 24, hub: 'VI', tier: 'A' },
  { name: 'Eclipse', role: 'Scout', rarity: 'Legendary', energy: 24, hub: 'VII', tier: 'A' },
  { name: 'Salvor', role: 'Support', rarity: 'Legendary', hub: 'IX', tier: 'A' },
  { name: 'Hemlock', role: 'Support', rarity: 'Legendary', energy: 24, hub: 'VIII', tier: 'A' },
  { name: 'Parasite', role: 'Tank', rarity: 'Legendary', hub: 'IX', tier: 'A' },
  { name: 'Solis', role: 'Support', rarity: 'Legendary', energy: 32, hub: 'VIII', tier: 'A' },

  // Usable
  { name: 'Redeemer', role: 'Scout', rarity: 'Epic', energy: 24, hub: 'V', tier: 'B' },
  { name: 'Aegis', role: 'Tank', rarity: 'Epic', energy: 24, hub: 'V', tier: 'B' },
  { name: 'Bastion', role: 'Tank', rarity: 'Legendary', energy: 24, hub: 'VIII', tier: 'B' },
  { name: 'Blockhorn', role: 'Tank', rarity: 'Legendary', hub: 'IX', tier: 'B' },
  { name: 'Panther', role: 'Attacker', rarity: 'Epic', energy: 32, hub: 'VI', tier: 'B' },
  { name: 'Mimicker', role: 'Scout', rarity: 'Legendary', hub: 'IX', tier: 'B' },
  { name: 'Gatecrasher', role: 'Attacker', rarity: 'Legendary', energy: 32, hub: 'VIII', tier: 'B' },
  { name: 'Vortex', role: 'Tank', rarity: 'Legendary', energy: 24, hub: 'VIII', tier: 'B' },
  { name: 'Volti', role: 'Attacker', rarity: 'Legendary', hub: 'IX', tier: 'B' },
  { name: 'Onyx', role: 'Attacker', rarity: 'Legendary', energy: 32, hub: 'VIII', tier: 'B' },
  { name: 'Dreadnaught', role: 'Attacker', rarity: 'Legendary', hub: 'IX', tier: 'B' },

  // Midgame
  { name: 'Guardian', role: 'Attacker', rarity: 'Rare', energy: 32, hub: 'III', tier: 'C' },
  { name: 'Tengu', role: 'Scout', rarity: 'Rare', energy: 16, hub: 'IV', tier: 'C' },
  { name: 'Stalker', role: 'Attacker', rarity: 'Rare', energy: 24, hub: 'IV', tier: 'C' },
  { name: 'Killshot', role: 'Scout', rarity: 'Epic', energy: 24, hub: 'VI', tier: 'C' },
  { name: 'Zephyr', role: 'Support', rarity: 'Epic', energy: 24, hub: 'V', tier: 'C' },
  { name: 'Sentinel', role: 'Tank', rarity: 'Epic', energy: 24, hub: 'VI', tier: 'C' },
  { name: 'Cheetah', role: 'Support', rarity: 'Epic', energy: 24, hub: 'V', tier: 'C' },

  // Early game
  { name: 'Lancer', role: 'Scout', rarity: 'Common', energy: 16, hub: 'I', tier: 'D' },
  { name: 'Paragon', role: 'Attacker', rarity: 'Common', energy: 32, hub: 'I', tier: 'D' },
  { name: 'Shadow', role: 'Scout', rarity: 'Rare', energy: 16, hub: 'III', tier: 'D' },
  { name: 'Ares', role: 'Tank', rarity: 'Rare', energy: 24, hub: 'III', tier: 'D' },

  // Don't use
  { name: 'Silverthorn', role: 'Attacker', rarity: 'Legendary', hub: 'X', tier: 'E' },
  { name: 'Brickhouse', role: 'Support', rarity: 'Legendary', energy: 24, hub: 'VII', tier: 'E' },
  { name: 'Scorpius', role: 'Attacker', rarity: 'Legendary', energy: 32, hub: 'VII', tier: 'E' },
  { name: 'Puma', role: 'Attacker', rarity: 'Uncommon', energy: 32, hub: 'II', tier: 'E' },
  { name: 'Slingshot', role: 'Scout', rarity: 'Uncommon', energy: 24, hub: 'II', tier: 'E' },
  { name: 'Juggernaut', role: 'Tank', rarity: 'Uncommon', energy: 24, hub: 'II', tier: 'E' },
  { name: 'M.D.', role: 'Support', rarity: 'Uncommon', energy: 16, hub: 'II', tier: 'E' },
  { name: 'Arachnos', role: 'Support', rarity: 'Rare', energy: 32, hub: 'IV', tier: 'E' },
];

/**
 * Which mechs the new-player codes actually hand out, and where each one sits.
 *
 * This is the single most useful thing on the site, because you only get one of
 * those codes and the difference between the best and worst choice is four tiers.
 */
export const CODE_MECHS: readonly {
  readonly code: string;
  readonly mech: string;
  readonly tier: TierLabel;
}[] = [
  { code: 'GRASSHOPPER', mech: 'Lacewing', tier: 'S' },
  { code: 'CHILLBOT', mech: 'Blizzfrost', tier: 'S' },
  { code: 'WARTEX', mech: 'Vortex', tier: 'B' },
  { code: 'BACKTRACK', mech: 'Redeemer', tier: 'B' },
  { code: 'ROBOTRUSH', mech: 'Shadow', tier: 'D' },
];

export interface Tier {
  readonly tier: TierLabel;
  readonly note: string;
  readonly entries: readonly string[];
}

/** Human labels for the six bands, used on both tier lists. */
export const BAND_NAME: Record<TierLabel, string> = {
  S: 'Meta',
  A: 'Off-meta',
  B: 'Usable',
  C: 'Midgame',
  D: 'Early game',
  E: 'Do not use',
  '?': 'Unranked',
};

/** Derived from MECHS, so adding a mech puts it in the right band automatically. */
export const MECH_TIERS: readonly Tier[] = (
  [
    ['S', 'What you meet in every competitive lobby. Build one of these if you can.'],
    ['A', 'Off-meta rather than weaker. Several of these beat meta picks in the right hands.'],
    ['B', 'Perfectly usable. You will not be the reason the team loses.'],
    ['C', 'Carries you through the middle ranks and then starts to fall behind.'],
    ['D', 'Fine for the first few ranks and nothing past that.'],
    ['E', 'Do not sink credits into these.'],
  ] as const
)
  .map(([tier, note]) => ({
    tier,
    note,
    entries: MECHS.filter((mech) => mech.tier === tier).map((mech) => mech.name),
  }))
  .filter((row) => row.entries.length > 0);

/**
 * Weapon rankings.
 *
 * Six bands rather than five, because the bottom of the weapon pool is bad in a
 * way the bottom of the mech pool is not — there is a real difference between
 * "outclassed" and "actively a mistake to buy", and collapsing them into one D
 * tier loses the only advice that matters to a new player.
 */
export const WEAPON_TIERS: readonly Tier[] = [
  {
    tier: 'S',
    note: 'The current meta. Build around these if you have them.',
    entries: [
      'Storm Racks',
      'Charge Rockets',
      'Burrow Beams',
      'Geminis',
      'Compound Beams',
      'Hornets',
    ],
  },
  {
    tier: 'A',
    note: 'Off-meta rather than weaker. Several of these beat meta picks on the right mech.',
    entries: [
      'Revokers',
      'Suppressors',
      'Disruptors',
      'Pod Guns',
      'Rail Guns',
      'Strike Rockets',
    ],
  },
  {
    tier: 'B',
    note: 'Strong and dependable. Where most players should actually be spending.',
    entries: ['Savants', 'EM Rifles', 'Ember Guns'],
  },
  {
    tier: 'C',
    note: 'Playable. Fine to run, but you will feel the gap against a built meta loadout.',
    entries: [
      'Miniguns',
      'Repeaters',
      'Reavers',
      'Overdrivers',
      'Tetra Rifles',
      'Howlers',
      'Hellfires',
      'Quashers',
      'Vipers',
      'Chainguns',
      'Continuums',
      'Versas',
      'Fuse Mortars',
      'Graviton Beams',
    ],
  },
  {
    tier: 'D',
    note: 'Early game only. They carry you through the first few ranks and then stop scaling.',
    entries: [
      'Disk Launchers',
      'Arc Torrents',
      'Helix Racks',
      'Missile Racks',
      'Nade Launchers',
      'Quantum Guns',
    ],
  },
  {
    tier: 'E',
    note: 'Just do not buy or use these. Credits spent here are gone.',
    entries: [
      'Autocannons',
      'Pulse Cannons',
      'Carbines',
      'Fragment Guns',
      'Cryo Rockets',
      'Plasma Cannons',
      'Cryo Launchers',
      'Rocket Launchers',
      'Dreadshots',
      'Berserkers',
      'Oracles',
      'Blast Cannons',
      'Particle Beams',
    ],
  },
];

/** Total across every band, shown under the weapon table. */
export const WEAPON_COUNT = WEAPON_TIERS.reduce((total, row) => total + row.entries.length, 0);

export interface Tip {
  readonly title: string;
  readonly body: string;
}

/**
 * Beginner advice.
 *
 * Rewritten from scratch, because the first version was written from general
 * intuition about progression systems rather than from how this one actually
 * works — and it was wrong in the two places that matter most.
 *
 * It said to pick one mech and pour everything into it. The real F2P rule is
 * close to the opposite: upgrading starter gear is wasted the moment a higher
 * Gear Hub tier opens, so acquiring new gear beats levelling old gear. It also
 * said energy is a fixed pool of 16, 24 or 32, when the wiki stat tables show
 * energy scales with rank — Vortex runs 6 at rank 1 and only reaches 24 fully
 * maxed. Both would have been obvious to anyone who plays.
 */
export const BEGINNER_TIPS: readonly Tip[] = [
  {
    title: 'Do not upgrade your starter gear',
    body: 'This is the one that costs people months. Credits poured into Paragon, Lancer or anything else from the first couple of tiers are gone the moment a higher Gear Hub tier opens, because gear from your highest available tier outperforms a fully levelled beginner mech. Buy new, do not level old.',
  },
  {
    title: 'Tier Stars only count from your current tier',
    body: 'You unlock the next Gear Hub tier by earning Tier Stars, and stars are only earned from gear in the tier you are currently on. Buying or upgrading a Tier I mech adds nothing at all toward unlocking Tier III. If your progress bar has not moved in a while, this is almost always why.',
  },
  {
    title: 'Open every hangar slot before you upgrade anything',
    body: 'Each slot is another mech, which means another respawn, another answer to whatever is beating you, and the option to switch roles mid-match. A wider hangar does more for your win rate early than a taller one, so bank credits for slots before spending on ranks.',
  },
  {
    title: 'Energy scales with rank, so a low-rank mech cannot carry a real build',
    body: 'Weapon energy is not fixed. Vortex has 6 energy at rank 1 and 24 fully maxed; Deathwalker climbs from 8 to 32. A freshly bought Legendary cannot fit the loadout you bought it for until it has been ranked up, which catches out anyone who expects the listed maximum from day one.',
  },
  {
    title: 'Hold A-Coins for tiers 5 to 7',
    body: 'A-Coins are the premium currency and the early store offers are the worst value in the game. The gear that carries you into serious lobbies sits in the middle tiers, so save for those rather than spending on crates and early upgrades you will outgrow.',
  },
  {
    title: 'The cheapest unlock path is not the best one',
    body: 'It is possible to reach the next tier by buying whatever costs least, and it is usually a mistake. Spending slightly more on gear that actually combos together gets you the same tier unlock and a hangar worth playing, instead of a pile of cheap items bought purely for stars.',
  },
  {
    title: 'Pilots and implants are not cosmetic',
    body: 'Pilots give real stat boosts and their implants stack on top, improving cooldowns, range, reload and ability stats rather than just raw damage. Pilot Marks accumulate slowly, so back one solid epic pilot rather than spreading them thinly across rare pilots you will drop later.',
  },
  {
    title: 'Mods are a commitment, implants are not',
    body: 'Mods add shields or extra HP, but they are mech-specific and cannot be moved once installed. Implants travel with the pilot. Put mods only on a mech you are certain you will still be playing in six months.',
  },
  {
    title: 'Redeem a code every day',
    body: 'One code per day, every day. Over a few weeks that is a meaningful pile of credits for no effort. Start with the oldest codes on the list, since those are the ones closest to expiring.',
  },
];

export const GAME_FACTS: readonly { readonly label: string; readonly value: string }[] = [
  { label: 'Developer', value: 'Plarium' },
  { label: 'Modes', value: '5v5 and 2v2' },
  { label: 'Match length', value: 'About 5 minutes' },
  { label: 'Maps', value: '20+' },
  { label: 'Mechs', value: '46' },
  { label: 'Weapons', value: '90+' },
  { label: 'Energy tiers', value: '16 / 24 / 32' },
  { label: 'Platforms', value: 'Android, iOS' },
];

export interface GuideLink {
  readonly href: string;
  readonly title: string;
  readonly blurb: string;
  readonly updated: string;
}

export const GUIDES: readonly GuideLink[] = [
  {
    href: '/mech-arena-tier-list',
    title: 'Mech Arena tier list: mechs and weapons',
    blurb: 'All 46 mechs and 48 weapons, from meta down to the ones not worth building.',
    updated: '2026-08-06',
  },
  {
    href: '/beginner-guide',
    title: 'Beginner guide: what to build first',
    blurb: 'The nine things worth knowing before you spend a single credit.',
    updated: '2026-07-29',
  },
  {
    href: '/how-to-redeem',
    title: 'How to redeem promo codes',
    blurb: 'Where the code box is, and the five reasons a code gets rejected.',
    updated: '2026-08-11',
  },
];

/** Sidebar list. Deliberately in a different order to the guides grid. */
export const POPULAR: readonly {
  readonly href: string;
  readonly title: string;
  readonly views: string;
}[] = [
  { href: '/', title: 'Working Mech Arena codes (August 2026)', views: '48.2k' },
  { href: '/mech-arena-tier-list', title: 'Mech Arena tier list: mechs and weapons', views: '31.7k' },
  { href: '/beginner-guide', title: 'Beginner guide: what to build first', views: '12.4k' },
  { href: '/how-to-redeem', title: 'How to redeem promo codes', views: '9.8k' },
  { href: '/about', title: 'About MechCodes', views: '2.3k' },
];

export const TAGS: readonly string[] = [
  'Mech Arena',
  'Promo codes',
  'Plarium',
  'Mobile games',
  'Free rewards',
  'A-Coins',
  'Tier list',
];
