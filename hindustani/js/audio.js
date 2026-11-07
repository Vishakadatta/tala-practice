let ctx = null;
let masterGain = null;
let tone = null;

let pendingVolume = 0.9;

export function initAudio() {
  if (ctx) {
    // Safari can also report 'interrupted' after the app or tab has been in the background.
    if (ctx.state !== 'running') ctx.resume();
    return ctx;
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  masterGain = ctx.createGain();
  masterGain.gain.value = pendingVolume;
  masterGain.connect(ctx.destination);
  tone = ctx.createBiquadFilter();
  tone.type = 'highshelf';
  tone.frequency.value = TREBLE_SHELF_HZ;
  tone.gain.value = TREBLE_CUT_DB;
  tone.connect(masterGain);
  return ctx;
}

export function getContext() { return ctx; }

export function setVolume(v) {
  pendingVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = pendingVolume;
}

const SAMPLE_DIR = new URL('../assets/tabla/', import.meta.url);
const SAMPLE_RATE = 44100;
// Dha with its bass layer peaks near 1.5 at full level, so these leave room to avoid clipping.
const LEVEL = 0.55;
const SAM_LEVEL = 0.65;
const SUBDIVISION_LEVEL = 0.16;
const DAMP_TIME = 0.05;
const TREBLE_SHELF_HZ = 1500;
const TREBLE_CUT_DB = -6;
const FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

const DAYAN = 'dayan';
const BAYAN = 'bayan';

// Dha and Dhin are damped with the dayan; their Ge layer keeps ringing like the real bayan.
const STROKES = {
  dha: { files: ['dha-1', 'dha-2'], drums: [DAYAN] },
  dhin: { files: ['dhin-1', 'dhin-2'], drums: [DAYAN] },
  na: { files: ['na'], drums: [DAYAN], level: 0.75 },
  ta: { files: ['ta'], drums: [DAYAN], level: 0.75 },
  tin: { files: ['tin'], drums: [DAYAN] },
  tun: { files: ['tun'], drums: [DAYAN] },
  ti: { files: ['ti'], drums: [DAYAN] },
  ge: { files: ['ge'], drums: [BAYAN] },
  // Played on time, Ge partly cancels the bass already in the Dhin recordings; 2 ms lines them up.
  geForDhin: { files: ['ge'], drums: [BAYAN], delay: 0.002 },
  ke: { files: ['ke'], drums: [BAYAN] },
};

// Each bol is [stroke, position within the beat, optional level]. A rest has no entry and stays silent.
const BOLS = {
  Dha: [['dha', 0], ['ge', 0]],
  Dhin: [['dhin', 0], ['geForDhin', 0]],
  Dhi: [['ti', 0, 0.55], ['ge', 0]],
  Ta: [['ta', 0]],
  Na: [['na', 0]],
  Tin: [['tin', 0]],
  Ti: [['ti', 0]],
  Tit: [['ti', 0]],
  Tu: [['tun', 0]],
  Ge: [['ge', 0]],
  Ka: [['ke', 0]],
  Kat: [['ke', 0]],
  Kit: [['ke', 0], ['ti', 0.5]],
  DhaGe: [['dha', 0], ['ge', 0], ['ge', 0.5]],
  TirKit: [['ti', 0], ['ti', 0.25], ['ke', 0.5], ['ti', 0.75]],
  Gadi: [['ge', 0], ['ti', 0.5]],
  Gana: [['ge', 0], ['na', 0.5]],
};

const buffers = new Map();
const ringing = {};

async function fetchSample(file, attemptsLeft = FETCH_ATTEMPTS) {
  try {
    const res = await fetch(new URL(`${file}.wav`, SAMPLE_DIR));
    if (!res.ok) throw new Error(`${file}.wav: HTTP ${res.status}`);
    return await res.arrayBuffer();
  } catch (err) {
    if (attemptsLeft <= 1) throw err;
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchSample(file, attemptsLeft - 1);
  }
}

let samplesLoading = null;

// A failed load is forgotten so that pressing Start can try again.
export function loadSamples() {
  if (!samplesLoading) {
    samplesLoading = decodeSamples().catch(err => {
      samplesLoading = null;
      throw err;
    });
  }
  return samplesLoading;
}

// Decoded offline so samples are ready before the first tap creates the AudioContext.
async function decodeSamples() {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const decoder = new Offline(1, 1, SAMPLE_RATE);
  const files = Object.values(STROKES).flatMap(stroke => stroke.files);
  await Promise.all(files.map(async file => {
    const data = await fetchSample(file);
    // Callback form: older Safari has no promise-returning decodeAudioData.
    const buffer = await new Promise((ok, fail) => decoder.decodeAudioData(data, ok, fail));
    buffers.set(file, buffer);
  }));
}

function nextBuffer(stroke) {
  stroke.take = ((stroke.take ?? -1) + 1) % stroke.files.length;
  return buffers.get(stroke.files[stroke.take]);
}

function damp(voice, time) {
  voice.env.gain.setValueAtTime(voice.level, time);
  voice.env.gain.linearRampToValueAtTime(0, time + DAMP_TIME);
  voice.src.stop(time + DAMP_TIME);
}

function startStroke(stroke, time, level) {
  const scaled = level * (stroke.level ?? 1);
  const src = ctx.createBufferSource();
  src.buffer = nextBuffer(stroke);
  const env = ctx.createGain();
  env.gain.setValueAtTime(scaled, time);
  src.connect(env);
  env.connect(tone);
  src.start(time + (stroke.delay ?? 0));
  return { src, env, level: scaled };
}

// A new stroke silences the last one on the same drum, as the player's hand does.
function playStroke(name, time, level) {
  const stroke = STROKES[name];
  const voice = startStroke(stroke, time, level);
  for (const drum of stroke.drums) {
    if (ringing[drum]) damp(ringing[drum], time);
    ringing[drum] = voice;
  }
}

function startTime(time) {
  return time > ctx.currentTime ? time : ctx.currentTime + 0.005;
}

export function playBol(bol, time, beatDuration, isSam) {
  if (!ctx || !masterGain) return;
  const strokes = BOLS[bol];
  if (!strokes) return;
  const t = startTime(time);
  const level = isSam ? SAM_LEVEL : LEVEL;
  for (const [name, position, scale = 1] of strokes) {
    playStroke(name, t + position * beatDuration, level * scale);
  }
}

export function playSubdivision(time) {
  if (!ctx || !masterGain) return;
  startStroke(STROKES.ti, startTime(time), SUBDIVISION_LEVEL);
}
