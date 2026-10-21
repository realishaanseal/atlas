import { ThemeProvider } from '@/hooks/useTheme';
import { CustomEmojiProvider } from '@/hooks/useCustomEmoji';
import { MotionProvider } from '@/motion/config';
import Conversation from './Conversation';
import type { ParticipantId } from '@/types';

interface ChatRootProps {
  cryptoKey: CryptoKey;
  slot: ParticipantId;
  uid: string;
  onLock: () => void;
}

/**
 * Everything behind the lock screen, in one lazily loaded module.
 *
 * The conversation, the theme engine, the emoji pack and the animation runtime
 * all land in a chunk that is never fetched until a passphrase has been
 * accepted, which keeps the lock screen's critical path small.
 *
 * The theme provider in particular used to sit in `main.tsx`, which put the
 * palette engine and an IndexedDB open on the critical path of every page
 * load. It is only ever consumed inside the conversation, so it belongs here.
 *
 * Both providers are mounted inside the unlocked branch on purpose: the emoji
 * provider decrypts the pack and holds object URLs for it, and neither it nor
 * its blobs should outlive the session.
 */
export default function ChatRoot({ cryptoKey, slot, uid, onLock }: ChatRootProps) {
  return (
    <MotionProvider>
      <ThemeProvider>
        <CustomEmojiProvider cryptoKey={cryptoKey}>
          <Conversation cryptoKey={cryptoKey} slot={slot} uid={uid} onLock={onLock} />
        </CustomEmojiProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}
