import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ParticipantId } from '@/types';

/**
 * The two names used to render and complete mentions: the viewer's own slot
 * (so a mention of it reads "You") and the peer's current nickname.
 *
 * A context rather than props threaded through every bubble — mentions are read
 * deep in the message renderer and in the composer, and both need the same
 * live pair.
 */
interface MentionNames {
  readonly mySlot: ParticipantId;
  readonly peerName: string;
}

const MentionNamesContext = createContext<MentionNames>({ mySlot: 'a', peerName: 'User B' });

export function MentionNamesProvider({
  mySlot,
  peerName,
  children,
}: {
  mySlot: ParticipantId;
  peerName: string;
  children: ReactNode;
}) {
  return (
    <MentionNamesContext.Provider value={{ mySlot, peerName }}>
      {children}
    </MentionNamesContext.Provider>
  );
}

// Provider and reader belong together; splitting them to satisfy fast refresh
// would make every consumer import from two files.
// eslint-disable-next-line react-refresh/only-export-components
export function useMentionNames(): MentionNames {
  return useContext(MentionNamesContext);
}
