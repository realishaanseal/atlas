import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ImagePlus, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { extractThemeHue } from '@/utils/theme';
import { WallpaperCrop } from './WallpaperCrop';
import { cn } from '@/utils/cn';

/**
 * Theme picker.
 *
 * Presets are shared in the sense that both people have the same list to choose
 * from; the choice itself is local, so each side can run a different one. A
 * custom theme is derived from an uploaded image and lives only on this device —
 * deriving it needs the picture, which is never sent anywhere.
 */
export function ThemeManager({ onClose }: { onClose: () => void }) {
  const { accent, bg, wallpaper, presets, backgrounds, setPreset, setCustom, setBackground, setWallpaper } =
    useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const applyFromImage = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const { hue, chroma } = await extractThemeHue(file);
      setCustom(hue, chroma);
    } catch {
      setError('Could not read a colour from that image. Try another.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Theme"
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop bg-bg-deep/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="animate-scale-in flex max-h-[80vh] w-[min(30rem,92vw)] flex-col overflow-hidden
                   rounded-lg border border-hairline bg-surface shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-text">Theme</h2>
            <p className="text-[0.6875rem] text-muted">Just for this device</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press flex size-8 items-center justify-center rounded-full text-muted
                       hover:bg-surface-raised hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <p className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wide text-muted">
            Presets
          </p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
            {presets.map((preset) => {
              const active = accent.kind === 'preset' && accent.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setPreset(preset.id);
                  }}
                  aria-label={preset.name}
                  aria-pressed={active}
                  className="group flex flex-col items-center gap-1"
                >
                  <span
                    className={cn(
                      'flex size-11 items-center justify-center rounded-full transition-transform',
                      'duration-150 group-hover:scale-105',
                      active ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : '',
                    )}
                    style={{ backgroundColor: preset.swatch }}
                  >
                    {active && <Check size={16} className="text-white drop-shadow" aria-hidden />}
                  </span>
                  <span className="text-[0.625rem] text-secondary">{preset.name}</span>
                </button>
              );
            })}
          </div>

          <p className="mb-2 mt-5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted">
            From an image
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'flex w-full items-center gap-3 rounded-md border border-dashed border-hairline-strong',
              'bg-surface-raised px-4 py-3 text-left text-sm text-secondary transition-colors',
              'hover:border-accent hover:text-text disabled:opacity-50',
              accent.kind === 'custom' && 'border-accent text-text',
            )}
          >
            {busy ? (
              <Loader2 size={18} className="shrink-0 animate-spin text-accent" aria-hidden />
            ) : (
              <ImagePlus size={18} className="shrink-0 text-accent" aria-hidden />
            )}
            <span className="flex-1">
              {accent.kind === 'custom' ? 'Custom theme active' : 'Upload a photo'}
              <span className="block text-[0.6875rem] text-muted">
                The accent and glow are set from the picture's colours.
              </span>
            </span>
            {accent.kind === 'custom' && <Check size={16} className="text-accent" aria-hidden />}
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void applyFromImage(file);
              event.target.value = '';
            }}
          />

          {error !== null && <p className="mt-2 text-xs text-danger">{error}</p>}

          <p className="mb-2 mt-5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted">
            Background
          </p>
          <div className="grid grid-cols-6 gap-3">
            {backgrounds.map((preset) => {
              const active = preset.hex === null ? bg === null : bg === preset.hex;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setBackground(preset.hex);
                  }}
                  aria-label={preset.name}
                  aria-pressed={active}
                  className="group flex flex-col items-center gap-1"
                >
                  <span
                    className={cn(
                      'flex size-11 items-center justify-center rounded-full border border-hairline',
                      'transition-transform duration-150 group-hover:scale-105',
                      active ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : '',
                    )}
                    style={{ backgroundColor: preset.swatch }}
                  >
                    {active && <Check size={15} className="text-white/90" aria-hidden />}
                  </span>
                  <span className="text-[0.625rem] text-secondary">{preset.name}</span>
                </button>
              );
            })}

            <label
              className="group flex cursor-pointer flex-col items-center gap-1"
              aria-label="Custom background colour"
            >
              <span
                className={cn(
                  'flex size-11 items-center justify-center rounded-full border text-muted',
                  'transition-transform duration-150 group-hover:scale-105 group-hover:text-accent',
                  bg !== null ? 'border-accent text-accent' : 'border-dashed border-hairline-strong',
                )}
              >
                <ImagePlus size={16} aria-hidden />
                <input
                  type="color"
                  value={bg && /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : '#12244d'}
                  onChange={(event) => {
                    setBackground(event.target.value);
                  }}
                  className="sr-only"
                />
              </span>
              <span className="text-[0.625rem] text-secondary">Colour</span>
            </label>

            {/* Wallpaper photo — upload, crop to the screen, apply. */}
            <label
              className="group flex cursor-pointer flex-col items-center gap-1"
              aria-label="Wallpaper photo"
            >
              <span
                className={cn(
                  'flex size-11 items-center justify-center overflow-hidden rounded-full border',
                  'bg-cover bg-center text-muted transition-transform duration-150',
                  'group-hover:scale-105 group-hover:text-accent',
                  wallpaper !== null
                    ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface'
                    : 'border-dashed border-hairline-strong',
                )}
                style={wallpaper !== null ? { backgroundImage: `url(${wallpaper})` } : undefined}
              >
                {wallpaper !== null ? (
                  <Check size={15} className="text-white drop-shadow" aria-hidden />
                ) : (
                  <ImageIcon size={16} aria-hidden />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setCropFile(file);
                    event.target.value = '';
                  }}
                />
              </span>
              <span className="text-[0.625rem] text-secondary">Photo</span>
            </label>
          </div>

          <p className="mt-4 text-[0.625rem] leading-relaxed text-muted">
            The accent theme shifts the highlight and glow; the background sets the base tint. Any
            background is kept dark so the text stays readable. Everything here is stored on this
            device only and is never sent anywhere.
          </p>
        </div>
      </div>

      {cropFile && (
        <WallpaperCrop
          file={cropFile}
          onApply={(dataUrl) => {
            setWallpaper(dataUrl);
            setCropFile(null);
          }}
          onCancel={() => {
            setCropFile(null);
          }}
        />
      )}
    </div>,
    document.body,
  );
}
