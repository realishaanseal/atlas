import type { Message, ParticipantId } from '@/types';

/**
 * Turns a flat message list into a render list with grouping metadata.
 *
 * Two things make a chat look finished rather than homemade, and both are
 * purely presentational:
 *
 *   1. Consecutive messages from one person collapse into a visual block —
 *      one timestamp at the end, tighter spacing, and only the outer corners
 *      rounded. Repeating a timestamp and a full bubble tail on every line is
 *      the single clearest tell of a hand-rolled chat UI.
 *   2. Days are labelled. Without it, "14:26" is ambiguous the moment a
 *      conversation crosses midnight.
 *
 * Grouping breaks on sender change, a gap longer than five minutes, or a date
 * change — five minutes because a reply after a pause reads as a new thought,
 * not a continuation.
 */

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type Position = 'single' | 'first' | 'middle' | 'last';

export type RenderItem =
  | { kind: 'date'; key: string; timestamp: number }
  | { kind: 'unread'; key: string }
  | { kind: 'message'; key: string; message: Message; position: Position; mine: boolean };

function isSameDay(a: number, b: number): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function continues(previous: Message | undefined, current: Message): boolean {
  if (!previous) return false;
  if (previous.sender !== current.sender) return false;
  if (!isSameDay(previous.createdAt, current.createdAt)) return false;
  return current.createdAt - previous.createdAt <= GROUP_WINDOW_MS;
}

export function buildRenderList(
  messages: readonly Message[],
  slot: ParticipantId,
  firstUnreadId: string | null,
): RenderItem[] {
  const items: RenderItem[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) continue;

    const previous = messages[index - 1];
    const next = messages[index + 1];

    if (!previous || !isSameDay(previous.createdAt, message.createdAt)) {
      items.push({
        kind: 'date',
        key: `date-${String(message.createdAt)}`,
        timestamp: message.createdAt,
      });
    }

    if (firstUnreadId !== null && message.id === firstUnreadId) {
      items.push({ kind: 'unread', key: 'unread-divider' });
    }

    const continuesFromPrevious = continues(previous, message);
    const continuesToNext = next ? continues(message, next) : false;

    const position: Position =
      continuesFromPrevious && continuesToNext
        ? 'middle'
        : continuesFromPrevious
          ? 'last'
          : continuesToNext
            ? 'first'
            : 'single';

    items.push({
      kind: 'message',
      key: message.id,
      message,
      position,
      mine: message.sender === slot,
    });
  }

  return items;
}

export function formatDayLabel(timestamp: number): string {
  const now = Date.now();
  if (isSameDay(timestamp, now)) return 'Today';
  if (isSameDay(timestamp, now - 86_400_000)) return 'Yesterday';
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
