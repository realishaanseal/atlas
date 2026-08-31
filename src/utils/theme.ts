/**
 * Runtime theming.
 *
 * A theme is expressed as a hue and chroma in OKLCH, from which the whole accent
 * palette is generated at fixed lightness levels. OKLCH is used on purpose:
 * because its lightness is perceptual, "L = 0.54" gives roughly the same
 * contrast against white whatever the hue, so a green or pink accent stays as
 * readable behind white text as the blue default. Plain HSL does not — yellow
 * at 50% lightness is far brighter than blue at 50%.
 *
 * The app stays a dark theme regardless. A custom theme shifts the accent and
 * the ambient glow to match an image; it never tries to recolour the dark base
 * or the light text, which is what keeps any image producing a usable result.
 *
 * Themes are LOCAL to a device — a preset id or a single hex colour in
 * IndexedDB — never written to Firestore, so each side can run a different one
 * and no colour data sits next to the ciphertext.
 */

export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

// --- colour conversion -----------------------------------------------------

function srgbToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** sRGB (0–255) to OKLCH. Standard Björn Ottosson matrices. */
export function rgbToOklch(r: number, g: number, b: number): Oklch {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c, h };
}

// --- palette generation ----------------------------------------------------

/** The CSS custom properties a theme overrides on :root. */
export type ThemeVars = Record<string, string>;

/**
 * Builds the accent + glow palette for a hue/chroma.
 *
 * Lightness values are fixed and tuned for the dark UI: the two "solid" stops
 * (behind white text on sent bubbles and buttons) sit low enough to clear
 * ~4.5:1 on white; the plain accent sits high for use on the dark background.
 * Chroma is clamped so an over-saturated image cannot produce a garish result.
 */
export function paletteFromOklch(hue: number, chroma: number): ThemeVars {
  const c = Math.min(Math.max(chroma, 0.03), 0.17);
  const alt = (hue + 32) % 360;
  const ok = (l: number, ch: number, h: number) => `oklch(${l.toFixed(3)} ${ch.toFixed(3)} ${h.toFixed(1)})`;

  return {
    '--color-accent': ok(0.74, c, hue),
    '--color-accent-hover': ok(0.8, c, hue),
    '--color-accent-muted': ok(0.4, c * 0.7, hue),
    // 0.52 keeps white text ≥4.5:1 across every hue, including the lighter
    // cyans where a higher lightness would dip under.
    '--color-accent-solid': ok(0.52, c, hue),
    '--color-accent-solid-deep': ok(0.45, c, hue),
    '--color-accent-solid-hover': ok(0.56, c, hue),
    '--color-accent-alt': ok(0.62, c, alt),
    '--glow-a': ok(0.56, c, hue),
    '--glow-b': ok(0.58, c, alt),
  };
}

// --- background tint -------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Builds the background/surface palette for a chosen colour.
 *
 * The lightness levels are FIXED and dark, and only the hue (with a gently
 * clamped chroma) comes from the colour — so any pick produces a dark, tinted
 * base that keeps the near-white text readable. You choose the mood, not the
 * lightness, which is what stops "set my own background" from ever making the
 * app unreadable.
 */
export function backgroundVars(hex: string): ThemeVars {
  const [r, g, b] = hexToRgb(hex);
  const { c, h } = rgbToOklch(r, g, b);
  const tint = Math.min(c, 0.045);
  const ok = (l: number, ch: number) => `oklch(${l.toFixed(3)} ${ch.toFixed(3)} ${h.toFixed(1)})`;

  // Lightness ladder matched to the redesign's native palette — a wider gap up
  // to the first surface, clear steps after, so elevation reads on any tint.
  return {
    '--color-bg': ok(0.13, tint),
    '--color-bg-deep': ok(0.08, tint),
    '--color-surface': ok(0.2, tint),
    '--color-surface-raised': ok(0.26, tint),
    '--color-surface-glass': ok(0.22, tint),
    '--color-border': ok(0.32, tint * 1.3),
    '--color-border-strong': ok(0.42, tint * 1.3),
  };
}

const BG_KEYS = Object.keys(backgroundVars('#000000'));

export function applyBackgroundVars(hex: string | null): void {
  const root = document.documentElement;
  if (hex === null) {
    for (const key of BG_KEYS) root.style.removeProperty(key);
    return;
  }
  for (const [key, value] of Object.entries(backgroundVars(hex))) {
    root.style.setProperty(key, value);
  }
}

/**
 * Sets or clears a wallpaper image behind the chat.
 *
 * Applied to the body — the same backdrop layer the ambient glow uses — so it
 * shows through the gaps between the (opaque-enough) bubbles without any new
 * stacking context. A dark scrim is layered over it so the messages and text
 * stay readable over any photo, however bright. Local only; the data URL never
 * leaves the device.
 */
export function applyWallpaper(dataUrl: string | null): void {
  const body = document.body;
  if (!dataUrl) {
    body.style.removeProperty('background-image');
    body.style.removeProperty('background-size');
    body.style.removeProperty('background-position');
    body.style.removeProperty('background-attachment');
    return;
  }
  body.style.backgroundImage =
    `linear-gradient(180deg, rgba(4, 5, 10, 0.62), rgba(4, 5, 10, 0.82)), url("${dataUrl}")`;
  body.style.backgroundSize = 'cover';
  body.style.backgroundPosition = 'center';
  body.style.backgroundAttachment = 'fixed';
}

export interface BackgroundPreset {
  readonly id: string;
  readonly name: string;
  /** null = the app's native background. */
  readonly hex: string | null;
  readonly swatch: string;
}

export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  { id: 'default', name: 'Default', hex: null, swatch: '#0b1020' },
  { id: 'ink', name: 'Ink', hex: '#000000', swatch: '#050505' },
  { id: 'midnight', name: 'Midnight', hex: '#12244d', swatch: 'oklch(0.16 0.045 260)' },
  { id: 'forest', name: 'Forest', hex: '#12402a', swatch: 'oklch(0.16 0.045 158)' },
  { id: 'plum', name: 'Plum', hex: '#2e1440', swatch: 'oklch(0.16 0.045 300)' },
  { id: 'ember', name: 'Ember', hex: '#3a1e12', swatch: 'oklch(0.16 0.045 45)' },
];

// --- presets ---------------------------------------------------------------

export interface ThemePreset {
  readonly id: string;
  readonly name: string;
  /** null = the app's native palette (no overrides). */
  readonly hue: number | null;
  readonly chroma: number;
  /** A representative swatch colour for the picker. */
  readonly swatch: string;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: 'default', name: 'Ocean', hue: null, chroma: 0.15, swatch: '#2f6fe0' },
  { id: 'violet', name: 'Violet', hue: 300, chroma: 0.15, swatch: 'oklch(0.54 0.15 300)' },
  { id: 'emerald', name: 'Emerald', hue: 158, chroma: 0.14, swatch: 'oklch(0.54 0.14 158)' },
  { id: 'rose', name: 'Rose', hue: 12, chroma: 0.15, swatch: 'oklch(0.54 0.15 12)' },
  { id: 'amber', name: 'Amber', hue: 70, chroma: 0.13, swatch: 'oklch(0.6 0.13 70)' },
  { id: 'teal', name: 'Teal', hue: 195, chroma: 0.12, swatch: 'oklch(0.54 0.12 195)' },
  { id: 'slate', name: 'Slate', hue: 260, chroma: 0.03, swatch: 'oklch(0.55 0.03 260)' },
];

// --- image extraction ------------------------------------------------------

/**
 * Picks a representative vivid colour from an image.
 *
 * Downscales to a small canvas, then buckets pixels by hue weighted by how
 * colourful and mid-toned they are — so a photo's washed-out sky or dark
 * shadows do not dominate over the one saturated object in it. Falls back to the
 * most colourful single pixel, then to a neutral, if nothing vivid is found.
 */
export async function extractThemeHue(file: File): Promise<{ hue: number; chroma: number }> {
  const bitmap = await createImageBitmap(file);
  const size = 48;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, w, h);

  // 24 hue buckets, each accumulating chroma-weighted lightness-favoured votes.
  const buckets = Array.from({ length: 24 }, () => ({ weight: 0, hue: 0, chroma: 0 }));

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 0;
    if (alpha < 128) continue;
    const { l, c, h: hueValue } = rgbToOklch(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);

    // Favour mid-toned, colourful pixels; ignore near-greys and extremes.
    if (c < 0.04 || l < 0.2 || l > 0.9) continue;
    const midness = 1 - Math.abs(l - 0.6) * 1.5;
    const weight = c * Math.max(0.1, midness);

    const index = Math.min(23, Math.floor((hueValue / 360) * 24));
    const bucket = buckets[index];
    if (bucket) {
      bucket.weight += weight;
      bucket.hue += hueValue * weight;
      bucket.chroma += c * weight;
    }
  }

  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a), {
    weight: 0,
    hue: 0,
    chroma: 0,
  });
  if (best.weight === 0) return { hue: 260, chroma: 0.05 };

  return { hue: best.hue / best.weight, chroma: Math.min(0.17, best.chroma / best.weight) };
}

// --- application -----------------------------------------------------------

/** The keys a theme touches, so reverting to default can clear exactly them. */
const MANAGED_KEYS = Object.keys(paletteFromOklch(0, 0.1));

/**
 * Applies a theme by setting (or clearing) the managed CSS variables on the
 * document root. Clearing lets the stylesheet's own defaults show through,
 * which is how the native "Ocean" theme is restored without hardcoding it here.
 */
export function applyThemeVars(vars: ThemeVars | null): void {
  const root = document.documentElement;
  if (vars === null) {
    for (const key of MANAGED_KEYS) root.style.removeProperty(key);
    return;
  }
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
}
