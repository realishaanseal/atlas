/**
 * Finding dates and times inside ordinary message text.
 *
 * The point is that "meeting tomorrow at 5" is not a static string — it means
 * something that moves. Rather than rewriting the message (which would make the
 * two of you see different words, and make the archive disagree with what was
 * actually said), the phrase is detected, resolved to a real moment, and
 * rendered as a live chip: the words stay exactly as typed, and the countdown
 * lives beside them.
 *
 * Everything resolves against the message's OWN send time, not the current
 * clock. "Tomorrow" in a message from Tuesday means Wednesday forever — reading
 * it on Friday must not silently mean Saturday.
 */

export interface DateMatch {
  /** Offset of the phrase within the text. */
  readonly index: number;
  readonly length: number;
  /** The matched phrase, exactly as written. */
  readonly text: string;
  /** Resolved moment, epoch ms. */
  readonly at: number;
  /** False when only a day was given, so the UI can say "all day". */
  readonly hasTime: boolean;
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

/**
 * One combined pattern, ordered longest-first.
 *
 * A single regex rather than several passes: overlapping matches ("tomorrow at
 * 5" vs the bare "5") would otherwise both fire and produce two chips over the
 * same words. Alternation picks the leftmost-longest, which is what we want.
 */
const TIME = String.raw`(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?`;

const PATTERN = new RegExp(
  [
    // in 20 minutes / in 3 hours / in 2 days
    String.raw`\bin\s+(\d{1,3})\s*(min(?:ute)?s?|hours?|hrs?|days?|weeks?)\b`,
    // tomorrow at 5pm / tomorrow
    String.raw`\b(tomorrow|tonight|today)\b(?:\s+${TIME})?`,
    // monday at 3 / friday
    String.raw`\b(${WEEKDAYS.join('|')})\b(?:\s+${TIME})?`,
    // 12 August / August 12, optionally with a time
    String.raw`\b(\d{1,2})\s+(${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join('|')})\b(?:\s+${TIME})?`,
    String.raw`\b(${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join('|')})\s+(\d{1,2})\b(?:\s+${TIME})?`,
    // at 5pm / at 17:30 — needs the "at" or a meridiem, so "5" alone is not a date
    String.raw`\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b`,
    String.raw`\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b`,
  ].join('|'),
  'gi',
);

/** Applies an hour/minute to a date, resolving 12-hour ambiguity forwards. */
function applyTime(
  date: Date,
  hourRaw: number,
  minute: number,
  meridiem: string | undefined,
  base: Date,
  dayWasExplicit: boolean,
): { date: Date; hasTime: boolean } {
  let hour = hourRaw;

  if (meridiem) {
    const pm = meridiem.toLowerCase() === 'pm';
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  } else if (hour >= 1 && hour <= 7) {
    /**
     * A bare hour is ambiguous, and the convention people actually use in chat
     * is not "the next occurrence" — "meeting tomorrow at 5" means five in the
     * afternoon, not five in the morning, even though 5am comes first.
     *
     * So 1–7 reads as afternoon/evening, 8–11 as morning, and anything above 12
     * is already unambiguous. This is a guess either way; it is simply the guess
     * that is wrong least often. Writing "5pm" or "17:00" always wins.
     */
    hour += 12;
  }

  const out = new Date(date);
  out.setHours(hour, minute, 0, 0);

  // Even after the 12-hour nudge, a time already past on an unspecified day
  // means tomorrow.
  if (!dayWasExplicit && out.getTime() < base.getTime()) {
    out.setDate(out.getDate() + 1);
  }

  return { date: out, hasTime: true };
}

export function findDateTimes(text: string, baseMs: number): DateMatch[] {
  const base = new Date(baseMs);
  const out: DateMatch[] = [];

  for (const m of text.matchAll(PATTERN)) {
    const index = m.index;
    // The optional meridiem group can swallow a trailing space; the chip
    // underline should hug the words, not a gap.
    const phrase = m[0].replace(/\s+$/, '');
    let resolved: Date | null = null;
    let hasTime = false;

    // --- in N units ---
    if (m[1] && m[2]) {
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      const ms = unit.startsWith('min')
        ? n * 60_000
        : unit.startsWith('h')
          ? n * 3_600_000
          : unit.startsWith('d')
            ? n * 86_400_000
            : n * 604_800_000;
      resolved = new Date(baseMs + ms);
      hasTime = true;
    }

    // --- tomorrow / today / tonight ---
    else if (m[3]) {
      const word = m[3].toLowerCase();
      const day = new Date(base);
      if (word === 'tomorrow') day.setDate(day.getDate() + 1);
      day.setHours(word === 'tonight' ? 20 : 9, 0, 0, 0);

      if (m[4]) {
        const applied = applyTime(day, Number(m[4]), Number(m[5] ?? 0), m[6], base, true);
        resolved = applied.date;
        hasTime = true;
      } else {
        resolved = day;
        hasTime = word === 'tonight';
      }
    }

    // --- weekday ---
    else if (m[7]) {
      const target = WEEKDAYS.indexOf(m[7].toLowerCase() as (typeof WEEKDAYS)[number]);
      const day = new Date(base);
      // Always the NEXT such weekday, including today only if the time is later.
      let delta = (target - day.getDay() + 7) % 7;
      if (delta === 0 && !m[8]) delta = 7;
      day.setDate(day.getDate() + delta);
      day.setHours(9, 0, 0, 0);

      if (m[8]) {
        const applied = applyTime(day, Number(m[8]), Number(m[9] ?? 0), m[10], base, true);
        resolved = applied.date;
        hasTime = true;
      } else {
        resolved = day;
      }
    }

    // --- 12 August ---
    else if (m[11] && m[12]) {
      resolved = monthDay(base, Number(m[11]), m[12]);
      if (resolved && m[13]) {
        resolved = applyTime(resolved, Number(m[13]), Number(m[14] ?? 0), m[15], base, true).date;
        hasTime = true;
      }
    }

    // --- August 12 ---
    else if (m[16] && m[17]) {
      resolved = monthDay(base, Number(m[17]), m[16]);
      if (resolved && m[18]) {
        resolved = applyTime(resolved, Number(m[18]), Number(m[19] ?? 0), m[20], base, true).date;
        hasTime = true;
      }
    }

    // --- at 5 / at 17:30 ---
    else if (m[21]) {
      resolved = applyTime(base, Number(m[21]), Number(m[22] ?? 0), m[23], base, false).date;
      hasTime = true;
    }

    // --- 5pm ---
    else if (m[24]) {
      resolved = applyTime(base, Number(m[24]), Number(m[25] ?? 0), m[26], base, false).date;
      hasTime = true;
    }

    if (!resolved || Number.isNaN(resolved.getTime())) continue;

    // Nothing more than a year out; a stray "12 May" in prose should not become
    // a calendar invite for a date nobody meant.
    if (Math.abs(resolved.getTime() - baseMs) > 400 * 86_400_000) continue;

    out.push({ index, length: phrase.length, text: phrase, at: resolved.getTime(), hasTime });
  }

  return out;
}

function monthDay(base: Date, day: number, monthWord: string): Date | null {
  const key = monthWord.toLowerCase();
  const month = MONTHS.findIndex((name) => name === key || name.slice(0, 3) === key);
  if (month === -1 || day < 1 || day > 31) return null;

  const date = new Date(base);
  date.setMonth(month, day);
  date.setHours(9, 0, 0, 0);
  // A date that has already passed this year means next year.
  if (date.getTime() < base.getTime() - 86_400_000) date.setFullYear(date.getFullYear() + 1);
  return date;
}

/** "in 4 hours", "started 10 minutes ago", "ended". */
export function relativeLabel(at: number, now: number, endedAfterMs = 60 * 60 * 1000): string {
  const delta = at - now;
  const abs = Math.abs(delta);

  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  if (delta > 0) {
    if (mins < 1) return 'in under a minute';
    if (mins < 60) return `in ${String(mins)} minute${mins === 1 ? '' : 's'}`;
    if (hours < 24) return `in ${String(hours)} hour${hours === 1 ? '' : 's'}`;
    return `in ${String(days)} day${days === 1 ? '' : 's'}`;
  }

  if (abs > endedAfterMs) {
    if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`;
    return `${String(days)} day${days === 1 ? '' : 's'} ago`;
  }
  if (mins < 1) return 'now';
  return `started ${String(mins)} minute${mins === 1 ? '' : 's'} ago`;
}
