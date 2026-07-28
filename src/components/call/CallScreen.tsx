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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'press flex items-center justify-center rounded-full shadow-lift transition-colors duration-150',
        variant === 'danger' || variant === 'accept' ? 'size-16' : 'size-14',
        variant === 'neutral' && 'bg-surface-raised text-text hover:bg-surface',
        // Inverted rather than tinted: a "muted" control should read as ON,
        // and inversion survives being glanced at on a dark screen.
        variant === 'active' && 'bg-white text-bg-deep',
        variant === 'danger' && 'bg-danger text-white hover:brightness-110',
        variant === 'accept' && 'bg-success text-white hover:brightness-110',
        className,
      )}
    >
      {children}
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
          className="glass animate-rise absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2
                     flex-col items-center gap-2 rounded-full border border-border px-2 py-3
                     shadow-lift"
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
          'press flex size-14 flex-col items-center justify-center gap-0.5 rounded-full shadow-lift',
          boosted || open ? 'bg-text text-bg' : 'bg-surface-raised text-text hover:bg-surface',
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
      className="animate-rise fixed inset-0 z-50 flex flex-col bg-bg-deep/97 backdrop-blur-md"
    >
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {showRemoteVideo ? (
          <>
            <video ref={remote.ref} autoPlay playsInline className="size-full object-cover" />
            {/* Their camera is off: cover the black frames with a placeholder
                rather than showing a dead rectangle. Audio still plays through
                the video element underneath. */}
            {peerCameraOff && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg-deep">
                <div className="flex size-28 items-center justify-center rounded-full border border-border bg-surface">
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
            <div className="flex flex-col items-center gap-5 px-6 text-center">
              <div
                className={cn(
                  'flex size-28 items-center justify-center rounded-full border border-border',
                  'bg-surface shadow-glow',
                  phase === 'calling' || phase === 'incoming' ? 'animate-pulse' : '',
                )}
              >
                <User size={44} className="text-secondary" aria-hidden />
              </div>
              <div>
                <p className="text-xl font-semibold tracking-[-0.02em]">{APP_NAME}</p>
                <p
                  className={cn('mt-1 text-sm', error !== null ? 'text-danger' : 'text-secondary')}
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
              'absolute bottom-4 right-4 w-28 -scale-x-100 rounded-md border border-border',
              'object-cover shadow-lift transition-opacity duration-300 sm:w-40',
              cameraOff && 'opacity-0',
            )}
          />
        )}

        {showRemoteVideo && error !== null && (
          <p
            role="alert"
            className="glass absolute top-4 rounded-md border border-border px-4 py-2 text-sm"
          >
            {error}
          </p>
        )}

        {/* The other person muted their mic — a small corner badge, shown on
            voice and video calls alike. Their camera-off is handled by the
            placeholder above, so this only carries the mic. */}
        {inCall && peerMuted && (
          <div
            className="glass absolute left-4 top-4 flex items-center gap-1.5 rounded-full border
                       border-border px-3 py-1.5 text-xs text-secondary"
          >
            <MicOff size={14} className="text-danger" aria-hidden />
            Muted
          </div>
        )}
      </div>

      <div className="glass border-t border-border px-6 pb-safe pt-5">
        <div className="mx-auto flex max-w-sm items-center justify-center gap-4 pb-4">
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
              className="press h-12 rounded-md border border-border bg-surface px-6 text-sm font-medium"
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
              {isVideo && canSwitchCamera && (
                <RoundButton onClick={onSwitchCamera} label="Switch camera" variant="neutral">
                  <SwitchCamera size={22} aria-hidden />
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
