/**
 * Reveal-on-scroll for the cover site. Deliberately tiny and dependency-free —
 * the animation runtime behind the access code must never be pulled into the
 * public bundle.
 *
 * One observer, wired up once from CoverSite, watches every `.cv-reveal` in the
 * document and adds `.is-in` (which the `.cv-reveal` rule in cover.css fades up)
 * the first time each scrolls into view. Re-scanning on demand covers elements
 * that mount later, on a route change.
 */
let observer: IntersectionObserver | null = null;

function reduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Adds `.is-in` to every `.cv-reveal` not yet revealed. */
export function scanReveals(): void {
  const nodes = document.querySelectorAll<HTMLElement>('.cv-reveal:not(.is-in)');

  if (typeof IntersectionObserver === 'undefined' || reduced()) {
    nodes.forEach((n) => {
      n.classList.add('is-in');
    });
    return;
  }

  // Only now does the hidden-until-revealed CSS take effect — see cover.css.
  document.documentElement.classList.add('cv-ready');

  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer?.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );

  const vh = window.innerHeight;
  nodes.forEach((n) => {
    // Anything already on screen reveals now, with no observer round-trip —
    // otherwise it would flash to opacity 0 for a frame before fading back.
    if (n.getBoundingClientRect().top < vh * 0.95) n.classList.add('is-in');
    else observer?.observe(n);
  });
}
