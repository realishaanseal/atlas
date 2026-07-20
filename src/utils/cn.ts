/** Minimal class-name joiner. Avoids pulling in clsx for ~10 lines of logic. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
