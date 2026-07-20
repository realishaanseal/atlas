import { useCallback, useRef, useState } from 'react';
import { AUDIO } from '@/config';

export interface RecorderResult {
  readonly blob: Blob;
  readonly durationMs: number;
  readonly peaks: number[];
}

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'denied' | 'unsupported';

/**
 * Microphone recording with live level metering.
 *
 * Peaks are sampled from an AnalyserNode while recording rather than computed
 * afterwards by decoding the clip. Two reasons: decoding a 2-minute Opus file
 * to compute a waveform is slow and janky on a phone, and sampling live lets
 * the recording UI show a real level meter as you speak.
 *
 * The microphone track is stopped explicitly on every exit path. Leaving it
 * open keeps the browser's recording indicator lit, which in an app like this
 * is alarming and looks like a bug — or worse, like a backdoor.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const peaksRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;

    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;

    void audioCtxRef.current?.close();
    audioCtxRef.current = null;

    recorderRef.current = null;
    setLevel(0);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    const { isSupported, pickMimeType } = await import('@/services/audio');
    if (!isSupported()) {
      setState('unsupported');
      return false;
    }

    setState('requesting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setState('denied');
      return false;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    peaksRef.current = [];
    startedAtRef.current = Date.now();

    // Level metering.
    const context = new AudioContext();
    audioCtxRef.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const sample = () => {
      analyser.getByteTimeDomainData(buffer);
      let peak = 0;
      for (const value of buffer) peak = Math.max(peak, Math.abs(value - 128));
      const normalised = Math.min(100, Math.round((peak / 128) * 140));
      setLevel(normalised);
      peaksRef.current.push(normalised);
      rafRef.current = requestAnimationFrame(sample);
    };
    rafRef.current = requestAnimationFrame(sample);

    const recorder = new MediaRecorder(stream, {
      mimeType: pickMimeType(),
      audioBitsPerSecond: AUDIO.BITS_PER_SECOND,
    });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.start(250);

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= AUDIO.MAX_DURATION_MS) recorderRef.current?.stop();
    }, 100);

    setState('recording');
    setElapsedMs(0);
    return true;
  }, []);

  /** Resolves with the recording, or null if it was too short to be intentional. */
  const stop = useCallback(async (): Promise<RecorderResult | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      setState('idle');
      return null;
    }

    const durationMs = Date.now() - startedAtRef.current;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };
      recorder.stop();
    });

    // Downsample the raw per-frame peaks to a fixed bar count.
    const raw = peaksRef.current;
    const peaks: number[] = [];
    const bucket = Math.max(1, Math.floor(raw.length / AUDIO.PEAK_COUNT));
    for (let i = 0; i < AUDIO.PEAK_COUNT; i += 1) {
      const slice = raw.slice(i * bucket, (i + 1) * bucket);
      peaks.push(
        slice.length === 0
          ? 4
          : Math.max(4, Math.round(slice.reduce((a, b) => a + b, 0) / slice.length)),
      );
    }

    cleanup();
    setState('idle');
    setElapsedMs(0);

    // Under a second is almost always a mis-tap.
    if (durationMs < 800) return null;
    return { blob, durationMs, peaks };
  }, [cleanup]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    setState('idle');
    setElapsedMs(0);
  }, [cleanup]);

  return { state, elapsedMs, level, start, stop, cancel };
}
