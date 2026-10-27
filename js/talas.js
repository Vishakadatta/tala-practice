// Anga types: L = laghu, D = drutam, A = anudrutam
// Gestures: CLAP, FINGER_LITTLE, FINGER_RING, FINGER_MIDDLE, FINGER_INDEX, FINGER_THUMB, WAVE, NONE

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

function laghu(jati) {
  const g = [GESTURES.CLAP];
  const fingers = [
    GESTURES.FINGER_LITTLE,
    GESTURES.FINGER_RING,
    GESTURES.FINGER_MIDDLE,
    GESTURES.FINGER_INDEX,
    GESTURES.FINGER_THUMB,
  ];
  for (let i = 0; i < jati - 1; i++) {
    g.push(fingers[i % fingers.length]);
  }
  return { type: 'L', name: 'Laghu', jati, beats: jati, gestures: g };
}

function drutam() {
  return { type: 'D', name: 'Drutam', beats: 2, gestures: [GESTURES.CLAP, GESTURES.WAVE] };
}

function anudrutam() {
  return { type: 'A', name: 'Anudrutam', beats: 1, gestures: [GESTURES.CLAP] };
}

export const TALAS = [
  {
    id: 'adi',
    name: 'Chatusra Jathi Triputa Tala',
    common: 'Adi Tala',
    symbol: '|4 O O',
    hasKalai: true,
    angas: [laghu(4), drutam(), drutam()],
  },
  {
    id: 'rupaka',
    name: 'Chatusra Jathi Rupaka Tala',
    common: 'Rupaka Tala',
    // Traditional 6-beat keeping: Drutam (clap+wave) + Laghu-4 (clap, little, ring, middle)
    // Samam on the Drutam clap: clap · wave · clap · little · ring · middle
    symbol: 'O |',
    hasKalai: false,
    angas: [drutam(), laghu(4)],
  },
  {
    id: 'misra_chapu',
    name: 'Misra Chapu',
    common: 'Misra Chapu',
    // 3+2+2 = 7 beats; clap on beat 1 (samam), beat 4, beat 6 (1-indexed)
    symbol: '(3+2+2)',
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
    // 2+1+2 = 5 beats; clap on beats 1, 3, 4 (1-indexed) = indices 0, 2, 3
    symbol: '(2+1+2)',
    hasKalai: false,
    chapu: true,
    beats: 5,
    groups: [2, 1, 2],
    groupNames: ['Clap (2)', 'Clap (1)', 'Clap (2)'],
    clapBeats: [0, 2, 3],
  },
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
