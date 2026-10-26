let ctx = null;
let masterGain = null;

export function initAudio() {
  if (ctx) return ctx;
  ctx = new AudioContext();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.7;
  masterGain.connect(ctx.destination);
  return ctx;
}

export function getContext() { return ctx; }

export function setVolume(v) {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
}

function noiseBurst(time, freq, q, dur, gain) {
  if (!ctx) return;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = freq > 800 ? 'bandpass' : 'lowpass';
  bp.frequency.value = freq;
  bp.Q.value = q;

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);

  src.connect(bp).connect(env).connect(masterGain);
  src.start(time);
  src.stop(time + dur);
}

function sineTick(time, freq, dur, gain) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(env).connect(masterGain);
  osc.start(time);
  osc.stop(time + dur);
}

export function playSound(type, time) {
  if (!ctx) return;
  const t = time || ctx.currentTime;

  switch (type) {
    case 'SAMAM':
      noiseBurst(t, 1200, 1.0, 0.01, 0.7);
      noiseBurst(t + 0.012, 1200, 1.0, 0.01, 0.6);
      noiseBurst(t + 0.024, 1200, 1.0, 0.1, 0.5);
      break;
    case 'CLAP':
      noiseBurst(t, 1200, 1.0, 0.01, 0.45);
      noiseBurst(t + 0.012, 1200, 1.0, 0.01, 0.38);
      noiseBurst(t + 0.024, 1200, 1.0, 0.1, 0.32);
      break;
    case 'FINGER':
      noiseBurst(t, 600, 1.0, 0.04, 0.12);
      break;
    case 'WAVE':
      noiseBurst(t, 500, 0.5, 0.05, 0.1);
      break;
    case 'CHAPU_TICK':
      sineTick(t, 1000, 0.015, 0.06);
      break;
    case 'NADAI':
      sineTick(t, 2000, 0.01, 0.04);
      break;
  }
}
