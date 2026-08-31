import { m } from 'motion/react';

/**
 * Three dots. The mount/unmount transition is owned by the <AnimatePresence>
 * wrapper in Conversation; here the dots just breathe.
 */
export function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="Typing">
      <div
        className="flex items-center gap-1.5 rounded-lg rounded-bl-xs border border-hairline
                   bg-surface/65 px-4 py-3.5 backdrop-blur-md depth"
      >
        {[0, 1, 2].map((index) => (
          <m.span
            key={index}
            className="size-1.5 rounded-full bg-accent"
            animate={{ y: [0, -4, 0], opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1.3,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: index * 0.16,
            }}
          />
        ))}
      </div>
    </div>
  );
}
