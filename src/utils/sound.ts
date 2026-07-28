/**
 * A short synthesized "ting" for new-message alerts.
 *
 * Synthesized with the Web Audio API rather than shipping an audio file — it is
 * a few lines, adds no asset to the bundle, and works offline. Two quick sine
 * tones (B5 then E6) with a fast decay give a soft bell.
 *
 * One AudioContext is reused. Browsers start it suspended until a user gesture,
 * so `prime()` is called once after unlock (which always follows a click) to
 * resume it; later tings — which may fire while the tab is backgrounded, with
 * no gesture of their own — then reuse the already-running context.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  return ctx;
}

/** Resume the audio context while a user gesture is still in scope. */
export function primeSound(): void {
  const audio = context();
  if (audio && audio.state === 'suspended') void audio.resume();
}

export function playTing(): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();

  const now = audio.currentTime;
  const master = audio.createGain();
  master.gain.value = 0.14;
  master.connect(audio.destination);

  for (const note of [
    { freq: 987.77, at: 0 },
    { freq: 1318.51, at: 0.09 },
  ]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = note.freq;

    const start = now + note.at;
    // Exponential ramps, never to literal zero — exponentialRampTo requires a
    // positive target, so the envelope starts and ends just above silence.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(1, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);

    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + 0.4);
  }
}
