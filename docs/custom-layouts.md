# Make your own layout

A layout is a complete look for the site: colours, type, how the header, the instrument list and the player are arranged, and whether knobs are drawn as graphics or as text. The template ships two layouts:

- **`panel`** (the default): a 1970s lab front panel, with graphic knobs and an LCD status line.
- **`manpage`**: the site as a Unix manual page, with text controls.

This guide first shows how those two differ, so you can see what a layout is able to change. Then it builds a third layout, `terminal`, step by step. After that come the reference tables (every setting, colour variable and class you can style) and a checklist for testing.

You need to know some CSS. You don't need to change any TypeScript beyond one entry in a table.

## How a layout works

A layout has three parts:

| Part | File | What it does |
|---|---|---|
| An entry in the layout table | `site/layouts.ts` → `LAYOUTS` | Names the layout and sets how the player is drawn (toolbar style, graphic or text controls, board position). |
| A stylesheet | `site/layouts/<name>.css` | All of the layout's CSS, scoped to `:root[data-layout='<name>']`. |
| One import line | `site/layouts/index.css` | Adds the stylesheet to the site. |

When the page opens, `site/main.ts` picks the layout and calls `applyLayout()`. The layout comes from, in this order:

1. `?layout=<name>` in the URL;
2. the last layout picked in the layout switcher, but only while the switcher is shown (in `npm run dev`, or with `?layouts` in the URL);
3. `portfolio.json → layout`;
4. `panel`.

`applyLayout()` then:

1. sets `<html data-layout="<name>">`, which switches on that layout's CSS;
2. sets the player's `chrome` and `controls` attributes from the table entry, and its `board` attribute from the table entry or, if the layout doesn't name one, from `portfolio.json → player.board`.

All layouts share the same HTML and scripts: `index.html` runs `site/main.ts`, and `play.html` runs `site/play.ts`; both apply the layout the same way. A layout changes the page **only through CSS**, plus the player settings in its table entry. Because every layout's CSS is scoped to its own `data-layout` value, layouts never affect each other, and all of them can be in the site at once.

The player's own CSS lives in a [cascade layer](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer) called `cp`. Your layout's rules are not in a layer, so they always win over the player's defaults, without extra-specific selectors or `!important`. The one exception is a style the player sets directly on an element (in its `style` attribute): only `!important` overrides that. The MIDI keyboard's `min-width` is the case you may meet (see step 6).

## Panel and man page, side by side

Both layouts use the same HTML. Everything below comes from their two CSS files and their table entries.

### Player settings (`site/layouts.ts`)

```ts
panel:   { label: 'panel',    chrome: 'minimal', controls: 'graphic', note: '…' },
manpage: { label: 'man page', chrome: 'minimal', controls: 'text', board: 'bottom', timelineTitle: 'History', note: '…' },
```

| Setting | panel | man page |
|---|---|---|
| `chrome` | `minimal`: text commands, a **More** menu, a status line | same |
| `controls` | `graphic`: knobs and faders as drawings | `text`: knobs and sliders as character cells (`[####------]`), the MIDI keyboard as a box-drawing picture |
| `board` | not set, so `portfolio.json → player.board` decides | `bottom`: controls below the code, which suits a single text column |
| `timelineTitle` | not set ("Timeline") | "History" |

### Colours (the tokens)

Both layouts start by setting the same set of CSS variables, the **tokens** (full list under [Colour tokens](#colour-tokens)). The player reads its colours, fonts and corner radii only from these variables. Setting them is therefore enough to recolour the whole site. The code editor has tokens of its own (`--cp-editor-*` for its background, `--cp-syn-*` for the code colours), and both built-in layouts set those too.

| | panel | man page |
|---|---|---|
| Background, text | warm grey enamel `#dcd8cd`, near-black `#1f1e1b` | paper `#fbfaf5`, ink `#171717` |
| Accent | safety orange `#a8380c` | manual-page red `#a3271b` |
| Font | Helvetica (`--cp-font`) | monospace everywhere (`--cp-font: var(--cp-mono)`) |
| Corners, shadows | 3 px corners, a slight bevel (`--cp-shadow`) | square corners, no shadow |
| Text cells | `--cp-cell-on: '▮'` | `--cp-cell-on: '#'`, `--cp-cell-off: '-'` |
| Status line | green LCD (`--cp-statusline-bg`) | reverse video, like `less`'s prompt |
| Extra tokens of its own | `--panel-led`, `--panel-lcd`, `--panel-cap`, … | `--man-indent: 7ch`, `--man-wide` |

Each file defines its tokens three times: light values, dark values for visitors whose system is dark, and the same dark values again for visitors who clicked the moon icon. See [Light and dark](#light-and-dark).

### Header

The header HTML is the same for both: `#site-author`, `#site-profile` (the photo, or initials when there is none), `#site-title`, `#site-bio`, and the theme icon on the right.

- **panel** arranges it as a grid: the photo on the left, then title, author and bio stacked on the right (`grid-template-areas` on `.site-id`). The theme icon is a small square push button.
- **man page** keeps the elements in their HTML order as one section. It writes the section heading with CSS (`.site-id::before { content: 'AUTHOR' }`) and indents the body by `--man-indent`. It turns the title and bio into one running line (`display: inline`, and a `::before` with an em dash). The photo is greyscale (`filter: grayscale(1)`), and the theme icon sits between brackets drawn with `::before` and `::after`, like the other commands.

### Instrument list

The list (`aside#rack`) has a heading that folds it, an options row (an `info` checkbox, the tag filter, List/Timeline buttons), the list itself, and a readout.

| | panel | man page |
|---|---|---|
| Position | A narrow column on the left (`.site-main` grid `minmax(170px, 210px) 1fr`) | A section in the single column (`.site-main { display: block }`) |
| Folded | A 30 px vertical strip with the title running upwards (`.rack--collapsed`, `writing-mode`) | The section body hides; the heading shows `[+]` |
| Each instrument | An LED dot (`.card__body::before`) and the name | The file name (`.card__file`), with the title visually hidden for screen readers |
| Description | In the readout under the list (`.rack__readout`), for the hovered, focused or current instrument | Under each name, when `[x] info` is ticked (`.rack--info .card__desc`) |
| Tag filter | A recessed box (`details.filter`) | `[+] filter` |

### Player

- **panel** turns the player into a module plate: a background with four screws drawn as `radial-gradient`s, bevelled buttons, an orange arc on the knobs (`.cp-knob__arc`), and a green LCD status line.
- **man page** makes the player wider than the 80-column text (`.stage .cp-host { width: max(100%, var(--man-wide)) }`). Toolbar commands become `[play]`-style words through `::before` / `::after`. The MIDI keyboard becomes a box-drawing picture, with the real key buttons made transparent and laid over it.

The point: the two layouts look completely different, but neither changes the HTML or the JavaScript.

## Build a layout: `terminal`

This example makes a small, complete layout: green-on-black phosphor in dark mode, ink on paper in light mode, monospace text, and text controls. Use it as a starting point and change it as far as you like.

### Step 1: add it to the layout table

In `site/layouts.ts`, find `export const LAYOUTS = {`. Below the `manpage: { … },` entry, before the closing `} as const`, add:

```ts
  terminal: {
    label: 'terminal',
    chrome: 'minimal',
    controls: 'text',
    note: 'Phosphor terminal: monospace, text controls.',
  },
```

The key (`terminal`) is the layout's name: you use it in `portfolio.json`, in `?layout=` and in the CSS selector. Use lowercase letters, digits and hyphens. All the fields are described under [Layout settings](#layout-settings).

### Step 2: write the stylesheet

Create `site/layouts/terminal.css`. Start with the tokens: light values, then dark values twice.

```css
/*
 * terminal: a phosphor terminal. Ink on paper in light mode, green on black in
 * dark mode; monospace everywhere, square corners, block characters for values.
 */
:root[data-layout='terminal'] {
  --cp-bg: #f4f1e8;
  --cp-surface: #ece8dc;
  --cp-surface-2: #e2ddcf;
  --cp-border: #c9c3b3;
  --cp-text: #1c1b18;
  --cp-muted: #5d5a52;
  --cp-accent: #1f6b3a;
  --cp-accent-soft: #d5e8da;
  --cp-on-accent: #ffffff;
  --cp-track: #c9c3b3;
  --cp-font: var(--cp-mono);
  --site-display: var(--cp-mono);
  --cp-radius: 0px;
  --cp-radius-sm: 0px;
  --cp-shadow: none;
  --cp-cell-on: '█';
  --cp-cell-off: '░';
  --cp-editor-bg: var(--cp-bg);
  --cp-editor-active-line: var(--cp-surface);
  --cp-editor-selection: var(--cp-accent-soft);
  /* Key colours for the MIDI keyboard (used in step 6). */
  --terminal-key-white: #ffffff;
  --terminal-key-black: #1c1b18;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root[data-layout='terminal']:not([data-theme='light']) {
    --cp-bg: #0c100c;
    --cp-surface: #111811;
    --cp-surface-2: #18221a;
    --cp-border: #2a3a2c;
    --cp-text: #b8f5c0;
    --cp-muted: #79b884;
    --cp-accent: #4be37a;
    --cp-accent-soft: #163a22;
    --cp-on-accent: #0c100c;
    --cp-track: #2a3a2c;
    --terminal-key-white: #2a3a2c;
    --terminal-key-black: #0c100c;
    color-scheme: dark;
  }
}
:root[data-layout='terminal'][data-theme='dark'] {
  --cp-bg: #0c100c;
  --cp-surface: #111811;
  --cp-surface-2: #18221a;
  --cp-border: #2a3a2c;
  --cp-text: #b8f5c0;
  --cp-muted: #79b884;
  --cp-accent: #4be37a;
  --cp-accent-soft: #163a22;
  --cp-on-accent: #0c100c;
  --cp-track: #2a3a2c;
  --terminal-key-white: #2a3a2c;
  --terminal-key-black: #0c100c;
  color-scheme: dark;
}
```

This alone is a working layout: the site, the player and the editor take on the new colours, font and corners. The editor tokens point at the page tokens (`var(--cp-bg)`), so the dark blocks don't need to repeat them. Tokens you don't set keep the player's defaults. This layout keeps the default code colours (`--cp-syn-*`) and status colours (`--cp-ok`, `--cp-warn`, `--cp-danger`), for example. The editor's text is always in `--cp-mono`.

### Step 3: import it

Add one line to `site/layouts/index.css`, below the other two `@import` lines (leave the rest of the file as it is):

```css
@import './terminal.css';
```

### Step 4: look at it

```sh
npm run dev
```

Open `http://localhost:5173/?layout=terminal`. In the development server, a layout switcher sits in the bottom-right corner: click **terminal**, or press Alt+3 (Alt+1 and Alt+2 are the built-in layouts, and Alt+0 hides the switcher). The page reloads by itself when you save the CSS.

Switch between light and dark with the sun/moon icon in the top-right corner. Also check the dark values with your system set to dark and the icon never clicked: that's the `@media` block.

### Step 5: style the page

Add rules below the tokens. Put every rule inside `:root[data-layout='terminal'] { … }`, so that it only applies to this layout. Nesting (`& .class`) is fine: the build turns it into plain selectors for older browsers.

```css
:root[data-layout='terminal'] {
  /* Header: a plain line, a shell prompt before the title. */
  & .site-header {
    background: var(--cp-bg);
    border-bottom: 1px dashed var(--cp-border);
  }
  & .site-title::before {
    content: '$ ';
    content: '$ ' / '';
    color: var(--cp-accent);
  }

  /* List: plain rows; the current one in reverse video. */
  & .card {
    padding: 4px 8px;
    background: transparent;
    border: 0;
  }
  & .card[aria-current='true'] {
    color: var(--cp-on-accent);
    background: var(--cp-accent);
    box-shadow: none;
  }
  & .card[aria-current='true'] .card__desc {
    color: inherit;
  }
  & .card__preview {
    display: none;
  }

  /* Player: a single-line frame. */
  & .cp-player {
    border: 1px solid var(--cp-border);
  }
}
```

A few things to know when styling the page:

- **The HTML is shared.** Look in `index.html` for the elements and classes, and in [Page classes](#page-classes) for the classes `site/main.ts` adds as the page changes (for example `.rack--collapsed` while the list is folded).
- **Some parts are hidden until a layout shows them:** `.card__file`, `.card__tags`, `.card__date`, `.rack__readout` and the `info` checkbox (`.rack__info`). The panel shows the readout, and the man page shows the file names and the `info` checkbox. Show the ones you want with a `display` rule.
- **`hidden` needs help when you set `display`.** Several elements are switched on and off with the `hidden` attribute: `.rack__body` when the list is folded, `.filter` when there are fewer than two tags, `.site-profile` without a name or photo. If your layout gives one of them a `display` value, add a rule that keeps `[hidden]` working:
  ```css
  & .rack__body { display: grid; }
  & .rack__body[hidden] { display: none; }
  ```
- **Decorative text from CSS** (`content: '$ '`) is read out by screen readers unless you give it empty alternative text. Write the `content` line twice, the second time with `/ ''`, as above. Browsers that don't understand the second form use the first.
- **Hide text visually, not completely,** when it still names something. The man page hides the instrument titles visually (the `.card__title` rule with `clip`) and shows the file names instead, so screen readers still hear the title. `display: none` would remove the name for everyone.
- **Phones:** below 860 px the base styles stack the list above the player. Check your layout at about 400 px wide: nothing should scroll sideways.

### Step 6: style the player

The player is the `<csound-player>` element. Its classes all start with `cp-` (list under [Player classes](#player-classes)). Change it with the same kind of rules:

```css
:root[data-layout='terminal'] {
  /* Text cells for values: lit cells in the text colour, unlit ones in the border colour. */
  & .cp-cell[data-on='true']::before {
    color: var(--cp-text);
  }
  & .cp-cell::before {
    color: var(--cp-border);
  }
  /* The keyboard sets its own key colours, so pass ours in on the keyboard itself. */
  & .cp-midi-keyboard {
    --cp-key-white: var(--terminal-key-white);
    --cp-key-black: var(--terminal-key-black);
  }
}
```

Two things are different from the page:

- **The keyboard colours** `--cp-key-white` and `--cp-key-black` must be set on `.cp-midi-keyboard`, not on `:root`. The keyboard defines its own defaults, which would otherwise win. Because this rule applies in both themes, give it tokens that change with the theme (`--terminal-key-white` / `--terminal-key-black` from step 2), not page colours like `--cp-text`: in dark mode that would make the black keys lighter than the white ones. The built-in layouts do the same with `--lk-white` / `--lk-black`.
- **Text controls (`controls: 'text'`)** take their characters from `--cp-cell-on` and `--cp-cell-off`. The box-drawing keyboard picture (`.cp-midi-art`) is hidden by default. The man page shows it and lays the transparent key buttons over it. To use that keyboard, copy the block in `site/layouts/manpage.css` that starts with the comment `MIDI keyboard: drawn with box-drawing characters`, up to (not including) the `@media (max-width: 640px)` rule at the end of the file. Change `manpage` to your layout's name, and define `--lk-white`, `--lk-black` and `--lk-pressed` in your tokens. The block contains `min-width: 0 !important`: that is the one place where `!important` is needed, because the keyboard sets its width in its `style` attribute.

### Step 7: use it

Set it in `portfolio.json`:

```json
"layout": "terminal"
```

In `npm run dev`, the layout last picked in the switcher still wins over `portfolio.json` (see [How a layout works](#how-a-layout-works)). Pick **terminal** in the switcher, or open the built site (`npm run build`, then `npm run preview`) to see what visitors get.

Then build and check the site as described in [Check your layout](#check-your-layout).

## Reference

### Layout settings

The fields of a `LAYOUTS` entry in `site/layouts.ts`:

| Field | Values | Meaning |
|---|---|---|
| `label` | text | The button text in the layout switcher. |
| `chrome` | `'minimal'`, `'full'` | `minimal`: text commands, a **More** menu (volume, board position, Connect MIDI, Download, Reset) and a status line. `full`: a toolbar of icon buttons with every action visible. |
| `controls` | `'graphic'`, `'text'` | `graphic`: drawn knobs, faders and meters. `text`: character cells (`--cp-cell-on` / `--cp-cell-off`), plus a box-drawing MIDI keyboard picture that your CSS can show. |
| `board` | `'right'`, `'bottom'` (optional) | Where the controls sit next to the code. Leave it out to use `portfolio.json → player.board`. Visitors can still move the board; their choice is remembered for as long as the layout's default stays the same. |
| `timelineTitle` | text (optional) | Heading of the list in timeline view. Default: "Timeline". |
| `note` | text | Tooltip in the layout switcher. |

The switcher lists layouts in table order, and Alt+1, Alt+2, … follow that order. To change the default layout of the template, set `portfolio.json → layout`. Change `DEFAULT_LAYOUT` only if you remove `panel`.

### Colour tokens

Set these on `:root[data-layout='<name>']`. Light values go in the plain block. Dark values go in the two dark blocks.

**Player and page** (defaults in `player/styles/player.css`):

| Token | Used for |
|---|---|
| `--cp-bg` | Page background, toolbar buttons |
| `--cp-surface` | Cards, panels, the board |
| `--cp-surface-2` | Hover, wells, the readout |
| `--cp-border` | Lines and frames |
| `--cp-text` | Text |
| `--cp-muted` | Secondary text (labels, values, dates) |
| `--cp-accent` | Links, focus rings, live values, the playing state |
| `--cp-accent-soft` | Pale accent backgrounds (an active tag) |
| `--cp-on-accent` | Text on an accent background |
| `--cp-track` | Slider and knob tracks |
| `--cp-ok`, `--cp-warn`, `--cp-danger` | Status colours (ready, changed, error) |
| `--cp-shadow` | Box shadow of raised parts (`none` for flat) |
| `--cp-font`, `--cp-mono` | Text font and monospace font |
| `--cp-radius`, `--cp-radius-sm` | Corner radii |
| `--cp-text-xs`, `--cp-text-sm`, `--cp-text-md`, `--cp-text-lg` | Font sizes inside the player |

**Code editor** (defaults in `player/styles/editor.css`): `--cp-editor-bg`, `--cp-editor-active-line`, `--cp-editor-selection`, `--cp-editor-font-size`, and the syntax colours `--cp-syn-keyword`, `--cp-syn-opcode`, `--cp-syn-variable`, `--cp-syn-string`, `--cp-syn-number`, `--cp-syn-comment`, `--cp-syn-operator`, `--cp-syn-tag`, `--cp-syn-meta` and `--cp-syn-meta-bg` (the `@WIDGET` / `@INSTRUMENT` comments).

**Minimal chrome and text controls** (defaults in `player/styles/minimal.css`): `--cp-statusline-bg`, `--cp-statusline-text`, `--cp-cell-on`, `--cp-cell-off`. The cell values are CSS strings, with the quotes: `'█'`.

**Page sizes** (defaults in `site/style.css`):

| Token | Default | Used for |
|---|---|---|
| `--site-max` | `1440px` | Maximum width of the header and main area |
| `--site-gutter`, `--site-gutter-right` | 16 px, or the phone's safe area | Side margins |
| `--site-display` | `--cp-font` | Font of the site title and instrument title |
| `--cp-player-height` | `min(80vh, 780px)` | Height of the player |

**Keyboard** (set on `.cp-midi-keyboard`): `--cp-key-white`, `--cp-key-black`, and for the text keyboard `--cp-black-key` (black key width as a fraction of a white key; the man page uses `0.75`).

You can add tokens of your own, as the panel does with `--panel-led`. Prefix them with your layout's name so they never collide with another layout's.

### Light and dark

The page has three theme states:

- The visitor hasn't clicked the theme icon: there's no `data-theme` attribute, and the system setting decides.
- The visitor chose light: `<html data-theme="light">`.
- The visitor chose dark: `<html data-theme="dark">`.

So every layout writes its tokens three times:

```css
:root[data-layout='x'] { /* light */ color-scheme: light; }
@media (prefers-color-scheme: dark) {
  :root[data-layout='x']:not([data-theme='light']) { /* dark */ color-scheme: dark; }
}
:root[data-layout='x'][data-theme='dark'] { /* the same dark values */ color-scheme: dark; }
```

- Put every token you set in the light block first. The dark blocks only change values. (Tokens you never set keep the player's defaults, which have their own dark values.)
- Use only tokens in your rules (`color: var(--cp-muted)`), never fixed colours, so both themes stay right.
- `color-scheme` makes scrollbars and form fields match.

A layout that is meant to look the same in both themes (an always-dark terminal, say) can leave out the two dark blocks. Then set `color-scheme: dark` in the one block if its colours are dark.

### Page classes

The elements in `index.html`. Their IDs are used by `site/main.ts`, so don't rename or remove them. Adding elements and classes is fine.

| Element | Contains |
|---|---|
| `.site-header` › `.site-header__inner` | The header |
| `.site-id` | `#site-author`, `#site-profile` (`.site-profile__photo` or `.site-profile__initials`), `#site-title`, `#site-bio` |
| `.site-header__side` | `#site-links` (`.site-link`, empty unless `portfolio.json → links` is set) and the theme icon `#theme-toggle.site-theme` |
| `.site-main` | A grid: the list and the stage |
| `#rack.rack` | The instrument list: `.rack__bar` (heading `#rack-toggle.rack__toggle` with `.rack__toggle-icon`, `#rack-title-text`, `.rack__count`) and `#rack-body.rack__body` |
| `.rack__options` | `.rack__info` (the `info` checkbox), `details.filter` (`.filter__summary`, `.filter__active`, `.chips` › `.chip`), `.rack__views` › `.rack__view` |
| `#instrument-list.rack__list` | One `li` per instrument, each holding a `button.card`: `.card__preview` (image), `.card__body` › `.card__title`, `.card__file`, `.card__date`, `.card__desc`, `.card__tags` |
| `.rack__readout` | The description of the hovered, focused or current instrument |
| `.stage` | `#instrument-info.stage__info` (`.stage__title`, `.stage__desc`, `.stage__meta` › `.tag`, `.stage__facts`) and the player (`csound-player.cp-host`) |

States `site/main.ts` sets:

| Class or attribute | When |
|---|---|
| `.rack--collapsed` on `#rack`, `.site-main--rack-collapsed` on `.site-main`, `[hidden]` on `.rack__body` | The list is folded |
| `.rack--info` on `#rack` | The `info` checkbox is ticked |
| `.rack--timeline` on `#rack` | Timeline view. The list then holds `li.rack__group` › `h3.rack__year` + `ol.rack__sublist` |
| `.card[aria-current='true']` | The instrument in the player |
| `.chip[aria-pressed='true']`, `.rack__view[aria-pressed='true']` | The active tag, the active view |
| `.filter[open]` | The tag filter is open |

`play.html` uses the same header and the `.site-main--single` class (one column).

### Player classes

The main parts. Look in the browser's inspector for the rest; every class starts with `cp-`.

| Class | Part |
|---|---|
| `.cp-player` | The whole player. Also `.cp-player--minimal`, `.cp-player--controls-text`, `.cp-player--board-right` / `--board-bottom` / `--board-hidden` |
| `.cp-toolbar`, `.cp-btn`, `.cp-btn--transport` (`.is-playing`) | Toolbar and its buttons |
| `.cp-more__button`, `.cp-more__panel`, `.cp-more__item` | The **More** menu (minimal chrome) |
| `.cp-player__main`, `.cp-player__editor`, `.cp-player__board`, `.cp-splitter` | Editor, board and the divider between them |
| `.cp-board__section`, `.cp-board__title` | A group of controls (`group:` in `@WIDGET`) |
| `.cp-widget`, `.cp-widget__label`, `.cp-widget__value` | One control, its label and its value |
| `.cp-knob__body`, `.cp-knob__arc`, `.cp-knob__pointer` | Parts of a graphic knob (SVG: style with `fill` and `stroke`) |
| `.cp-tfader__cells`, `.cp-cell` (`[data-on='true']`), `.cp-tmeter` | Text controls |
| `.cp-midi-keyboard`, `.cp-midi-key--white`, `.cp-midi-key--black`, `.cp-midi-art` | MIDI keyboard |
| `.cp-statusline` (`__file`, `__info`, `__keys`), `.cp-status` | Status line (minimal chrome) |
| `.cp-console` | The **Output** panel with Csound's messages |

## Check your layout

Go through this list before you publish:

1. **Both themes.** Click the theme icon, and also set your system to dark without clicking it.
2. **A phone.** Use your browser's device mode at about 400 px wide. Nothing should scroll sideways, and the list, the controls and the keyboard should fit.
3. **The keyboard alone.** Press Tab through the page. Every control should show a visible focus ring, and the list, the filter and the player should all work without a mouse.
4. **Each state:** the list folded, the filter open, timeline view (needs `date` in `@INSTRUMENT`), an instrument playing, the **Output** panel open, a value being typed (double-click a value).
5. **Contrast:** text should stay readable on every background, including `--cp-muted` text and text on the accent colour.
6. **The build:**
   ```sh
   npm run check   # what the deploy runs
   npm run build
   npm run preview # the built site at http://localhost:4173
   ```

`npm run check` includes unit tests for the layout table (`tests/site/layouts.test.ts`); they allow added layouts, so they keep passing. The repository's browser tests (`npm run test:e2e`) can check a new layout too. Add its name to the `LAYOUTS` list at the top of `tests/e2e/layouts.spec.ts` (the tests read its settings from `site/layouts.ts`). The tests then play an instrument in your layout, check that it fits a phone, and run an accessibility scan (axe) in light and dark. These tests use the example instruments, and expect the theme icon in the top-right corner, where the base styles (`site/style.css`) put it. Adjust them if your site differs.

## Remove a built-in layout

To drop `panel` or `manpage`:

1. Delete its entry in `LAYOUTS` (`site/layouts.ts`), its CSS file, and its line in `site/layouts/index.css`.
2. If you removed `panel`, set `DEFAULT_LAYOUT` in `site/layouts.ts` to one of your layouts.
3. Remove or adjust the tests that name it: `tests/site/layouts.test.ts`, and `tests/e2e/layouts.spec.ts` if you run the browser tests. `npm run check` runs the first file, and the deploy stops when a test fails.

## Going further

- **Change the HTML.** `index.html` and `site/main.ts` are yours to change, but all layouts share them. Elements you add will need styles in every layout you keep.
- **Turn off the switcher.** It only appears in `npm run dev`, or with `?layouts` or `?layout=` in the URL, so visitors don't see it. To remove it completely, delete the `if (switcher) { mountSwitcher(…) }` block in `site/main.ts`.
- **Embed the player elsewhere.** The player works without any layout. See [`player.md`](player.md).
