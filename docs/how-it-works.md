# How it works

This page explains what happens between pushing a `.csd` and a visitor hearing it, and why CSDs sometimes behave differently in the browser than in desktop Csound. You don't need any of it to publish instruments. It helps when an instrument doesn't do what you expect, or when you want to change the site's code.

## The parts

```
your repository                        visitor's browser
───────────────                        ─────────────────
instruments/*.csd ──┐                  index.html + site/  (the page: header, list, layout)
portfolio.json ─────┤   npm run build        │
site/, player/ ─────┴──────────────────▶     ▼
                       dist/ (static)   <csound-player>    (player/: toolbar, editor, controls)
                                               │
                                               ▼
                                        Csound engine ── AudioWorklet ── speakers
                                               ▲
                                  csound.wasm from unpkg.com (official build, downloaded once)
```

| Folder or file | What it is | Do you change it? |
|---|---|---|
| `instruments/` | Your CSDs, one per file or folder | Yes: this is your content |
| `portfolio.json` | Name, photo, bio, links, layout, player defaults | Yes |
| `profile.png` | The profile photo `portfolio.json` points to | Replace it with your own |
| `site/` | The portfolio page: list, header, layouts (`site/layouts/*.css`) | Freely (see [custom-layouts.md](custom-layouts.md)) |
| `index.html`, `play.html` | The two pages | Freely |
| `player/` | The player and the Csound engine | Normally not; updates from the template arrive here |
| `scripts/` | Build helpers: the instrument list, the instrument check | Rarely |
| `tests/` | Unit and browser tests | When you change the code |

`site/` uses the player only through `player/index.ts`, and `player/` never uses `site/`. That separation keeps template updates to `player/` from touching your design.

## From `.csd` to the site

1. **`npm run build`** (or the deploy workflow) scans `instruments/`. For each CSD it reads the `@INSTRUMENT` line and the `@WIDGET` comments, detects whether the instrument uses MIDI, and writes `instruments.json`, the list the page shows. It copies the CSDs, `portfolio.json` and your profile photo into `dist/`.
2. **Before that, `npm run check`** compiles and runs every instrument for two seconds with the same Csound build the site uses. It sends MIDI instruments a test note. It fails on compile errors, `error:` messages and crashes. It doesn't require the instrument to make sound, because some instruments wait for a note or a button.
3. **The deploy** publishes `dist/` to GitHub Pages or GitLab Pages. The site is plain files: there is no server code.

`instruments.json` is generated, so never edit it. The development server (`npm run dev`) regenerates it whenever a CSD changes.

## Loading Csound

- **Which Csound:** the official `@csound/wasm-bin` WebAssembly build of Csound 7. The version is pinned in `player/engine/csoundRelease.json`. It is never stored in your repository.
- **From where:** unpkg.com, which serves it compressed (about 3.3 MB) and lets browsers cache it for a year.
- **When:** after the page has loaded, while the browser is idle, so it never slows down the first view. Hovering over an instrument starts the download if it hasn't started yet. For visitors with data saving switched on, the download waits for their first click or key press on the page.
- **How often:** once per visit, and it's usually cached from earlier visits. Switching instruments reuses the same Csound; it only compiles the new CSD.

## Playing an instrument

All players on a page share one Csound engine. Csound runs in an [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet), the browser's real-time audio thread.

- **The first click** anywhere on the page unlocks audio. Browsers forbid sound before the visitor interacts. That's also why a link to an instrument (`…/#/fm-bells`) selects it but waits for the visitor to press Play.
- **Picking an instrument** loads its CSD, compiles it and starts it in one click.
- **Switching instruments** stops the current one and compiles the next in the same engine.
- **If Csound crashes** (a fatal error inside the WebAssembly code), the next instrument gets a fresh Csound instance from the already downloaded code, so the page keeps working without a reload.

### What the browser changes about your CSD

The player decides how Csound talks to the sound card, so some things differ from desktop Csound:

- **`<CsOptions>`:** only these are kept: the message level (`-m…`), macros (`--omacro:`, `--smacro:`), `-+max_str_len`, `--sample-accurate`, `--keep-sorted-score` and `-+skip_seconds`. Everything else (output files, audio and MIDI devices, buffer sizes, `-n`, `-d`, …) is ignored, and the **Output** panel lists what was dropped. Line numbers in error messages still match the editor.
- **Sample rate:** Csound runs at the visitor's sound-card rate (usually 44.1 or 48 kHz), whatever `sr` says. Pitch stays right because `sr` itself is overridden, so the audio is never resampled. `ksmps` stays as written (only a CSD that sets `kr` instead gets `ksmps` recalculated).
- **Level:** output is divided by your `0dbfs`, so a CSD written for Csound's default of 32768 plays at the right level. A limiter then keeps the output within full scale, and invalid samples (NaN, infinity) become silence. A broken instrument can't blast speakers.
- **Not available:** reading files (samples, SoundFonts, `#include`), audio input, the `system` opcode and plugin opcodes. `#include`, `system` and plugin opcodes stop the CSD from compiling, with a message in the **Output** panel. Reading a sound file (e.g. `GEN01`) or audio input (`inch`) still compiles, but gives an empty table or silence.

### MIDI

Csound sends MIDI channel *N* to `instr N` unless the CSD says otherwise. If MIDI were always on, a plugged-in keyboard would start extra copies of, for example, a sequencer in `instr 1`. So MIDI is switched on only for instruments that use it:

- the CSD contains `massign` or `pgmassign`, or a MIDI opcode such as `notnum`, `cpsmidi`, `veloc`, `ampmidi`, `midictrl` or `ctrl7`; or
- it has a `midi_keyboard` widget; or
- `@INSTRUMENT` says `midi: "on"`. (`midi: "off"` switches it off, whatever the CSD contains.)

MIDI instruments without a keyboard widget get an on-screen keyboard automatically. Notes come from three places: the on-screen keyboard, the computer keyboard while the player has focus, and MIDI devices in Chrome, Edge and Firefox (after the visitor clicks **Connect MIDI**).

### Controls

- Each `@WIDGET` becomes a control bound to its channel. Controls send their default values before the first sound, so the instrument starts with the values the controls show.
- Meters and labels read the channels Csound writes with `chnset`: meters about 90 times a second, labels about 10 times a second so the numbers stay readable.
- When a visitor edits the code and presses Ctrl/⌘+Enter, the instrument recompiles, and controls whose channels still exist keep their current values.
- Edits to the code are not saved: reloading the page restores the original. **Download .csd** saves the edited version.

## Speed

| What | Size (compressed) | Loaded |
|---|---|---|
| The page and its styles | about 15 KB | immediately |
| The player | about 80 KB | immediately, without blocking the page |
| The code editor | about 190 KB | when the editor is shown |
| Csound (`csound.wasm`) | about 3.3 MB | at idle time after the page has loaded, cached for a year |
| Your profile photo | its file size | immediately (keep it small: 256 × 256 pixels is plenty) |

Once Csound is cached, picking an instrument plays it in about the time Csound needs to compile it, typically well under half a second.

## Planned, not built yet

- **Files next to the CSD:** samples, SoundFonts and `#include` files from the instrument's folder.
- **Effects:** instruments that process the microphone or a sound file (`@INSTRUMENT type: "effect"` already exists, so CSDs won't need changes).
- Audio previews of each instrument.
