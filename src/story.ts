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
    // file names: public/panels/<name>.jpg. Missing files are skipped. No captions are rendered.
    intro: ['intro0', 'intro1b', 'intro1', 'intro2', 'intro3'].map(n => ({ src: `panels/${n}.jpg`, cap: '' })),
    outro: [
      ...['outro1', 'outroO1', 'outroO2', 'outro2', 'outroO3'].map(n => ({ src: `panels/${n}.jpg`, cap: '' })),
      ...['finF1', 'finF2', 'pageE', 'finF3', 'finF4', 'tomvigil'].map(n => ({ src: `panels/${n}.jpg`, cap: n === 'finF1' ? 'The first child she ever lost was her own.' : '', page: true })),
    ],
    // comic pages shown before each chapter (keyed by chapter index), once per page load.
    chapter: {
      1: ['pageA0', 'pageA', 'pageA2', 'pageA3', 'pageA4', 'crumb1'],
      2: ['pageB0', 'pageB', 'pageB2', 'pageB3', 'crumb2'],
      3: ['pageC0', 'pageC', 'pageC2', 'pageC3', 'pageC4', 'crumb3'],
      4: ['pageD1', 'pageD', 'pageD2', 'pageD3', 'pageD4'],
    } as Record<number, string[]>,
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
