/**
 * Three dots. Mounted only while the peer is typing, so the fade-in comes free
 * from the mount animation rather than needing a transition on opacity.
 */
export function TypingIndicator() {
  return (
    <div className="animate-card-in flex justify-start" aria-live="polite" aria-label="Typing">
      <div
        className="flex items-center gap-1.5 rounded-lg rounded-bl-xs border border-border
                   bg-surface/80 px-4 py-3.5 shadow-soft backdrop-blur-sm"
      >
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 rounded-full bg-accent"
            style={{
              animation: 'dot-bounce 1.3s var(--ease-soft) infinite',
              animationDelay: `${String(index * 0.16)}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
