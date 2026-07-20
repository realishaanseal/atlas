import { useEffect, useRef, useState } from 'react';
import { APP_NAME } from '@/config';
import type { Message, ParticipantId } from '@/types';

/** What a notification says for each kind of message. */
function preview(message: Message): string {
  switch (message.payload.kind) {
    case 'text':
      return message.payload.text.slice(0, 120);
    case 'image':
      return message.payload.mime === 'image/gif' ? 'GIF' : 'Photo';
    case 'audio':
      return 'Voice message';
    case 'call':
      return message.payload.outcome === 'completed' ? 'Call ended' : 'Missed call';
  }
}

/**
 * Unread count in the tab title, plus a desktop notification when the tab is
 * not focused.
 *
 * These can show the real message text, unlike push notifications, because the
 * page is running and holds the key. That is the whole advantage of doing it
 * in-tab — a service worker would have to say "New message" and nothing more.
 *
 * Three things this must not do, each of which is easy to get wrong:
 *   - notify for our own messages
 *   - notify for the backlog on load, which would fire fifty at once
 *   - notify twice for the same message when React re-renders
 */
export function useUnreadNotifications(messages: readonly Message[], slot: ParticipantId) {
  const [unread, setUnread] = useState(0);

  // Anything already present when the hook mounts is history, not news.
  const mountedAt = useRef(Date.now());
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Asking on mount works because reaching the conversation always required
    // clicking Unlock — browsers want a user gesture behind this prompt.
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') setUnread(0);
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (document.visibilityState === 'visible') {
      setUnread(0);
      // Mark everything currently visible as seen, so switching away and back
      // does not resurrect old messages as unread.
      for (const message of messages) notified.current.add(message.id);
      return;
    }

    const fresh = messages.filter(
      (message) =>
        message.sender !== slot &&
        message.createdAt > mountedAt.current &&
        !notified.current.has(message.id),
    );

    if (fresh.length === 0) return;

    for (const message of fresh) {
      notified.current.add(message.id);

      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(APP_NAME, {
          body: preview(message),
          // Same tag for all of them: a new message replaces the previous
          // notification rather than stacking twenty of them.
          tag: 'atlas-message',
          silent: false,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    }

    setUnread((current) => current + fresh.length);
  }, [messages, slot]);

  // Tab title carries the count, which is visible even with notifications
  // denied or suppressed by Do Not Disturb.
  useEffect(() => {
    document.title = unread > 0 ? `(${String(unread)}) ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [unread]);

  return unread;
}
