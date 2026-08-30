import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Phone,
  User,
  Volume1,
  Volume2,
  SwitchCamera,
  ScreenShare,
  ScreenShareOff,
} from 'lucide-react';
import { APP_NAME } from '@/config';
import type { CallKind } from '@/types';
import type { CallPhase } from '@/hooks/useCall';
import { useAudioBoost, BOOST_MIN, BOOST_MAX } from '@/hooks/useAudioBoost';
import { cn } from '@/utils/cn';

interface CallScreenProps {
  phase: CallPhase;
  kind: CallKind;
  error: string | null;
  muted: boolean;
  cameraOff: boolean;
  peerMuted: boolean;
  peerCameraOff: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  canSwitchCamera: boolean;
  sharingScreen: boolean;
  canShareScreen: boolean;
  onToggleScreenShare: () => void;
  onDismissError: () => void;
}

/**
 * Attaches a MediaStream to a video element.
 *
 * The element is tracked in state as well as a ref so that hooks depending on
 * it (the audio boost graph) re-run when it actually mounts — a ref assignment
 * alone would leave them holding null forever.
 */
function useStream(stream: MediaStream | null) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [element, setElement] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
    setElement(ref.current);
  }, [stream]);

  return { ref, element };
}

const statusLabel: Record<CallPhase, string> = {
  idle: '',
  calling: 'Calling…',
  incoming: 'Incoming call',
  connecting: 'Connecting…',
  active: 'Connected',
  failed: 'Call failed',
};

/**
 * A call control.
 *
 * Every variant is a gradient with a hairline top highlight and a coloured
 * shadow, rather than a flat fill. That combination is most of what separates
 * "a coloured circle" from "a physical button": the gradient implies a lit
 * surface, the highlight implies an edge catching that light, and the shadow
 * puts it above the page instead of painted onto it.
 *
 * The neutral variant is glass rather than a solid surface, so the video behind
 * shows through it — the controls sit over the call rather than boxing it in.
 */
function RoundButton({
  onClick,
  label,
  children,
  variant = 'neutral',
  className,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  variant?: 'neutral' | 'active' | 'danger' | 'accept';
  className?: string;
}) {
  const big = variant === 'danger' || variant === 'accept';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'press group relative flex items-center justify-center rounded-full',
        'transition-[transform,box-shadow,background-color] duration-200 ease-spring',
        'hover:-translate-y-0.5 active:translate-y-0',
        // Sized down on phones: at full size the six controls of a video call
        // overflowed a 412px screen and wrapped onto a second row.
        big ? 'size-14 sm:size-16' : 'size-11 sm:size-14',

        variant === 'neutral' &&
          cn(
            'bg-white/[0.08] text-text ring-1 ring-inset ring-white/15 backdrop-blur-xl',
            'shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_4px_16px_-4px_rgb(4_6_16/0.7)]',
            'hover:bg-white/[0.14] hover:ring-white/25',
          ),

        // "On" states (muted, camera off) invert rather than tint: it survives a
        // glance on a dark screen far better than a colour change, and colour
        // alone should never be the signal.
        variant === 'active' &&
          cn(
            'bg-gradient-to-b from-white to-zinc-200 text-bg-deep ring-1 ring-white/70',
            'shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_6px_20px_-4px_rgb(255_255_255/0.35)]',
          ),

        variant === 'danger' &&
          cn(
            'bg-gradient-to-b from-[#ff6b6b] to-[#e03131] text-white ring-1 ring-white/25',
            'shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_8px_24px_-6px_rgb(224_49_49/0.7)]',
            'hover:brightness-110',
          ),

        variant === 'accept' &&
          cn(
            'bg-gradient-to-b from-[#4ade80] to-[#16a34a] text-white ring-1 ring-white/25',
            'shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_8px_24px_-6px_rgb(22_163_74/0.7)]',
            'hover:brightness-110',
          ),

        className,
      )}
    >
      <span className="relative">{children}</span>
    </button>
  );
}

/**
 * Volume control with a vertical slider popup.
 *
 * The slider is a native <input type="range"> turned vertical with
 * `writing-mode: vertical-lr` plus `direction: rtl`, rather than a rotated
 * element. Rotation via transform breaks hit-testing — the pointer coordinates
 * stay in the untransformed space, so dragging feels inverted and offset. The
 * writing-mode approach keeps the browser's own handling intact, which also
 * means arrow keys and screen readers work without extra code.
 */
function VolumeControl({
  level,
  onChange,
}: {
  level: number;
  onChange: (level: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const percent = Math.round(level * 100);
  const boosted = level > BOOST_MIN;

  return (
    <div className="relative" ref={rootRef}>
      {open && (
        <div
          className="animate-scale-in absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2
                     flex-col items-center gap-2 rounded-full bg-black/50 px-2 py-3
                     ring-1 ring-inset ring-white/15 backdrop-blur-2xl
                     shadow-[0_12px_36px_-8px_rgb(4_6_16/0.9)]"
        >
          <span className="text-[0.625rem] font-semibold tabular-nums text-secondary">
            {percent}%
          </span>

          <input
            type="range"
            min={BOOST_MIN}
            max={BOOST_MAX}
            step={0.05}
            value={level}
            onChange={(event) => {
              onChange(Number(event.target.value));
            }}
            aria-label="Call volume"
            aria-valuetext={`${String(percent)} percent`}
            className="h-32 w-6 cursor-pointer accent-accent [direction:rtl]
                       [writing-mode:vertical-lr]"
          />

          {/* Double-tap territory: a quick way back to unmodified audio. */}
          <button
            type="button"
            onClick={() => {
              onChange(BOOST_MIN);
            }}
            className="press rounded-full px-1.5 py-0.5 text-[0.5625rem] text-muted
                       hover:text-text"
          >
            reset
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
        }}
        aria-label={`Call volume, currently ${String(percent)} percent`}
        aria-expanded={open}
        className={cn(
          'press relative flex size-11 flex-col items-center justify-center gap-0.5 rounded-full sm:size-14',
          'transition-[transform,box-shadow,background-color] duration-200 ease-spring',
          'hover:-translate-y-0.5 active:translate-y-0',
          boosted || open
            ? cn(
                'bg-gradient-to-b from-white to-zinc-200 text-bg-deep ring-1 ring-white/70',
                'shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_6px_20px_-4px_rgb(255_255_255/0.35)]',
              )
            : cn(
                'bg-white/[0.08] text-text ring-1 ring-inset ring-white/15 backdrop-blur-xl',
                'shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_4px_16px_-4px_rgb(4_6_16/0.7)]',
                'hover:bg-white/[0.14]',
              ),
        )}
      >
        {boosted ? <Volume2 size={18} aria-hidden /> : <Volume1 size={18} aria-hidden />}
        {boosted && (
          <span className="text-[0.5625rem] font-semibold leading-none tabular-nums">
            {percent}%
          </span>
        )}
      </button>
    </div>
  );
}

export function CallScreen({
  phase,
  kind,
  error,
  muted,
  cameraOff,
  peerMuted,
  peerCameraOff,
  localStream,
  remoteStream,
  onAccept,
  onDecline,
  onHangUp,
  onToggleMute,
  onToggleCamera,
  onSwitchCamera,
  canSwitchCamera,
  sharingScreen,
  canShareScreen,
  onToggleScreenShare,
  onDismissError,
}: CallScreenProps) {
  const remote = useStream(remoteStream);
  const local = useStream(localStream);
  const boost = useAudioBoost(remoteStream, remote.element);

  if (phase === 'idle') return null;

  const isVideo = kind === 'video';

  // Gated on the stream existing, not on phase. Requiring phase === 'active'
  // meant remote video stayed hidden if tracks arrived before the connection
  // state caught up — the same ordering race that hid it entirely before.
  // If we have the stream, show it.
  const showRemoteVideo = isVideo && remoteStream !== null && phase !== 'incoming';
  const inCall = phase === 'calling' || phase === 'connecting' || phase === 'active';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${isVideo ? 'Video' : 'Voice'} call`}
      className="animate-scale-in fixed inset-0 z-50 flex flex-col bg-bg-deep/97 backdrop-blur-md"
    >
      {/* Ambient field, matching the lock screen. Without it a voice call is a
          flat black rectangle with an icon in the middle. Hidden once remote
          video fills the frame, where it would only muddy the picture. */}
      {!showRemoteVideo && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/3 size-[460px] -translate-x-1/2
                       -translate-y-1/2 rounded-full bg-accent-solid/20 blur-[110px]"
            style={{ animation: 'pulse-glow 7s var(--ease-soft) infinite' }}
          />
          <div
            aria-hidden
            className="animate-float pointer-events-none absolute bottom-24 left-1/2 size-[280px]
                       -translate-x-[70%] rounded-full blur-[90px]"
            style={{ backgroundColor: 'color-mix(in oklab, var(--glow-b) 20%, transparent)' }}
          />
        </>
      )}

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {showRemoteVideo ? (
          <>
            <video ref={remote.ref} autoPlay playsInline className="size-full object-cover" />
            {/* Their camera is off: cover the black frames with a placeholder
                rather than showing a dead rectangle. Audio still plays through
                the video element underneath. */}
            {peerCameraOff && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg-deep">
                <div
                  className="relative flex size-28 items-center justify-center rounded-full
                             bg-gradient-to-b from-surface-raised to-surface ring-1 ring-inset
                             ring-white/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_16px_48px_-12px_rgb(4_6_16/0.9)]"
                >
                  <User size={44} className="text-secondary" aria-hidden />
                </div>
                <p className="flex items-center gap-1.5 text-sm text-secondary">
                  <VideoOff size={15} aria-hidden />
                  Camera off
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Audio-only, or video that hasn't connected yet. The remote
                element still has to exist for audio to play. */}
            {remoteStream && (
              <video ref={remote.ref} autoPlay playsInline className="hidden" />
            )}
            <div className="relative flex flex-col items-center gap-6 px-6 text-center">
              <div className="relative">
                {/* Expanding rings while it rings — the visual equivalent of the
                    ringing tone, and the one moment the screen should feel
                    alive rather than waiting. */}
                {(phase === 'calling' || phase === 'incoming') && (
                  <>
                    <span
                      aria-hidden
                      className="animate-pulse-ring absolute inset-0 rounded-full bg-accent-solid/25"
                    />
                    <span
                      aria-hidden
                      className="animate-pulse-ring absolute inset-0 rounded-full bg-accent-solid/20"
                      style={{ animationDelay: '0.7s' }}
                    />
                  </>
                )}

                <div
                  className={cn(
                    'relative flex size-28 items-center justify-center rounded-full sm:size-32',
                    'bg-gradient-to-b from-surface-raised to-surface',
                    'ring-1 ring-inset ring-white/10',
                    'shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_16px_48px_-12px_rgb(4_6_16/0.9),0_0_0_1px_rgb(77_148_255/0.12)]',
                  )}
                >
                  <User size={48} className="text-secondary" aria-hidden />
                </div>
              </div>

              <div>
                <p className="text-2xl font-semibold tracking-[-0.03em]">{APP_NAME}</p>
                <p
                  className={cn(
                    'mt-1.5 text-sm tabular-nums',
                    error !== null ? 'text-danger' : 'text-secondary',
                  )}
                  aria-live="polite"
                >
                  {error ?? statusLabel[phase]}
                </p>
              </div>
            </div>
          </>
        )}

        {isVideo && localStream && phase !== 'incoming' && (
          <video
            ref={local.ref}
            autoPlay
            playsInline
            muted
            className={cn(
              'absolute bottom-24 right-3 w-24 -scale-x-100 rounded-xl object-cover',
              'sm:bottom-28 sm:right-4 sm:w-40',
              'ring-1 ring-white/15',
              'shadow-[0_12px_32px_-8px_rgb(4_6_16/0.9)]',
              'transition-[opacity,transform] duration-300 ease-spring hover:scale-[1.03]',
              cameraOff && 'opacity-0',
            )}
          />
        )}

        {showRemoteVideo && error !== null && (
          <p
            role="alert"
            className="animate-scale-in absolute top-4 rounded-full bg-black/55 px-4 py-2 text-sm
                       text-white/90 ring-1 ring-inset ring-white/15 backdrop-blur-xl"
          >
            {error}
          </p>
        )}

        {/* The other person muted their mic — a small corner badge, shown on
            voice and video calls alike. Their camera-off is handled by the
            placeholder above, so this only carries the mic. */}
        {inCall && peerMuted && (
          <div
            className="animate-scale-in absolute left-4 top-4 flex items-center gap-1.5 rounded-full
                       bg-black/50 px-3 py-1.5 text-xs text-white/90 ring-1 ring-inset ring-white/15
                       backdrop-blur-xl"
          >
            <MicOff size={14} className="text-danger" aria-hidden />
            Muted
          </div>
        )}
      </div>

      {/* A floating pill rather than a full-width bar with a hard rule above it.
          The controls read as an object sitting over the call, and on a video
          call the picture runs behind them instead of being cropped by a slab. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-safe">
        <div
          className="pointer-events-auto mx-auto mb-4 flex w-fit max-w-full flex-wrap items-center
                     justify-center gap-2 rounded-[2rem] bg-black/40 p-2 ring-1 ring-inset
                     sm:gap-3 sm:p-3
                     ring-white/10 backdrop-blur-2xl
                     shadow-[0_20px_60px_-16px_rgb(4_6_16/0.95)]"
        >
          {phase === 'incoming' && (
            <>
              <RoundButton onClick={onDecline} label="Decline call" variant="danger">
                <PhoneOff size={24} aria-hidden />
              </RoundButton>
              <RoundButton onClick={onAccept} label="Accept call" variant="accept">
                <Phone size={24} aria-hidden />
              </RoundButton>
            </>
          )}

          {phase === 'failed' && (
            <button
              type="button"
              onClick={onDismissError}
              className="press h-12 rounded-full bg-white/[0.08] px-7 text-sm font-medium text-text
                         ring-1 ring-inset ring-white/15 backdrop-blur-xl
                         transition-colors hover:bg-white/[0.14]"
            >
              Close
            </button>
          )}

          {inCall && (
            <>
              <VolumeControl level={boost.level} onChange={boost.setLevel} />

              {/* The two "mute" toggles sit together — audio, then video — so
                  they read as a pair. On a voice call only the audio one shows. */}
              <RoundButton
                onClick={onToggleMute}
                label={muted ? 'Unmute' : 'Mute'}
                variant={muted ? 'active' : 'neutral'}
              >
                {muted ? <MicOff size={22} aria-hidden /> : <Mic size={22} aria-hidden />}
              </RoundButton>

              {isVideo && (
                <RoundButton
                  onClick={onToggleCamera}
                  label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                  variant={cameraOff ? 'active' : 'neutral'}
                >
                  {cameraOff ? <VideoOff size={22} aria-hidden /> : <Video size={22} aria-hidden />}
                </RoundButton>
              )}

              {/* Flip front/back, right beside the camera toggle it belongs to.
                  Only shown when there is a second camera to flip to. */}
              {isVideo && canSwitchCamera && !sharingScreen && (
                <RoundButton onClick={onSwitchCamera} label="Switch camera" variant="neutral">
                  <SwitchCamera size={22} aria-hidden />
                </RoundButton>
              )}

              {/* Screen share. Video calls only — on an audio call there is no
                  video track to swap, so it would need a renegotiation this
                  deliberately avoids. Highlighted while active, because
                  accidentally sharing your screen is the mistake worth guarding
                  against. */}
              {isVideo && canShareScreen && (
                <RoundButton
                  onClick={onToggleScreenShare}
                  label={sharingScreen ? 'Stop sharing screen' : 'Share screen'}
                  variant={sharingScreen ? 'active' : 'neutral'}
                >
                  {sharingScreen ? (
                    <ScreenShareOff size={22} aria-hidden />
                  ) : (
                    <ScreenShare size={22} aria-hidden />
                  )}
                </RoundButton>
              )}

              {/* Hang up is set apart from the toggles — beside the group, never
                  wedged between the two mute buttons. */}
              <RoundButton onClick={onHangUp} label="End call" variant="danger" className="ml-3">
                <PhoneOff size={26} aria-hidden />
              </RoundButton>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
