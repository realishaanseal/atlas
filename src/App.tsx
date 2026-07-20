import { Suspense, lazy } from 'react';
import LockScreen from '@/pages/LockScreen';
import UnpairedScreen from '@/pages/UnpairedScreen';
import { useSession } from '@/hooks/useSession';
import { CustomEmojiProvider } from '@/hooks/useCustomEmoji';

const Conversation = lazy(() => import('@/pages/Conversation'));

export default function App() {
  const { status, slot, uid, message, submit, lock, keyRef } = useSession();

  if (status === 'unpaired') return <UnpairedScreen />;

  const key = keyRef.current;
  if (status === 'unlocked' && key && slot && uid) {
    return (
      // Mounted inside the unlocked branch on purpose: the provider decrypts
      // the emoji pack and holds object URLs for it, so it should not exist —
      // and its blobs should not survive — outside an unlocked session.
      <Suspense fallback={<div className="h-full" />}>
        <CustomEmojiProvider cryptoKey={key}>
          <Conversation cryptoKey={key} slot={slot} uid={uid} onLock={lock} />
        </CustomEmojiProvider>
      </Suspense>
    );
  }

  return <LockScreen status={status} message={message} onSubmit={submit} />;
}
