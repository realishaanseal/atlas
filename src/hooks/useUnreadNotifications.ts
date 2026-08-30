import { useEffect, useRef, useState } from 'react';
import { APP_NAME, NOTIFICATIONS } from '@/config';
import { playTing } from '@/utils/sound';
import type { NotificationSettings } from '@/hooks/useNotificationSettings';
import type { Message, ParticipantId } from '@/types';

/** What a notification says for each kind of message. */
function preview(message: Message): string {
  switch (message.payload.kind) {
    case 'text':
      return message.payload.text.slice(0, 120);
    case 'image':
      return message.payload.mime === 'image/gif' ? 'GIF' : 'Photo';
    case 'video':
      return 'Video';
    case 'file':
      return message.payload.name;
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
export function useUnreadNotifications(
  messages: readonly Message[],
  slot: ParticipantId,
  settings: NotificationSettings,
) {
  const [unread, setUnread] = useState(0);

  // Anything already present when the hook mounts is history, not news.
  const mountedAt = useRef(Date.now());
  const notified = useRef<Set<string>>(new Set());

  // Read inside the fresh-message effect without making settings a dependency —
  // toggling a preference must not re-run the detection and re-notify.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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

    const { sound, inTab } = settingsRef.current;

    for (const message of fresh) {
      notified.current.add(message.id);

      if (inTab && 'Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(APP_NAME, {
          // A desktop notification is drawn by the operating system, outside
          // anything this app controls, and it can appear on a locked screen or
          // over a shared display. A preview of the message there would undo
          // the concealment in the one place it cannot be undone — and a
          // notification titled after a notes site whose body is a line of
          // conversation is more conspicuous than no notification at all.
          //
          // Set NOTIFICATIONS.SHOW_PREVIEW to true if you would rather have the
          // text and accept that.
          body: NOTIFICATIONS.SHOW_PREVIEW ? preview(message) : 'Your library was updated.',
          // Same tag for all of them: a new message replaces the previous
          // notification rather than stacking twenty of them.
          tag: 'library-update',
          // The Web Audio ting is the sound, gated by the user's own setting —
          // so the OS notification itself stays silent to avoid a double chime.
          silent: true,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    }

    // One ting per batch, not per message — a burst should not machine-gun.
    if (sound) playTing();
    if (inTab) setUnread((current) => current + fresh.length);
  }, [messages, slot]);

  // Tab title carries the count, which is visible even with notifications
  // denied or suppressed by Do Not Disturb. Suppressed entirely when the in-tab
  // toggle is off.
  useEffect(() => {
    document.title = settings.inTab && unread > 0 ? `(${String(unread)}) ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [unread, settings.inTab]);

  return unread;
}
