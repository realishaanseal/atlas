import { useCallback, useEffect, useRef, useState } from 'react';

export const BOOST_MIN = 1;
export const BOOST_MAX = 3;

/**
 * Amplifies a remote stream beyond 100%.
 *
 * An <audio>/<video> element's `volume` is clamped to 1.0, so louder-than-
 * source is impossible through the element alone. Web Audio has no such
 * ceiling: routing the stream through a GainNode allows arbitrary gain.
 *
 * Two details make this usable rather than merely loud:
 *
 *   1. A DynamicsCompressor sits AFTER the gain, acting as a limiter. Raw
 *      amplification clips hard on anything already near full scale, which
 *      sounds like crackling distortion rather than "louder". The compressor
 *      catches those peaks so the boost stays clean.
 *
 *   2. The media element is muted while the graph is active. It is still the
 *      thing that pulls data from the stream, but if it also plays audio you
 *      hear the source and the boosted copy simultaneously — roughly doubled
 *      and slightly phased.
 *
 * At 1× the graph is torn down entirely and the element unmuted, so the
 * default path stays exactly as the browser intended.
 */
export function useAudioBoost(stream: MediaStream | null, element: HTMLMediaElement | null) {
  const [level, setLevel] = useState(BOOST_MIN);

  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const teardown = useCallback(() => {
    sourceRef.current?.disconnect();
    gainRef.current?.disconnect();
    sourceRef.current = null;
    gainRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
  }, []);

  useEffect(() => {
    if (!stream || !element) return;

    if (level === 1) {
      teardown();
      element.muted = false;
      return;
    }

    // Rebuild rather than reuse: a MediaStreamAudioSourceNode is bound to the
    // stream it was created from, and the stream identity can change.
    teardown();

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    gain.gain.value = level;

    const limiter = context.createDynamicsCompressor();
    // Aggressive limiter settings: catch peaks just below clipping, fast
    // attack so transients do not slip through, high ratio so it behaves as a
    // ceiling rather than gentle compression.
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    source.connect(gain);
    gain.connect(limiter);
    limiter.connect(context.destination);

    contextRef.current = context;
    sourceRef.current = source;
    gainRef.current = gain;

    // Safari starts contexts suspended; changing the level is a user gesture,
    // so resuming here is permitted.
    void context.resume();

    // Silence the element so only the boosted path is audible.
    element.muted = true;

    return () => {
      teardown();
      element.muted = false;
    };
  }, [stream, element, level, teardown]);

  useEffect(() => teardown, [teardown]);

  /**
   * Live gain updates without rebuilding the graph.
   *
   * Dragging a slider fires continuously; tearing down and recreating an
   * AudioContext on every frame would crackle audibly. Setting `gain.value` on
   * the existing node is instant and silent, so the effect above only runs
   * when crossing the 1× boundary (where the graph is created or destroyed).
   */
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = level;
  }, [level]);

  return { level, setLevel };
}
