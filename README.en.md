<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="PixelForge — natural language to pixel game FX: 29 templates, frame-exact 60 FPS preview, APNG / sprite sheet / PNG sequence export, zero dependencies">
</p>

<p align="center">
  <a href="https://github.com/LINYEANSHU/pixelforge/actions/workflows/ci.yml"><img src="https://github.com/LINYEANSHU/pixelforge/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-7a8cff.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/runtime%20deps-zero-3fbf7f.svg" alt="Zero runtime dependencies">
</p>

<p align="center"><a href="./README.md">简体中文</a> ｜ English</p>

---

**PixelForge** is a fully offline 2D pixel game FX generator: describe an effect in one sentence (or pick from 29 templates), preview it frame by frame at 60 FPS in the browser, then export APNG, sprite sheets, PNG sequences and recipe JSON. It is a playable FX lab — not a video editor, and not a page of canned GIFs.

At runtime it calls no online API, requests no network resource, and ships zero runtime dependencies in the browser.

## Play the moment it opens

A complete four-phase "arcane burst" starts playing on launch: **implosion → white-hot flash → expanding particle shock ring → shards / embers / smoke aftermath**. A template library on the left (29 generators in 8 categories), a large nearest-neighbor-scaled pixel preview in the middle, parameters and export on the right, timeline at the bottom.

**Three ways to shape an effect**

1. **Template + parameters**: size / intensity / duration / angle / palette, each parameter lockable with a 🔒.
2. **One-click variation**: perturbs parameters and the seed sensibly while keeping locked items; subtle / standard / wild, with undo and favorites.
3. **Text recipe**: `blue-violet ring explosion, 2s, fine sparks` or `蓝紫色环形爆炸，持续2秒` — a bilingual offline dictionary with rule mapping; results show as field chips, and anything not understood is reported back honestly. **No claim of general natural-language understanding, no online models, no executing of text content.**

Also on board: a **combiner** (up to 4 layers, each with its own time window / offset / scale), a **test stage** (windup → hit → recovery attack demo, with screen-shake and flash toggles), and a **bilingual UI** (follows your browser language by default; switch anytime from the 🌐 button).

## Quick start

```bash
node server.js 8347    # then open http://127.0.0.1:8347
```

Alternatives: open `index.html` directly in a browser (works over file:// too — exports fall back to the main thread); the single-file build `dist/pixelforge-standalone.html`; or `启动PixelForge.bat` on Windows. Node.js is only needed to serve the folder and run the tooling (18+ recommended) — nothing to install, nothing to build.

## 29 templates, 8 categories

Explosion / Impact · Fire · Lightning · Magic · Smoke / Weather · Water / Ice · Hit · UI feedback.

Every template is a **structured phase design** (windup / burst / spread / aftermath, or continuous emission / morphing / dissipation) composed from shock rings, beams, arcs, shards, trails and noise drift. Recoloring a palette does not make a new template.

## Export (all really implemented)

| Format | Contents |
|---|---|
| Frame PNG | The current frame, straight RGBA alpha — no checkerboard or black-background bleed |
| PNG sequence | Per-frame PNGs + `timeline.json` in a ZIP, 60 FPS by default |
| Sprite Sheet | Multi-page PNGs + Aseprite-compatible JSON (frame rects / order / anchors / fps / durations / loop / paging) |
| APNG | Single-file animated PNG with alpha |
| Recipe JSON | `.pfx.json`, reloadable (invalid configs are rejected) |

Key rules: exact **t = k/60** sampling (`timebase: "1/60"`); **looping exports never repeat the first frame**; pages cap at 4096 by default and overflow pages automatically, recording padding and anchors; encoding runs in a **Web Worker**, releasing each frame's buffer as soon as it is compressed (main-thread fallback over file://), with a live **progress bar and cancel**. GIF and video are future work.

## Architecture in one look

- **Deterministic pure-function evaluation**: every particle's state is f(seed, layer, slot) with no simulation history. **Same version + same seed + same frame = bit-identical output**; scrubbing, stepping and exporting all share one evaluation path.
- **Fixed 1/60 time base**: motion and decay are continuous functions of time (analytic integration), sampled at t = k/60 — 60 FPS is the sampling target, not a low-framerate step; looping effects satisfy frame N ≡ frame 0 bit-for-bit.
- **CPU rasterization**: a color buffer plus an additive-light buffer composited in two passes; preallocated TypedArrays (256px ≈ 196KB), zero per-frame object allocation, nearest-neighbor upscaling to keep the pixels crisp.
- **Web Worker export**: buffers are freed per frame, only compressed bytes are retained; the file:// fallback is equally chunked and async.
- **Seeded RNG**: all randomness derives from the seed — a recipe JSON plus its seed reproduces the effect exactly.

## Performance and budgets (measured, see `docs/性能报告.md`)

- Heaviest template at 256px: **2.87ms/frame** (17% of a 60 FPS budget); export throughput **503 frames/s**.
- Default budget of 1000 active particles (64..4000), scaled down proportionally per layer when exceeded.
- Steady-state preview memory under 50MB; export peaks at roughly one 64MB page buffer plus compressed bytes.

## GPU acceleration (experimental)

`src/core/raster-gpu.js` is an experimental WebGL2 backend built against the architecture's Renderer interface (dual batches, dual FBOs, instanced drawing). **The default path is still CPU, and the GPU backend is not wired into the main UI.** `bench/gpu-bench.html` provides a side-by-side benchmark; the measured speedups and pixel deltas live in `docs/GPU加速测试报告.md` and come from one specific machine — **verify on your own hardware**. The app never requires a GPU; CPU mode is fully offline.

## Tests

```bash
node tests/run-tests.cjs     # 18/18 passing
```

Coverage: bit-exact same-seed reproduction, seek consistency, exported PNG pixels == direct render, 60 FPS frame counts and time base, alpha channel, sprite-sheet paging, recipe JSON round-trip, combiner round-trip, invalid-config rejection, cancel cleanup, 3600-step loops without growth, loop-seam bit equality, offline static scan, bilingual recipe parsing, particle budget clamping.

## Repository layout

```
index.html / styles.css        Main UI (system fonts, no external assets)
server.js / 启动PixelForge.bat Local server and one-click launcher
build.cjs                      Packs dist/pixelforge-standalone.html
src/core/                      Engine (pf/rng/palette/raster/raster-gpu/layers/effect/templates/parser/variant/stage)
src/core/export/               PNG encoder / ZIP / APNG / export jobs (shared by Worker and Node)
src/ui/                        app.js controller and the i18n.js bilingual dictionary
src/export.worker.js           Export worker
tests/run-tests.cjs            18 automated tests
tools/                         Benchmark and sample generation scripts
samples/                       Contact sheets / frames / full export samples / reader example
docs/                          Performance / stress / export format / generator API / licenses (in Chinese)
```

## Credits

- The gameplay and effect ideas were shaped while studying [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) (MIT): only its **design concepts** were referenced (color + additive-light double buffering, fully seeded determinism, Aseprite-style sheet metadata organization). No code or fonts were copied. See `NOTICE` and `docs/LICENSES.md`.
- Tech stack: vanilla JavaScript + Web Workers, zero runtime dependencies; fonts come from the operating system's system font stack.

## License

[MIT](./LICENSE) © 2026 LINYEANSHU
