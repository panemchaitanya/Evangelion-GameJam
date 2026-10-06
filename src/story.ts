// ─────────────────────────────────────────────────────────────────────────────
// STORY: the ONE place for names and story text. Swap these when the owner rules.
// Open owner calls: warden name (Matron vs Mother), kid genders, 1 vs 3 endings, chime motif.
// ─────────────────────────────────────────────────────────────────────────────
export interface Ending { id: string; title: string; sub: string; cards: string[] }

export const STORY = {
  kids: { ness: 'Ness', bram: 'Bram', ila: 'Ila' },
  warden: 'Mother',          // swap to 'the Matron' if the owner picks it
  lostChild: 'Tom',
  intro: [
    'Greywillow House keeps forty lamps burning.',
    'They burn on the sleep of children.',
    'Tonight three of them woke up.',
    'Ness. Bram. Ila. Follow the stars. Find the way out.',
  ],
  // comic panels: intro plays once on boot before the title, outro plays after the ward. Missing images are skipped.
  panels: {
    intro: [
      { src: 'panels/intro1.jpg', cap: 'the house keeps one window dark.' },
      { src: 'panels/intro2.jpg', cap: 'three small shadows looked up.' },
      { src: 'panels/intro3.jpg', cap: 'the light found the footprints.' },
    ],
    outro: [
      { src: 'panels/outro1.jpg', cap: 'the gate was open. it was not freedom.' },
      { src: 'panels/outro2.jpg', cap: 'the stars were looking back.' },
      { src: 'panels/pageE.jpg', cap: '', page: true },
    ],
    // wordless comic page shown before each chapter (keyed by chapter index). Missing file = skipped silently.
    chapter: { 1: 'panels/pageA.jpg', 2: 'panels/pageB.jpg', 3: 'panels/pageC.jpg', 4: 'panels/pageD.jpg' } as Record<number, string>,
  },
  // THE COUNTED ONE: one kid was already on the list. Their star is painted above a bed number.
  counted: { kid: 'ila', bed: 'nine' },
  ward: {
    beds: [{ kid: 'ness', bed: '7' }, { kid: 'ila', bed: '9' }, { kid: 'bram', bed: '8' }], // display order: Ila dead center
    lines: ['Under the glass, all three. Still breathing.', '', '', 'Wake up again.'],
  },
  // one ending for now. Add more objects here and set `endingId`; chosen by which one is active.
  endingId: 'ran',
  endings: [
    {
      id: 'ran',
      title: 'they never left',
      sub: 'a lullaby for the ones who stayed awake.',
      cards: [
        'The gate opens.',
        'A sky full of lights.',
        'They are not stars.',
      ],
    },
  ] as Ending[],
};

export const activeEnding = (): Ending => STORY.endings.find(e => e.id === STORY.endingId) ?? STORY.endings[0];
export const KID_NAMES = [STORY.kids.ness, STORY.kids.bram, STORY.kids.ila];
