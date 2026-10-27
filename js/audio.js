let ctx = null;
let masterGain = null;

let pendingVolume = 0.7;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  masterGain = ctx.createGain();
  masterGain.gain.value = pendingVolume;
  masterGain.connect(ctx.destination);
  return ctx;
}

export function getContext() { return ctx; }

export function setVolume(v) {
  pendingVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = pendingVolume;
}

// Low-level: schedule a short tone burst
function tone(time, freq, dur, gainPeak) {
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(gainPeak, time + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

  osc.connect(env);
  env.connect(masterGain);
  osc.start(time);
  osc.stop(time + dur + 0.01);
}

// Noise burst filtered to a frequency band
function noise(time, freq, q, dur, gainPeak) {
  if (!ctx || !masterGain) return;
  const len = Math.ceil(ctx.sampleRate * (dur + 0.02));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;

  const env = ctx.createGain();
  env.gain.setValueAtTime(gainPeak, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

  src.connect(bp);
  bp.connect(env);
  env.connect(masterGain);
  src.start(time);
  src.stop(time + dur + 0.02);
}

export function playSound(type, time) {
  if (!ctx || !masterGain) return;
  const t = (time !== undefined && time > ctx.currentTime) ? time : ctx.currentTime + 0.005;

  switch (type) {
    case 'SAMAM':
      noise(t, 900, 2, 0.12, 0.9);
      noise(t + 0.015, 900, 2, 0.08, 0.6);
      tone(t, 220, 0.08, 0.35);
      break;

    case 'CLAP':
      noise(t, 900, 2, 0.10, 0.6);
      noise(t + 0.015, 900, 2, 0.07, 0.4);
      tone(t, 180, 0.06, 0.2);
      break;

    case 'FINGER':
      noise(t, 500, 1.5, 0.06, 0.3);
      tone(t, 400, 0.05, 0.12);
      break;

    case 'WAVE':
      noise(t, 300, 0.8, 0.08, 0.25);
      tone(t, 150, 0.07, 0.1);
      break;

    case 'CHAPU_TICK':
      tone(t, 800, 0.04, 0.15);
      break;

    case 'NADAI':
      tone(t, 1200, 0.02, 0.07);
      break;
  }
}
