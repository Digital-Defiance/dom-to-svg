# dom-to-svg

Browser extension that inspects a DOM element and maps it to a **true-vector SVG** (rects, paths, text, gradients — not `<foreignObject>` HTML wrappers).

## Load

```bash
npm install
npm run build
```

1. Chrome / Edge → `chrome://extensions` (or `edge://extensions`) → enable Developer mode
2. **Load unpacked** → select this folder
3. Open any normal web page (not `chrome://` / `edge://`)
4. Start inspect mode either way:
   - Click the **dom-to-svg** toolbar icon (pin it from the puzzle menu if needed)
   - Or right-click the page → **Convert to SVG…**
5. Hover to highlight · click / Enter to convert · ↑ parent · ↓ child · **Esc** cancels
   - Optional: enable **rasterize fonts** on the hint bar (persists) to bake fallback glyphs (e.g. ♔) into images for Illustrator
6. SVG is downloaded and copied to the clipboard

After editing `src/`, run `npm run build` (or `npm run build:watch`) and **Reload** the extension.

API option: `elementToSvg(el, { rasterizeFonts: true })`.

## Store package

```bash
yarn pack:store
# or: npm run pack:store
```

Creates `dom-to-svg-<version>.zip` for Chrome Web Store / Edge Add-ons. Contents are allowlisted:

- `manifest.json`
- `icons/icon{16,48,128}.png`
- `src/background.js`
- `dist/inject.js` (required at runtime — the worker injects this bundle)

Does **not** include `assets/`, tests, or converter source. Bare `yarn pack` / `npm pack` build an unrelated npm `.tgz`; use `pack:store`.

## Tests

```bash
npm install
npx playwright install chromium
npm test
```

- `tests/unit` — pure parsing/geometry (no browser)
- `tests/browser` — Playwright fixtures for complex DOM cases

## Approach

Uses the browser’s layout engine (`getBoundingClientRect`, `getComputedStyle`) and emits SVG primitives:

| HTML / CSS | SVG |
|---|---|
| box + background | `<rect>` / `<path>` |
| per-corner `border-radius` | arc `<path>` |
| borders | stroke or evenodd ring |
| wrapped text | `<text>` via Range line boxes |
| `-webkit-text-stroke` / `paint-order` | SVG `stroke` + `stroke-width` + `paint-order` on `<text>` |
| `linear-gradient` / `radial-gradient` | paint servers (multi-layer) |
| `clip-path` | `<clipPath>` |
| `transform` | SVG `matrix(...)` around transform-origin |
| `opacity` | nested `<g opacity>` |
| z-index / stacking | tree paint order |
| inline `<svg>` | cloned as-is |
| `<img>` / `<canvas>` / `<video>` | raster `<image>` |
| `box-shadow` | SVG filter chain |
| `::before` / `::after` / `::marker` | best-effort |
| `@font-face` | embedded data URIs when CORS allows |
| scrollable overflow | expands auto/scroll; keeps hidden clipped |

## API

```js
import { elementToSvg } from "./src/converter/index.js";

const svg = await elementToSvg(document.querySelector("#card"));
```
