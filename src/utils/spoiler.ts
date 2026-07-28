/**
 * Spoiler grammar: `||hidden text||`, as in Discord.
 *
 * Non-greedy and multiline, so `||a|| and ||b||` is two spoilers rather than
 * one spanning the middle, and a spoiler may wrap across lines. An unpaired
 * `||` matches nothing and stays literal.
 */
export const SPOILER_RE = /\|\|([\s\S]+?)\|\|/g;

/**
 * Replaces spoiler spans with a neutral block for previews.
 *
 * A reply quote and the pin list show a plain-text excerpt, so without this a
 * hidden message would be revealed there in the clear — defeating the point of
 * marking it hidden. The message itself still renders the real, revealable
 * spoiler; only the derived preview is masked.
 */
export function maskSpoilers(text: string): string {
  return text.replace(SPOILER_RE, '▨▨▨');
}
