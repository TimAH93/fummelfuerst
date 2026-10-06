import { PitchReading, detectPitch } from '../../core';

export interface MicHandle {
  stop(): void;
  sampleRate: number;
}

/**
 * Opens the microphone and calls `onFrame` about 30× per second with a pitch reading.
 * Must be started from a tap (iOS only allows audio after a user gesture).
 */
export async function startMic(onFrame: (r: PitchReading | null, timeMs: number) => void): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    // Raw signal: echo cancellation and noise suppression smear pitch.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let running = true;
  let last = 0;
  const loop = (t: number) => {
    if (!running) return;
    if (t - last >= 33) {
      last = t;
      analyser.getFloatTimeDomainData(buf);
      onFrame(detectPitch(buf, ctx.sampleRate), t);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return {
    sampleRate: ctx.sampleRate,
    stop() {
      if (!running) return;
      running = false;
      stream.getTracks().forEach((tr) => tr.stop());
      void ctx.close();
    },
  };
}
