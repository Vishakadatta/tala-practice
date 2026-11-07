import { TALAS, expandTala } from './talas.js';
import * as hands from './hands.js';
import * as engine from './engine.js';
import { initAudio, getContext, setVolume, loadSamples } from './audio.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let currentTala = null;
let playing = false;

async function boot() {
  const canvas = $('#scene');
  const wrap = $('#canvas-wrap');

  const samplesLoaded = loadSamples().catch(err => {
    console.error('Tabla samples failed to load:', err);
    $('#sound-error').hidden = false;
  });
  await Promise.all([hands.init(canvas), samplesLoaded]);

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
    li.innerHTML = `<span class="tala-item-name">${tala.name}</span><span class="tala-item-hi">${tala.nameHi}</span>`;
    li.dataset.id = tala.id;
    li.addEventListener('click', () => { selectTala(tala); collapseSidebarOnMobile(); });
    list.appendChild(li);
  }

  $('#sidebar-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });
}

function collapseSidebarOnMobile() {
  if (window.innerWidth <= 768) {
    $('#sidebar').classList.remove('open');
  }
}

function selectTala(tala) {
  currentTala = tala;
  if (playing) stopPlayback();

  $$('#tala-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.id === tala.id);
  });

  $('#tala-name').textContent = `${tala.name}`;
  $('#tala-name-hi').textContent = tala.nameHi;

  const structure = tala.vibhags.join('+');
  const markerStr = tala.markers.join(' ');
  $('#tala-info').textContent = `${tala.matras} matras · ${structure} · ${markerStr}`;

  const thekaStr = [];
  let idx = 0;
  for (const size of tala.vibhags) {
    thekaStr.push(tala.theka.slice(idx, idx + size).join(' '));
    idx += size;
  }
  $('#theka-display').textContent = thekaStr.join(' | ');

  buildBeatStrip(tala);
  engine.setTala(tala);

  $('#btn-start').disabled = false;
  hands.setPose('REST');
}

function buildBeatStrip(tala) {
  const strip = $('#anga-strip');
  strip.innerHTML = '';

  const beats = expandTala(tala, engine.getKalai());
  let currentVibhag = -1;
  let groupDiv = null;
  let beatsDiv = null;

  for (const beat of beats) {
    if (beat.angaIndex !== currentVibhag) {
      currentVibhag = beat.angaIndex;
      groupDiv = document.createElement('div');
      groupDiv.className = 'anga-group';

      const label = document.createElement('span');
      label.className = 'anga-group-label';
      const m = tala.markers[currentVibhag];
      label.textContent = m;
      if (m === '0') label.classList.add('khali-marker');
      else if (m === '×') label.classList.add('sam-marker');
      groupDiv.appendChild(label);

      beatsDiv = document.createElement('div');
      beatsDiv.className = 'anga-beats';
      groupDiv.appendChild(beatsDiv);

      strip.appendChild(groupDiv);
    }

    const cell = document.createElement('div');
    cell.className = 'beat-cell';
    cell.dataset.beat = beat.index;

    const num = document.createElement('span');
    num.className = 'beat-num';
    num.textContent = beat.index + 1;
    cell.appendChild(num);

    const bol = document.createElement('span');
    bol.className = 'beat-bol';
    bol.textContent = beat.bol;
    cell.appendChild(bol);

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

  const poseOf = b => (b.gesture === 'NONE' ? 'REST' : b.gesture);
  hands.schedulePose(poseOf(beat), time);

  const beats = engine.getBeats();
  hands.schedulePose(poseOf(beats[(beatIndex + 1) % beats.length]), time + 60 / engine.getBpm(), true);

  const delay = Math.max(0, (time - ctx.currentTime) * 1000);
  setTimeout(() => {
    if (!playing) return;

    $$('.beat-cell').forEach(c => c.classList.remove('active'));
    const cell = $(`.beat-cell[data-beat="${beatIndex}"]`);
    if (cell) cell.classList.add('active');

    $('#anga-label').textContent = beat.angaName;
  }, delay);
}

function startPlayback() {
  const ctx = initAudio();
  hands.setClock(() => ctx.currentTime);
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
  hands.settle();
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
    if (currentTala) buildBeatStrip(currentTala);
  });

  $('#volume').addEventListener('input', e => {
    setVolume(parseFloat(e.target.value) / 100);
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

  if (location.search.includes('debug')) {
    const poses = ['REST', 'CLAP', 'FINGER_LITTLE', 'FINGER_RING', 'FINGER_MIDDLE',
      'FINGER_INDEX', 'FINGER_THUMB', 'WAVE'];
    document.addEventListener('keydown', e => {
      const i = parseInt(e.key, 10);
      if (!playing && i >= 0 && i < poses.length) hands.setPose(poses[i]);
    });
  }
}

boot();
