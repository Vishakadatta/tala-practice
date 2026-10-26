import { TALAS, expandTala } from './talas.js';
import * as hands from './hands.js';
import * as engine from './engine.js';
import { initAudio, getContext, setVolume } from './audio.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let currentTala = null;
let playing = false;

async function boot() {
  const canvas = $('#scene');
  const wrap = $('#canvas-wrap');

  await hands.init(canvas);

  const ro = new ResizeObserver(() => {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    hands.resize(w, h);
  });
  ro.observe(wrap);

  buildSidebar();
  wireControls();

  selectTala(TALAS[0]);
}

function buildSidebar() {
  const list = $('#tala-list');
  for (const tala of TALAS) {
    const li = document.createElement('li');
    li.textContent = tala.common;
    li.dataset.id = tala.id;
    li.addEventListener('click', () => selectTala(tala));
    list.appendChild(li);
  }

  $('#sidebar-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('collapsed');
  });
}

function selectTala(tala) {
  currentTala = tala;

  if (playing) stopPlayback();

  $$('#tala-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.id === tala.id);
  });

  const name = tala.common !== tala.name
    ? `${tala.name} (${tala.common})`
    : tala.name;
  $('#tala-name').textContent = name;

  const totalBeats = tala.chapu ? tala.beats : tala.angas.reduce((s, a) => s + a.beats, 0);
  $('#tala-info').textContent = `${totalBeats} beats · ${tala.symbol}`;

  const kalaiLabel = $('#kalai-label');
  kalaiLabel.style.display = tala.hasKalai ? '' : 'none';
  $('#kalai-toggle').checked = false;
  engine.setKalai(1);

  buildAngaStrip(tala);
  engine.setTala(tala);

  $('#btn-start').disabled = false;
  hands.setPose('REST');
}

function buildAngaStrip(tala) {
  const strip = $('#anga-strip');
  strip.innerHTML = '';

  const beats = expandTala(tala, engine.getKalai());
  let currentAnga = -1;
  let angaDiv = null;
  let beatsDiv = null;

  for (const beat of beats) {
    if (beat.angaIndex !== currentAnga) {
      currentAnga = beat.angaIndex;
      angaDiv = document.createElement('div');
      angaDiv.className = 'anga-group';

      const label = document.createElement('span');
      label.className = 'anga-group-label';
      label.textContent = beat.angaName;
      angaDiv.appendChild(label);

      beatsDiv = document.createElement('div');
      beatsDiv.className = 'anga-beats';
      angaDiv.appendChild(beatsDiv);

      strip.appendChild(angaDiv);
    }

    const cell = document.createElement('div');
    cell.className = 'beat-cell';
    cell.dataset.beat = beat.index;

    const num = document.createElement('span');
    num.textContent = beat.index + 1;
    cell.appendChild(num);

    const nadai = parseInt($('#nadai-select').value) || 4;
    const dots = document.createElement('div');
    dots.className = 'sub-dots';
    for (let i = 1; i < nadai; i++) {
      dots.appendChild(document.createElement('span'));
    }
    cell.appendChild(dots);

    beatsDiv.appendChild(cell);
  }

  $('#anga-label').textContent = '';
}

function scheduleUI(beatIndex, beat, time) {
  const ctx = getContext();
  if (!ctx) return;
  const delay = Math.max(0, (time - ctx.currentTime) * 1000);
  setTimeout(() => {
    if (!playing) return;

    $$('.beat-cell').forEach(c => c.classList.remove('active'));
    const cell = $(`.beat-cell[data-beat="${beatIndex}"]`);
    if (cell) cell.classList.add('active');

    $('#anga-label').textContent = beat.angaName;

    const pose = beat.gesture === 'NONE' ? 'REST' : beat.gesture;
    hands.setPose(pose);
  }, delay);
}

function startPlayback() {
  initAudio();
  engine.onBeatCallback(scheduleUI);
  engine.start();
  playing = true;
  $('#btn-start').textContent = 'Stop';
}

function stopPlayback() {
  engine.stop();
  playing = false;
  $('#btn-start').textContent = 'Start';
  $$('.beat-cell').forEach(c => c.classList.remove('active'));
  $('#anga-label').textContent = '';
  hands.setPose('REST');
}

function wireControls() {
  $('#btn-start').addEventListener('click', () => {
    if (playing) stopPlayback();
    else startPlayback();
  });

  $$('.tempo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta);
      const next = Math.max(30, Math.min(160, engine.getBpm() + delta));
      engine.setBpm(next);
      $('#tempo-display').textContent = `${next} BPM`;
    });
  });

  $('#nadai-select').addEventListener('change', e => {
    engine.setNadai(parseInt(e.target.value));
    if (currentTala) buildAngaStrip(currentTala);
  });

  $('#volume').addEventListener('input', e => {
    setVolume(parseFloat(e.target.value));
  });

  $('#kalai-toggle').addEventListener('change', e => {
    engine.setKalai(e.target.checked ? 2 : 1);
    if (currentTala) {
      buildAngaStrip(currentTala);
      engine.setTala(currentTala);
    }
  });

  let handsVisible = true;
  $('#btn-hide-hands').addEventListener('click', () => {
    handsVisible = !handsVisible;
    hands.setVisible(handsVisible);
    $('#btn-hide-hands').textContent = handsVisible ? 'Hide hands' : 'Show hands';
  });

  $('#reset-view').addEventListener('click', () => hands.resetView());

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      $('#btn-start').click();
    }
  });
}

boot();
