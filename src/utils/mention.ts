import type { ParticipantId } from '@/types';

/**
 * Mentions reference a device SLOT, not a name.
 *
 * Nicknames are local — if you call the other person "Nick", they have no idea
 * they are "Nick" — so a mention cannot be stored as the name you see. It is
 * stored as `<@a>` or `<@b>`, and each side renders it with its own names: the
 * peer's nickname, or "You" when the mention points at the viewer. That is why
 * the same stored token shows as "@Nick" to you and "@You" to them.
 */
export const MENTION_RE = /<@([ab])>/g;

const SELF_LABEL = 'You';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts the display mentions the composer inserted (`@You`, `@Nick`) into the
 * stable slot tokens that get stored. Run once, at send time, when both names
 * are known.
 *
 * A trailing negative-lookahead for a word character stops `@Nick` from also
 * matching inside `@Nickname`, so only whole mentions are converted.
 */
export function encodeMentions(
  text: string,
  params: { mySlot: ParticipantId; peerSlot: ParticipantId; peerName: string },
): string {
  let out = text.replace(new RegExp(`@${SELF_LABEL}(?!\\w)`, 'g'), `<@${params.mySlot}>`);

  // Only if the nickname is real and not the reserved self-label.
  if (params.peerName && params.peerName !== SELF_LABEL) {
    out = out.replace(
      new RegExp(`@${escapeRegExp(params.peerName)}(?!\\w)`, 'g'),
      `<@${params.peerSlot}>`,
    );
  }
  return out;
}

/**
 * Turns stored `<@slot>` tokens back into readable `@Name` text for a plain-text
 * context that cannot render chips — reply quotes, the pin list. Resolved from
 * the viewer's perspective: their own slot becomes "@You", the other becomes the
 * peer nickname.
 */
export function resolveMentionsPlain(
  text: string,
  params: { mySlot: ParticipantId; peerName: string },
): string {
  return text.replace(MENTION_RE, (_, slot: string) =>
    slot === params.mySlot ? `@${SELF_LABEL}` : `@${params.peerName}`,
  );
}
