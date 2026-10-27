// Suladi Sapta Tala system: 7 talas × 5 jatis = 35 talas, plus 2 chapu talas.
// Anga types: L = laghu (variable), D = drutam (2 beats), A = anudrutam (1 beat)
// Jatis: Tisra=3, Chatusra=4, Khanda=5, Misra=7, Sankeerna=9

export const GESTURES = {
  CLAP: 'CLAP',
  FINGER_LITTLE: 'FINGER_LITTLE',
  FINGER_RING: 'FINGER_RING',
  FINGER_MIDDLE: 'FINGER_MIDDLE',
  FINGER_INDEX: 'FINGER_INDEX',
  FINGER_THUMB: 'FINGER_THUMB',
  WAVE: 'WAVE',
  NONE: 'NONE',
};

// Jati definitions
const JATIS = [
  { name: 'Tisra',     beats: 3 },
  { name: 'Chatusra',  beats: 4 },
  { name: 'Khanda',    beats: 5 },
  { name: 'Misra',     beats: 7 },
  { name: 'Sankeerna', beats: 9 },
];

function laghu(jati) {
  const g = [GESTURES.CLAP];
  const fingers = [
    GESTURES.FINGER_LITTLE,
    GESTURES.FINGER_RING,
    GESTURES.FINGER_MIDDLE,
    GESTURES.FINGER_INDEX,
    GESTURES.FINGER_THUMB,
  ];
  for (let i = 0; i < jati - 1; i++) g.push(fingers[i % fingers.length]);
  return { type: 'L', name: 'Laghu', jati, beats: jati, gestures: g };
}

function drutam() {
  return { type: 'D', name: 'Drutam', beats: 2, gestures: [GESTURES.CLAP, GESTURES.WAVE] };
}

function anudrutam() {
  return { type: 'A', name: 'Anudrutam', beats: 1, gestures: [GESTURES.CLAP] };
}

// Suladi Sapta Tala family definitions
// Format: { familyId, familyName, symbol(jati), angasFn(jati) }
const SAPTA_FAMILIES = [
  {
    familyId: 'dhruva',
    familyName: 'Dhruva',
    // L D L L  — symbol uses | for laghu, O for drutam
    symbolFn: j => `|${j} O |${j} |${j}`,
    angasFn: j => [laghu(j), drutam(), laghu(j), laghu(j)],
  },
  {
    familyId: 'mathya',
    familyName: 'Mathya',
    // L D L
    symbolFn: j => `|${j} O |${j}`,
    angasFn: j => [laghu(j), drutam(), laghu(j)],
  },
  {
    familyId: 'rupaka',
    familyName: 'Rupaka',
    // D L
    symbolFn: j => `O |${j}`,
    angasFn: j => [drutam(), laghu(j)],
  },
  {
    familyId: 'jhampa',
    familyName: 'Jhampa',
    // L A D
    symbolFn: j => `|${j} U O`,
    angasFn: j => [laghu(j), anudrutam(), drutam()],
  },
  {
    familyId: 'triputa',
    familyName: 'Triputa',
    // L D D
    symbolFn: j => `|${j} O O`,
    angasFn: j => [laghu(j), drutam(), drutam()],
  },
  {
    familyId: 'ata',
    familyName: 'Ata',
    // L L D D
    symbolFn: j => `|${j} |${j} O O`,
    angasFn: j => [laghu(j), laghu(j), drutam(), drutam()],
  },
  {
    familyId: 'eka',
    familyName: 'Eka',
    // L
    symbolFn: j => `|${j}`,
    angasFn: j => [laghu(j)],
  },
];

// Jati short names for tala common names
const JATI_PREFIX = {
  3: 'Tisra Jathi',
  4: 'Chatusra Jathi',
  5: 'Khanda Jathi',
  7: 'Misra Jathi',
  9: 'Sankeerna Jathi',
};

// Build all 35 suladi talas
function buildSaptaTalas() {
  const talas = [];
  for (const fam of SAPTA_FAMILIES) {
    for (const jati of JATIS) {
      const j = jati.beats;
      const angas = fam.angasFn(j);
      const totalBeats = angas.reduce((s, a) => s + a.beats, 0);
      // Chatusra Triputa = Adi Tala (special case common name)
      const isAdi = fam.familyId === 'triputa' && j === 4;
      // Chatusra Rupaka = the common Rupaka
      const isCommonRupaka = fam.familyId === 'rupaka' && j === 4;
      talas.push({
        id: `${fam.familyId}_${j}`,
        name: `${JATI_PREFIX[j]} ${fam.familyName} Tala`,
        common: isAdi
          ? 'Adi Tala'
          : isCommonRupaka
          ? 'Rupaka Tala'
          : `${jati.name} ${fam.familyName}`,
        symbol: fam.symbolFn(j),
        group: fam.familyName,
        hasKalai: isAdi,
        totalBeats,
        angas,
      });
    }
  }
  return talas;
}

const SAPTA_TALAS = buildSaptaTalas();

// Chapu talas (not part of the sapta system)
const CHAPU_TALAS = [
  {
    id: 'misra_chapu',
    name: 'Misra Chapu',
    common: 'Misra Chapu',
    symbol: '(3+2+2)',
    group: 'Chapu',
    hasKalai: false,
    chapu: true,
    beats: 7,
    groups: [3, 2, 2],
    groupNames: ['Clap (3)', 'Clap (2)', 'Clap (2)'],
    clapBeats: [0, 3, 5],
  },
  {
    id: 'khanda_chapu',
    name: 'Khanda Chapu',
    common: 'Khanda Chapu',
    symbol: '(2+1+2)',
    group: 'Chapu',
    hasKalai: false,
    chapu: true,
    beats: 5,
    groups: [2, 1, 2],
    groupNames: ['Clap (2)', 'Clap (1)', 'Clap (2)'],
    clapBeats: [0, 2, 3],
  },
];

// Pin Adi Tala and Rupaka Tala to the top, then all others in family order.
// This matches common practice: learners start with Adi and Rupaka.
const PINNED_IDS = ['triputa_4', 'rupaka_4'];
const pinnedTalas = PINNED_IDS.map(id => SAPTA_TALAS.find(t => t.id === id));
const otherTalas  = [...SAPTA_TALAS, ...CHAPU_TALAS].filter(t => !PINNED_IDS.includes(t.id));

export const TALAS = [
  ...pinnedTalas.map(t => ({ ...t, group: 'Common' })),
  ...otherTalas,
];

export function expandTala(tala, kalai = 1) {
  if (tala.chapu) {
    const beats = [];
    let beatIdx = 0;
    let groupIdx = 0;
    for (const groupSize of tala.groups) {
      const groupName = tala.groupNames
        ? tala.groupNames[groupIdx]
        : `Group ${groupIdx + 1}`;
      for (let i = 0; i < groupSize; i++) {
        const isClap = tala.clapBeats.includes(beatIdx);
        beats.push({
          index: beatIdx,
          gesture: isClap ? GESTURES.CLAP : GESTURES.WAVE,
          angaName: groupName,
          angaIndex: groupIdx,
          isSamam: beatIdx === 0,
          sound: isClap ? (beatIdx === 0 ? 'SAMAM' : 'CLAP') : 'CHAPU_TICK',
        });
        beatIdx++;
      }
      groupIdx++;
    }
    return beats;
  }

  const beats = [];
  let beatIdx = 0;
  for (let ai = 0; ai < tala.angas.length; ai++) {
    const anga = tala.angas[ai];
    for (let bi = 0; bi < anga.beats; bi++) {
      const gesture = tala.overrideGestures
        ? tala.overrideGestures[beatIdx]
        : anga.gestures[bi];
      for (let k = 0; k < kalai; k++) {
        beats.push({
          index: beatIdx * kalai + k,
          gesture,
          angaName: anga.name + (anga.jati ? ` (${anga.jati})` : ''),
          angaIndex: ai,
          isSamam: beatIdx === 0 && k === 0,
          sound: beatIdx === 0 && k === 0 ? 'SAMAM'
            : gesture === GESTURES.WAVE ? 'WAVE'
            : gesture.startsWith('FINGER') ? 'FINGER'
            : 'CLAP',
        });
      }
      beatIdx++;
    }
  }
  return beats;
}
