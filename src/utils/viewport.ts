/**
 * Keeps the app exactly as tall as the visible screen.
 *
 * The problem this solves: `100dvh` is resolved by the browser at load, and a
 * PWA launched from a home-screen shortcut often reports a height captured
 * BEFORE the system bars and the standalone chrome have settled. The layout
 * ends up taller than the area you can actually see, so the bottom of the app —
 * the composer — sits off-screen. Killing the app from recents forces a fresh
 * measurement, which is exactly why that "fixes" it.
 *
 * So instead of trusting one measurement, `--app-height` is written from the
 * VisualViewport (the genuinely visible region, keyboard and bars accounted
 * for) and rewritten whenever it changes. The delayed re-measures after launch
 * catch the settle, which can land a few hundred milliseconds late on Android.
 *
 * Falls back to `innerHeight`, and the CSS falls back to `100dvh`, so a browser
 * without VisualViewport is no worse off than before.
 */

let installed = false;

export function installViewportHeight(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const viewport = window.visualViewport;

  const apply = () => {
    const height = viewport?.height ?? window.innerHeight;
    if (height > 0) {
      document.documentElement.style.setProperty('--app-height', `${String(height)}px`);
    }
  };

  /**
   * Re-measure a few times after launch.
   *
   * One measurement is not enough: on a cold PWA start the browser reports the
   * pre-settle height, then quietly corrects it once the system bars are laid
   * out. These checkpoints are cheap (a style write each) and cover the window
   * in which that correction lands.
   */
  const settle = () => {
    apply();
    requestAnimationFrame(apply);
    for (const delay of [50, 150, 300, 600, 1000]) setTimeout(apply, delay);
  };

  settle();

  viewport?.addEventListener('resize', apply);
  // Keyboard show/hide scrolls the visual viewport on iOS without resizing it.
  viewport?.addEventListener('scroll', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', settle);

  // Returning to the app from the background (or the bfcache) is the other
  // moment the reported height can be stale.
  window.addEventListener('pageshow', settle);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') settle();
  });
}
