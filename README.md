# THE STARS THAT SANK US TO SLEEP

*A lullaby for the ones who stayed awake.*

Part 1: Lullaby

**Play it now: https://lullaby118-git-indy-evangelion.vercel.app/** (runs in any modern browser, phone or desktop, no install)

The game is a short, quiet escape platformer. Three children wake in the night inside Greywillow House, a place that keeps forty lamps burning. They have to get out together. Each of them can do something the others cannot, and the House is listening.

Built for the TGC Game Jam 2026 (Infinium'26, IIIT-H) by **Team Evangelion**.

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
- Recorded audio (all CC0): chapter and comic-page music, sound effects and the warden's hum, see Audio and art credits below
- Comic pages for the intro, chapters, ward and ending, made for this jam
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

## Audio and art credits

All recorded audio is CC0, from OpenGameArt contributors: Tozan, yd, TinyWorlds, NekroRave, Rogudex, congusbongus, epb9000, gmason, Spring Spring, Zane Little Music, Emma_MA, rubberduck, artisticdude and Bobjt. The warden hum is "woman humming distant echo" by Pennywind (Freesound, CC0).

The comic pages were made for this jam entry by Team Evangelion.

The exact file-by-file register of every shipped sound, music track and image is in [CREDITS.md](CREDITS.md).

## Credits and license

This game starts from the open source engine **MOTH**, released under the MIT license. This repository is also MIT licensed. This project rebuilds its look, characters, mechanics, text and story on top of that engine. The original copyright notice is kept in [LICENSE](LICENSE). Full attributions, including the audio, are in [CREDITS.md](CREDITS.md).
