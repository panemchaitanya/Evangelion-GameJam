# Lullaby118

*A lullaby for the ones who stayed awake.*

**Play it now: https://lullaby118-git-indy-evangelion.vercel.app/** (runs in any modern browser, phone or desktop, no install)

Lullaby118 is a short, quiet escape platformer. Three children wake in the night inside Greywillow House, a place that keeps forty lamps burning. They have to get out together. Each of them can do something the others cannot, and the House is listening.

Built for the TGC Game Jam 2026 (Infinium'26, IIIT-H) by **Team Evangelion**.

This is *The Stars That Sank Us to Sleep, Part 1: Lullaby*.

## Premise

Greywillow House keeps forty lamps burning, and they burn on the sleep of children. Tonight three of them woke up: Ness, Bram and Ila. Follow the stars. Find the way out.

Something walks the halls and keeps watch over them. You do not fight it. You hide, you wait, you move when it looks away, and you bring all three children through. There is more going on in this House than the first room lets on.

## How to play

You lead one child at a time. The other two follow. Switch who leads to get past what the current child cannot.

- **Ness** is small and quick and fits through low gaps.
- **Bram** is strong enough to move the heavy crates.
- **Ila** walks the quietest, so she makes the least noise near what is watching.

### Keyboard

| Action | Keys |
| --- | --- |
| Move | A / D or Left / Right |
| Jump | Space, W or Up |
| Interact | E, S or Down |
| Switch who leads | Q or Tab, or 1 / 2 / 3 for a specific child |
| Pause | Esc or P |
| Restart from checkpoint | R |

### Touch

An on-screen stick moves the lead child. Two buttons jump and interact. Three small buttons across the top choose who leads. Rotate to landscape for the best fit.

### Tips

- Stand still when the lantern beam is on you. The warden only reacts to movement.
- Plates stay pressed once they have been held. Think before you let go of a crate.
- Headphones help. The House has a sound, and it matters.

## Tech

- TypeScript, React and Vite
- Canvas 2D rendering, with the game world drawn in code
- Web Audio API for sound effects and ambience, generated live
- Recorded audio (all CC0): the warden's hum and the chapter music, see Credits below
- Comic panels for the intro, outro and chapter pages, made for this jam
- Vitest for unit tests and Playwright scripts for end to end runs
- Static build, hosted on Vercel

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev      # develop
npm run build    # production build in dist/
npm test         # unit tests
```

Add `?debug=1` to the URL for a debug overlay.

## Team

Team Evangelion

- Panem Chaitanya Pavan Kumar
- Prakash Bhabad
- Metta Venkata Ramana Murthy

## Documents

The project proposal is in this repo: [proposal.pdf](proposal.pdf).

## Audio credits

All recorded audio is CC0.

- **Music** (chapter, intro and finale tracks): from a CC0 pack. Contributors credited by the pack: Tsorthan Grove, congusbongus, epb9000, yd, gmason, Emma_MA, rubberduck, bart, Spring Spring, Bobjt, Exewin and artisticdude.
- **Warden hum**: "woman humming distant echo" by Pennywind, Freesound 816686, CC0.

## Comic art

The comic panels (intro, outro and the chapter pages) were made for this jam entry.

## Credits and license

Lullaby118 (this build) starts from the open source engine **MOTH** by ahmedallam222 (https://github.com/ahmedallam222/moth-game), released under the MIT license. This repository is also MIT licensed. This project rebuilds its look, characters, mechanics, text and story on top of that engine. The original copyright notice is kept in [LICENSE](LICENSE). Full attributions, including the audio sample, are in [CREDITS.md](CREDITS.md).
