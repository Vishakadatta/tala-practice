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

const DAYAN_HZ = 293.66;
const BAYAN_HZ = 98;
const ACCENT = 0.85;
const SUBDIVISION_LEVEL = 0.25;
// Strokes overlap at fast tempos; this keeps the summed signal from clipping at full volume.
const HEADROOM = 0.34;

// partials: [frequency ratio, amplitude, decay scale]. The dayan's tuned head rings in
// whole-number harmonics. Upper bayan partials keep the bass audible on phone speakers.
// slap: [band centre Hz, Q, duration, amplitude] for the hand's contact noise.
const STROKES = {
  na: {
    base: DAYAN_HZ, decay: 0.32,
    partials: [[1, 0.25, 0.5], [2, 0.7, 1], [3, 0.55, 0.7], [4, 0.3, 0.45], [5, 0.18, 0.3]],
    slap: [3200, 1.2, 0.018, 0.5],
  },
  tin: {
    base: DAYAN_HZ, decay: 0.5,
    partials: [[1, 0.6, 1], [2, 0.9, 0.8], [3, 0.25, 0.4]],
    slap: [2200, 1, 0.012, 0.25],
  },
  tun: {
    base: DAYAN_HZ, decay: 0.65,
    partials: [[1, 1, 1], [2, 0.25, 0.5]],
    slap: [1500, 1, 0.012, 0.2],
  },
  ti: {
    base: DAYAN_HZ, decay: 0.07,
    partials: [[3, 0.7, 1], [4, 0.5, 0.8]],
    slap: [2600, 1, 0.03, 1.4],
  },
  ge: {
    base: BAYAN_HZ, decay: 0.5, glideFrom: 0.85, glideTime: 0.08,
    partials: [[1, 0.9, 1], [2, 0.55, 0.8], [3, 0.3, 0.5], [4, 0.12, 0.35]],
    slap: [400, 1, 0.025, 0.35],
  },
  ka: {
    base: BAYAN_HZ, decay: 0.06,
    partials: [[1, 0.8, 1], [3, 0.6, 0.7]],
    slap: [700, 1, 0.05, 2.5],
  },
};

// Each bol is [stroke, position within the beat]. A rest has no entry and stays silent.
const BOLS = {
  Dha: [['na', 0], ['ge', 0]],
  Dhin: [['tin', 0], ['ge', 0]],
  Dhi: [['ti', 0], ['ge', 0]],
  Ta: [['na', 0]],
  Na: [['na', 0]],
  Tin: [['tin', 0]],
  Ti: [['ti', 0]],
  Tit: [['ti', 0]],
  Tu: [['tun', 0]],
  Ge: [['ge', 0]],
  Ka: [['ka', 0]],
  Kat: [['ka', 0]],
  Kit: [['ka', 0], ['ti', 0.5]],
  DhaGe: [['na', 0], ['ge', 0], ['ge', 0.5]],
  TirKit: [['ti', 0], ['ti', 0.25], ['ka', 0.5], ['ti', 0.75]],
  Gadi: [['ge', 0], ['ti', 0.5]],
  Gana: [['ge', 0], ['na', 0.5]],
};

let noiseBuffer = null;

function getNoiseBuffer() {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function ring(time, stroke, [ratio, amp, decayScale], level) {
  const dur = stroke.decay * decayScale;
  const freq = stroke.base * ratio;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  if (stroke.glideFrom) {
    osc.frequency.setValueAtTime(freq * stroke.glideFrom, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + stroke.glideTime);
  } else {
    osc.frequency.value = freq;
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(amp * level, time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

  osc.connect(env);
  env.connect(masterGain);
  osc.start(time);
  osc.stop(time + dur + 0.01);
}

function slap(time, [freq, q, dur, amp], level) {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;

  const env = ctx.createGain();
  env.gain.setValueAtTime(amp * level, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

  src.connect(bp);
  bp.connect(env);
  env.connect(masterGain);
  src.start(time, Math.random() * 0.8);
  src.stop(time + dur + 0.01);
}

function playStroke(name, time, level) {
  const stroke = STROKES[name];
  const scaled = level * HEADROOM;
  for (const partial of stroke.partials) ring(time, stroke, partial, scaled);
  slap(time, stroke.slap, scaled);
}

function startTime(time) {
  return time > ctx.currentTime ? time : ctx.currentTime + 0.005;
}

export function playBol(bol, time, beatDuration, isSam) {
  if (!ctx || !masterGain) return;
  const strokes = BOLS[bol];
  if (!strokes) return;
  const t = startTime(time);
  const level = isSam ? 1 : ACCENT;
  for (const [name, position] of strokes) {
    playStroke(name, t + position * beatDuration, level);
  }
}

export function playSubdivision(time) {
  if (!ctx || !masterGain) return;
  playStroke('ti', startTime(time), SUBDIVISION_LEVEL);
}
