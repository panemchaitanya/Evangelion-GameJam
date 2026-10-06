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
  // THE COUNTED ONE: one kid was already on the list. Their star is painted above a bed number.
  counted: { kid: 'ila', bed: 'nine' },
  ward: {
    beds: [{ kid: 'ness', bed: '7' }, { kid: 'bram', bed: '8' }, { kid: 'ila', bed: '9' }],
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
