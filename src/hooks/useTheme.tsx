import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as db from '@/storage/db';
import {
  BACKGROUND_PRESETS,
  THEME_PRESETS,
  applyBackgroundVars,
  applyThemeVars,
  applyWallpaper,
  paletteFromOklch,
  type BackgroundPreset,
  type ThemePreset,
} from '@/utils/theme';

/** The accent choice: a preset id, or a custom hue/chroma captured from an image. */
type Accent =
  | { kind: 'preset'; id: string }
  | { kind: 'custom'; hue: number; chroma: number };

interface ThemeState {
  accent: Accent;
  /** Background seed colour, or null for the native background. */
  bg: string | null;
  /** Wallpaper image (data URL), or null. Takes visual precedence over `bg`. */
  wallpaper: string | null;
}

const KEY = 'theme-selection';
const DEFAULT: ThemeState = {
  accent: { kind: 'preset', id: 'default' },
  bg: null,
  wallpaper: null,
};

function applyAccent(accent: Accent): void {
  if (accent.kind === 'custom') {
    applyThemeVars(paletteFromOklch(accent.hue, accent.chroma));
    return;
  }
  const preset = THEME_PRESETS.find((p) => p.id === accent.id);
  applyThemeVars(preset && preset.hue !== null ? paletteFromOklch(preset.hue, preset.chroma) : null);
}

/** Tolerates the older stored shape (accent only) as well as the current one. */
function normalise(stored: unknown): ThemeState {
  if (typeof stored !== 'object' || stored === null) return DEFAULT;
  const value = stored as Record<string, unknown>;
  if (value.accent) return { wallpaper: null, ...(value as object) } as ThemeState;
  if (value.kind) return { accent: value as unknown as Accent, bg: null, wallpaper: null };
  return DEFAULT;
}

interface ThemeStore {
  readonly accent: Accent;
  readonly bg: string | null;
  readonly wallpaper: string | null;
  readonly presets: readonly ThemePreset[];
  readonly backgrounds: readonly BackgroundPreset[];
  readonly setPreset: (id: string) => void;
  readonly setCustom: (hue: number, chroma: number) => void;
  readonly setBackground: (hex: string | null) => void;
  readonly setWallpaper: (dataUrl: string | null) => void;
}

const ThemeContext = createContext<ThemeStore | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ThemeState>(DEFAULT);

  useEffect(() => {
    void (async () => {
      const stored = normalise(await db.get(KEY));
      setState(stored);
      applyAccent(stored.accent);
      applyBackgroundVars(stored.bg);
      applyWallpaper(stored.wallpaper);
    })();
  }, []);

  const commit = useCallback((next: ThemeState) => {
    setState(next);
    applyAccent(next.accent);
    applyBackgroundVars(next.bg);
    applyWallpaper(next.wallpaper);
    void db.set(KEY, next);
  }, []);

  const value = useMemo<ThemeStore>(
    () => ({
      accent: state.accent,
      bg: state.bg,
      wallpaper: state.wallpaper,
      presets: THEME_PRESETS,
      backgrounds: BACKGROUND_PRESETS,
      setPreset: (id) => {
        commit({ ...state, accent: { kind: 'preset', id } });
      },
      setCustom: (hue, chroma) => {
        commit({ ...state, accent: { kind: 'custom', hue, chroma } });
      },
      // Choosing a solid background clears any wallpaper, and vice versa.
      setBackground: (hex) => {
        commit({ ...state, bg: hex, wallpaper: null });
      },
      setWallpaper: (dataUrl) => {
        commit({ ...state, wallpaper: dataUrl });
      },
    }),
    [state, commit],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Provider and reader belong in one file; splitting to satisfy fast refresh
// would make every consumer import from two places.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeStore {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
