# Third-party software

## Csound (LGPL-2.1)

This project does **not** include Csound. The player downloads the official Csound
WebAssembly build (`@csound/wasm-bin`, `lib/csound.wasm`) at runtime from
https://unpkg.com/@csound/wasm-bin/ (the exact version is pinned in
`player/engine/csoundRelease.json`).

Csound is free software licensed under the GNU Lesser General Public License,
version 2.1 or later: https://github.com/csound/csound/blob/master/COPYING.
Source code: https://github.com/csound/csound.

## Csound reference manual data

`player/editor/opcodes.json` (opcode names, one-line descriptions and syntax
lines used for autocomplete and hover help) is derived from the Csound
Reference Manual (https://csound.com/docs/manual/). The manual is distributed by
the Csound project under its own license; see the manual's copyright page.

## npm packages

React, CodeMirror and the other packages listed in `package.json` are
installed from npm under their own licenses (MIT unless stated otherwise in
each package).
