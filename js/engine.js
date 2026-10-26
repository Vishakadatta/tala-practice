import { expandTala } from './talas.js';
import { playSound, getContext } from './audio.js';

let running = false;
let currentTala = null;
let beats = [];
let beatIndex = 0;
let bpm = 60;
let nadai = 4;
let kalai = 1;
let nextBeatTime = 0;
let onBeat = null;
let onSubBeat = null;
let schedulerId = null;

const LOOKAHEAD = 0.1;
const INTERVAL = 25;

export function setTala(tala) {
  stop();
  currentTala = tala;
  beats = expandTala(tala, kalai);
  beatIndex = 0;
}

export function getTala() { return currentTala; }
export function getBeats() { return beats; }
export function getBeatIndex() { return beatIndex; }
export function isRunning() { return running; }

export function setBpm(v) { bpm = Math.max(30, Math.min(160, v)); }
export function getBpm() { return bpm; }

export function setNadai(v) { nadai = v; }
export function getNadai() { return nadai; }

export function setKalai(v) {
  kalai = v;
  if (currentTala) beats = expandTala(currentTala, kalai);
}
export function getKalai() { return kalai; }

export function onBeatCallback(fn) { onBeat = fn; }
export function onSubBeatCallback(fn) { onSubBeat = fn; }

export function start() {
  const ctx = getContext();
  if (!ctx || !currentTala) return;
  if (ctx.state === 'suspended') ctx.resume();

  running = true;
  beatIndex = 0;
  nextBeatTime = ctx.currentTime + 0.05;
  scheduler();
}

export function stop() {
  running = false;
  if (schedulerId !== null) {
    clearTimeout(schedulerId);
    schedulerId = null;
  }
}

function scheduler() {
  if (!running) return;
  const ctx = getContext();
  if (!ctx) return;

  const beatDuration = 60 / bpm;
  const subDuration = beatDuration / nadai;

  while (nextBeatTime < ctx.currentTime + LOOKAHEAD) {
    const beat = beats[beatIndex];
    playSound(beat.sound, nextBeatTime);

    if (onBeat) onBeat(beatIndex, beat, nextBeatTime);

    for (let s = 1; s < nadai; s++) {
      const subTime = nextBeatTime + s * subDuration;
      playSound('NADAI', subTime);
      if (onSubBeat) onSubBeat(beatIndex, s, subTime);
    }

    nextBeatTime += beatDuration;
    beatIndex = (beatIndex + 1) % beats.length;
  }

  schedulerId = setTimeout(scheduler, INTERVAL);
}
