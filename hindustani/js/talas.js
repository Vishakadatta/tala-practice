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

const FINGERS = [
  GESTURES.FINGER_LITTLE,
  GESTURES.FINGER_RING,
  GESTURES.FINGER_MIDDLE,
  GESTURES.FINGER_INDEX,
  GESTURES.FINGER_THUMB,
];

export const TALAS = [
  {
    id: 'teentaal',
    name: 'Teentaal',
    nameHi: 'तीनताल',
    matras: 16,
    vibhags: [4, 4, 4, 4],
    markers: ['×', '2', '0', '3'],
    theka: ['Dha','Dhin','Dhin','Dha','Dha','Dhin','Dhin','Dha',
            'Dha','Tin','Tin','Ta','Ta','Dhin','Dhin','Dha'],
  },
  {
    id: 'keherwa',
    name: 'Keherwa',
    nameHi: 'कहरवा',
    matras: 8,
    vibhags: [4, 4],
    markers: ['×', '0'],
    theka: ['Dha','Ge','Na','Ti','Na','Ka','Dhi','Na'],
  },
  {
    id: 'dadra',
    name: 'Dadra',
    nameHi: 'दादरा',
    matras: 6,
    vibhags: [3, 3],
    markers: ['×', '0'],
    theka: ['Dha','Dhin','Na','Dha','Tin','Na'],
  },
  {
    id: 'jhaptaal',
    name: 'Jhaptaal',
    nameHi: 'झपताल',
    matras: 10,
    vibhags: [2, 3, 2, 3],
    markers: ['×', '2', '0', '3'],
    theka: ['Dhi','Na','Dhi','Dhi','Na','Ti','Na','Dhi','Dhi','Na'],
  },
  {
    id: 'rupak',
    name: 'Rupak',
    nameHi: 'रूपक',
    matras: 7,
    vibhags: [3, 2, 2],
    markers: ['0', '2', '3'],
    samIsKhali: true,
    theka: ['Tin','Tin','Na','Dhi','Na','Dhi','Na'],
  },
  {
    id: 'ektaal',
    name: 'Ektaal',
    nameHi: 'एकताल',
    matras: 12,
    vibhags: [2, 2, 2, 2, 2, 2],
    markers: ['×', '0', '2', '0', '3', '4'],
    theka: ['Dhin','Dhin','DhaGe','TirKit','Tu','Na',
            'Kat','Ta','DhaGe','TirKit','Dhi','Na'],
  },
  {
    id: 'chautaal',
    name: 'Chautaal',
    nameHi: 'चौताल',
    matras: 12,
    vibhags: [2, 2, 2, 2, 2, 2],
    markers: ['×', '0', '2', '0', '3', '0'],
    theka: ['Dha','Dha','Dhin','Ta','Kit','Dha',
            'Dhin','Ta','Tit','Kat','Gadi','Gana'],
  },
  {
    id: 'deepchandi',
    name: 'Deepchandi',
    nameHi: 'दीपचंदी',
    matras: 14,
    vibhags: [3, 4, 3, 4],
    markers: ['×', '2', '0', '3'],
    theka: ['Dha','Dhin','—','Dha','Dha','Tin','—',
            'Ta','Tin','—','Dha','Dha','Dhin','—'],
  },
  {
    id: 'jhoomra',
    name: 'Jhoomra',
    nameHi: 'झूमरा',
    matras: 14,
    vibhags: [3, 4, 3, 4],
    markers: ['×', '2', '0', '3'],
    theka: ['Dhin','—','Dha','TirKit','Dhin','Dhin','DhaGe',
            'Tin','—','Ta','TirKit','Dhin','Dhin','DhaGe'],
  },
  {
    id: 'dhamar',
    name: 'Dhamar',
    nameHi: 'धमार',
    matras: 14,
    vibhags: [5, 2, 3, 4],
    markers: ['×', '2', '0', '3'],
    theka: ['Ka','Dhi','Ta','Dhi','Ta','Dha','—',
            'Ge','Ti','Ta','Ti','Ta','Ta','—'],
  },
  {
    id: 'tilwada',
    name: 'Tilwada',
    nameHi: 'तिलवाड़ा',
    matras: 16,
    vibhags: [4, 4, 4, 4],
    markers: ['×', '2', '0', '3'],
    theka: ['Dha','TirKit','Dhin','Dhin','Dha','Dha','Tin','Tin',
            'Ta','TirKit','Dhin','Dhin','Dha','Dha','Dhin','Dhin'],
  },
  {
    id: 'sultaal',
    name: 'Sultaal',
    nameHi: 'सूलताल',
    matras: 10,
    vibhags: [2, 2, 2, 2, 2],
    markers: ['×', '0', '2', '0', '3'],
    theka: ['Dha','Dha','Dhin','Ta','Tit','Kat',
            'Gadi','Gana','Dha','—'],
  },
];

export function expandTala(tala, kalai = 1) {
  const beats = [];
  let beatIdx = 0;

  for (let vi = 0; vi < tala.vibhags.length; vi++) {
    const size = tala.vibhags[vi];
    const marker = tala.markers[vi];
    const isKhali = marker === '0';
    const isSamMarker = marker === '×';
    const markerLabel = isKhali ? 'Khali' : (isSamMarker ? 'Sam' : `Tali ${marker}`);

    for (let i = 0; i < size; i++) {
      const isFirst = i === 0;
      const isSam = beatIdx === 0;

      let gesture;
      if (isFirst) {
        gesture = isKhali ? GESTURES.WAVE : GESTURES.CLAP;
      } else {
        gesture = FINGERS[(i - 1) % FINGERS.length];
      }

      for (let k = 0; k < kalai; k++) {
        const idx = beatIdx * kalai + k;
        beats.push({
          index: idx,
          gesture,
          angaName: markerLabel,
          angaIndex: vi,
          isSamam: isSam && k === 0,
          sound: isSam && k === 0 ? 'SAMAM'
            : gesture === GESTURES.WAVE ? 'WAVE'
            : gesture.startsWith('FINGER') ? 'FINGER'
            : 'CLAP',
          bol: tala.theka[beatIdx] || '',
          marker: isFirst ? marker : '',
        });
      }
      beatIdx++;
    }
  }
  return beats;
}
