import { PASSPHRASE } from '@/config';

/**
 * Passphrase strength estimation.
 *
 * This design has no forward secrecy: anyone who learns the passphrase can
 * decrypt every message ever captured. The passphrase is therefore the entire
 * security of the system, and a weak one is not a minor issue.
 *
 * This is a deliberately small heuristic rather than zxcvbn (~400 KB). It is
 * honest about being an estimate: it scores character-class variety and length
 * and penalises the obvious patterns, but it cannot know that "correct horse
 * battery staple" appears in every wordlist on earth. The setup UI pairs it
 * with a generated-passphrase suggestion, which is the actual answer.
 */

export type StrengthLevel = 'too-short' | 'weak' | 'fair' | 'strong';

export interface PassphraseAssessment {
  readonly level: StrengthLevel;
  readonly acceptable: boolean;
  readonly message: string;
}

const COMMON = new Set([
  'password',
  'passphrase',
  '12345678',
  '123456789',
  'qwertyuiop',
  'letmein',
  'iloveyou',
  'admin123',
]);

export function assessPassphrase(value: string): PassphraseAssessment {
  if (value.length < PASSPHRASE.MIN_LENGTH) {
    return {
      level: 'too-short',
      acceptable: false,
      message: `At least ${PASSPHRASE.MIN_LENGTH} characters.`,
    };
  }

  const lower = value.toLowerCase();
  if (COMMON.has(lower)) {
    return { level: 'weak', acceptable: false, message: 'This is a commonly used password.' };
  }

  // All one character, or a short repeating unit ("abcabcabc").
  if (/^(.)\1+$/.test(value) || /^(.{1,4})\1{2,}$/.test(value)) {
    return { level: 'weak', acceptable: false, message: 'Too repetitive.' };
  }

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(value)).length;
  const words = value.trim().split(/\s+/).length;

  // A long multi-word phrase is strong even with one character class.
  if (value.length >= 24 || (words >= 4 && value.length >= 20) || (classes >= 3 && value.length >= 16)) {
    return { level: 'strong', acceptable: true, message: 'Strong.' };
  }

  if (classes >= 2 || words >= 3) {
    return {
      level: 'fair',
      acceptable: true,
      message: 'Acceptable — longer would be meaningfully better.',
    };
  }

  return {
    level: 'weak',
    acceptable: true,
    message: 'Weak. Consider a longer phrase or a generated passphrase.',
  };
}

const WORDS = [
  'amber', 'anchor', 'basin', 'beacon', 'cedar', 'cinder', 'copper', 'crescent',
  'delta', 'ember', 'fathom', 'ferry', 'garnet', 'gravel', 'harbor', 'hollow',
  'indigo', 'ivory', 'juniper', 'kettle', 'lantern', 'linen', 'marble', 'meadow',
  'nectar', 'nimbus', 'onyx', 'orchard', 'pebble', 'quarry', 'quill', 'ravine',
  'saffron', 'silver', 'thistle', 'timber', 'umber', 'valley', 'willow', 'zephyr',
];

/**
 * Six words from a 40-word list ≈ 32 bits of entropy, which is not enough on
 * its own — so we append a random 4-digit number, bringing it to ~45 bits.
 * Combined with 2,000,000 PBKDF2 iterations that is a serious offline cost.
 */
export function generatePassphrase(): string {
  const picks = Array.from(crypto.getRandomValues(new Uint32Array(6)), (n) => WORDS[n % WORDS.length]);
  const digits = (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 10000;
  return `${picks.join('-')}-${String(digits).padStart(4, '0')}`;
}
