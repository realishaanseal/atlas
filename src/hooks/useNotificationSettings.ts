import { useCallback, useEffect, useState } from 'react';
import * as db from '@/storage/db';

export interface NotificationSettings {
  /** Play the alert ting when a message arrives while the tab is in the background. */
  readonly sound: boolean;
  /** Show the unread count in the tab title (and a desktop notification). */
  readonly inTab: boolean;
}

const KEY = 'notification-settings';
const DEFAULTS: NotificationSettings = { sound: true, inTab: true };

/**
 * Local notification preferences.
 *
 * Stored in IndexedDB, not synced — a personal device setting, and syncing "does
 * this person want a sound" would write a preference into the database for no
 * benefit. Owned here in one place and passed down, so the settings menu and the
 * notification hook always agree.
 */
export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS);

  useEffect(() => {
    void (async () => {
      const stored = await db.get<Partial<NotificationSettings>>(KEY);
      if (stored) {
        setSettings({
          sound: stored.sound ?? DEFAULTS.sound,
          inTab: stored.inTab ?? DEFAULTS.inTab,
        });
      }
    })();
  }, []);

  const update = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void db.set(KEY, next);
      return next;
    });
  }, []);

  return { settings, update };
}
