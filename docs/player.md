# The player element

The site shows instruments with one custom element, `<csound-player>`. It contains everything: the toolbar, the code editor, the controls, the MIDI keyboard and the Csound engine. The portfolio page (`index.html` with `site/main.ts`) and `play.html` are two ways of using it, and you can build your own pages with it too.

## Use it on a page

The player lives in `player/` and is built by Vite with the rest of the site. To add a page of your own, for example a page that shows one instrument:

1. Create `sub-synth.html` in the project root (this example uses one of the template's example instruments; use the path of your own):
   ```html
   <!doctype html>
   <html lang="en">
     <head>
       <meta charset="utf-8" />
       <meta name="viewport" content="width=device-width, initial-scale=1" />
       <title>Sub Synth</title>
     </head>
     <body>
       <csound-player src="instruments/sub_synth/sub_synth.csd" board="bottom" editor="collapsed"></csound-player>
       <script type="module">
         import { defineCsoundPlayer, warmUpEngine } from './player';
         warmUpEngine();
         defineCsoundPlayer();
       </script>
     </body>
   </html>
   ```
2. Add the page to `vite.config.ts` → `build.rollupOptions.input`:
   ```ts
   input: {
     index: resolve(__dirname, 'index.html'),
     play: resolve(__dirname, 'play.html'),
     'sub-synth': resolve(__dirname, 'sub-synth.html'),
   },
   ```

`warmUpEngine()` starts downloading Csound while the visitor is still reading, and lets the first click anywhere on the page unlock audio. Without it, both happen when the visitor presses Play.

The page uses the player's own default colours. To use a layout's look, apply the layout as `site/play.ts` does, or import `site/style.css` and set your own `--cp-*` colours (see [custom-layouts.md](custom-layouts.md#colour-tokens)).

## Attributes

| Attribute | Values | Meaning |
|---|---|---|
| `src` | URL of a `.csd` | The instrument. Change it to load another one. |
| `board` | `right` (default), `bottom`, `hidden` | Where the controls sit. Visitors can move them; their choice is remembered in the browser. |
| `editor` | `open` (default), `collapsed`, `hidden` | The code editor. With `hidden`, its code is never downloaded. |
| `chrome` | `full` (default), `minimal` | `full`: a toolbar with every action. `minimal`: text commands, a **More** menu and a status line. |
| `controls` | `graphic` (default), `text` | `text` draws knobs, sliders and meters as character cells (`■■■■····`). It also adds a box-drawing picture of the MIDI keyboard, which a layout's CSS can show. |
| `title-text` | text | Overrides the title (otherwise `@INSTRUMENT name`, then the file name). |

All attributes can change while the page is open.

## Methods

| Method | Returns | What it does |
|---|---|---|
| `load(source)` | `Promise<boolean>` | Loads a CSD. `source` is a URL, or `{ code, title?, url? }` with the CSD text itself. Resolves `false` if the file could not be loaded or isn't a CSD. |
| `play()` | `Promise<result \| null>` | Compiles and starts the loaded CSD. `result.ok` is `false` with an `error` when Csound could not compile it. |
| `stop()` | `Promise<void>` | Stops the sound. |
| `run()` | `Promise<result \| null>` | Recompiles the editor's text and plays it, keeping the controls' current values (the same as Ctrl/⌘+Enter). |
| `focus()` | | Focuses the Play/Stop button, so the computer keyboard plays notes right away. |
| `state` (property) | text | `empty`, `loading`, `ready`, `idle`, `starting`, `compiling`, `playing`, `stopped`, `ended` or `error`. (`ready` and `idle` both mean loaded and not playing.) |

Browsers allow sound only after the visitor clicks or presses a key. Call `load()` and `play()` from a click handler, as `site/main.ts` does when a visitor picks an instrument. Otherwise the instrument waits until the visitor presses Play.

## Events

The player sends these events. They bubble, so you can listen on the element or on `document`:

| Event | `event.detail` | When |
|---|---|---|
| `cp-ready` | `{ title, url }` | A CSD has loaded and is ready to play. |
| `cp-state` | `{ state, error }` | The state changed (see `state` above). |
| `cp-error` | `{ message }` | Loading or compiling failed, or Csound stopped with an error. |
| `cp-ended` | `{}` | The score finished. |

```js
const player = document.querySelector('csound-player');
player.addEventListener('cp-state', (e) => console.log('now', e.detail.state));
```

## Several players on one page

All players on a page share one Csound engine, which is loaded once. Only one instrument plays at a time: starting or loading an instrument in one player stops the others.

## Without the custom element

`createPlayer(container, options)` (exported from `player/index.ts`) mounts the same player into any element. It takes the attributes above as options (`src`, `board`, `editor`, `chrome`, `controls`; the title is `title`, not `title-text`), and resolves with an object that has the same `load`, `play`, `stop`, `run` and `state`.
