import { TALAS, expandTala } from './talas.js';
import * as hands from './hands.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let currentTala = null;

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

  // Select Adi by default
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

  // Update active sidebar item
  $$('#tala-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.id === tala.id);
  });

  // Header
  const name = tala.common !== tala.name
    ? `${tala.name} (${tala.common})`
    : tala.name;
  $('#tala-name').textContent = name;

  const totalBeats = tala.chapu ? tala.beats : tala.angas.reduce((s, a) => s + a.beats, 0);
  $('#tala-info').textContent = `${totalBeats} beats · ${tala.symbol}`;

  // Kalai toggle
  const kalaiLabel = $('#kalai-label');
  kalaiLabel.style.display = tala.hasKalai ? '' : 'none';
  $('#kalai-toggle').checked = false;

  // Build anga strip
  buildAngaStrip(tala);

  // Enable start
  $('#btn-start').disabled = false;

  // Set hands to rest
  hands.setPose('REST');
}

function buildAngaStrip(tala) {
  const strip = $('#anga-strip');
  strip.innerHTML = '';

  const beats = expandTala(tala, 1);
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

    // Sub-beat dots (placeholder for nadai display)
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

function wireControls() {
  // Start/Stop
  $('#btn-start').addEventListener('click', () => {
    // Will be wired to engine in M2
  });

  // Tempo
  $$('.tempo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta);
      const current = parseInt($('#tempo-display').textContent) || 60;
      const next = Math.max(30, Math.min(160, current + delta));
      $('#tempo-display').textContent = `${next} BPM`;
    });
  });

  // Nadai
  $('#nadai-select').addEventListener('change', () => {
    if (currentTala) buildAngaStrip(currentTala);
  });

  // Volume
  $('#volume').addEventListener('input', e => {
    // Will connect to audio in M2
  });

  // Hide hands
  let handsVisible = true;
  $('#btn-hide-hands').addEventListener('click', () => {
    handsVisible = !handsVisible;
    hands.setVisible(handsVisible);
    $('#btn-hide-hands').textContent = handsVisible ? 'Hide hands' : 'Show hands';
  });

  // Reset view
  $('#reset-view').addEventListener('click', () => hands.resetView());

  // Spacebar for start/stop
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      $('#btn-start').click();
    }
  });

  // Debug: number keys for poses (temporary, for M1 screenshots)
  document.addEventListener('keydown', e => {
    const poseMap = {
      '0': 'REST',
      '1': 'CLAP',
      '2': 'FINGER_LITTLE',
      '3': 'FINGER_RING',
      '4': 'FINGER_MIDDLE',
      '5': 'FINGER_INDEX',
      '6': 'FINGER_THUMB',
      '7': 'WAVE',
    };
    if (poseMap[e.key] && e.target === document.body) {
      hands.setPose(poseMap[e.key]);
    }
  });
}

boot();
