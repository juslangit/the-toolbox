# The Toolbox

**Live: https://thetoolbox.pages.dev**

Small developer tools that run entirely in the browser — nothing you type leaves the device,
and it works offline once opened. Inspired by [IT Tools](https://it-tools.tech); written from
scratch (no IT Tools code is used).

**110 tools in eleven drawers**, plus workflows. The new drawers (added 2026-10-07) take their
ideas from [delphi.tools](https://delphi.tools); every line is written fresh.

| Drawer | Tools |
|---|---|
| Crypto & IDs | Token & password, Hash text, Bcrypt, UUID & ULID, JWT decoder, Password strength, File checksum |
| Converters | Base64, Data formats (JSON ⇄ YAML ⇄ TOML ⇄ CSV), Date & timestamp, Colour converter, Number bases, HTML entities, Markdown preview |
| Web & dev | URL encode & parse, Regex tester, Crontab, chmod, Text diff, JSON formatter, IPv4 subnet, docker run → compose, User-agent parser, SQL formatter, HTTP status codes, Meta tag generator, Request builder (and cURL parser), Tailwind cheat sheet |
| Images | Image Atlas, Compress, Convert (PNG/JPEG/WebP/AVIF/GIF/BMP/ICO/ICNS), Resize, Social media cropper, Strip metadata, Favicon generator, Clipper, Splitter, Stitcher, SVG optimiser, Image → Base64, Paste image, Matte, Seamless scroll, Watermarker, De-skewer, Masker, Tracer (→ SVG), Grain & noise, Background remover (AI) |
| Colour | Colour Atlas, Contrast checker (WCAG + APCA), Harmonies, Palette generator, Palette collection, Palette from image, Pixel picker, Tailwind shades, Colour-blindness simulator, Gradient generator |
| PDF & print | Organiser (merge, split, reorder), Images ⇄ PDF, Rotate & crop, Page numbers, Compressor, Preflight, Print imposer, Zine imposer |
| Audio & video | Audio Atlas, Audio trimmer, Normaliser (LUFS), Voice recorder, Waveform image, Subtitle converter, Timecode calculator, Auto subtitle (AI), Video Atlas, Audio extractor, Video muter, Video trimmer, Video → GIF, Frame extractor, Screen recorder, Subtitle studio |
| Text & type | Large Type, Glyph browser, Text scratchpad, Document converter (MD/HTML/DOCX), Font file explorer, Paper sizes, Line height, PX ⇄ REM, Typography units |
| Calculators | Scientific, Algebra, Graph, Unit converter (incl. Malay units), Time zones & date maths, Stupid units, Percentage & ratio (SST) |
| Codes & ciphers | Morse, NATO phonetic, Braille, Cipher decoder (with auto-crack), Barcode generator |
| Everyday | QR code, QR scanner, Lorem ipsum, Text statistics, Case & slug, Image placeholder |

**Tools talk to each other.** Results have a **Send to…** button that opens them in another tool
(a QR code → the scanner, a picked colour → the contrast checker, a compressed photo → the Image
Atlas). Drop or paste a file anywhere and a sheet lists the tools that can open it.
**Workflows** chain tools over a batch of files (e.g. *Photo for the web*: strip metadata → resize →
WebP); ten are ready-made and you can build and save your own on the device.

**Big downloads only when asked.** The video engine for unusual formats (ffmpeg.wasm, ~31 MB) and
the AI models (background removal ~88 MB, Whisper subtitles 85–160 MB) are fetched from jsDelivr /
Hugging Face only after you tap to agree, then kept by the service worker for offline use. Your
files still never leave the device.

What you type is kept for the browser session, so leaving a tool and coming back does not
lose it (**Reset** clears it). Tools that handle secrets — token, hash, bcrypt, JWT, password
strength — never keep anything.

## Run it

No build step — plain HTML, CSS and ES modules.

```bash
node serve.mjs          # http://127.0.0.1:8471/
node tests/smoke.mjs    # opens every tool in headless Chrome and checks known answers
node tests/smoke.mjs --shots   # …and refreshes screenshots/
```

Deploy with `./tools/deploy.sh` (Cloudflare Pages, project `thetoolbox`).

On iPhone: open the site in Safari → Share → **Add to Home Screen**. It then opens full
screen like an app and keeps working without a connection (`sw.js`).

## Adding a tool

Each tool is an object in one of `js/tools/*.js`:

```js
{ id, name, group, icon, desc, keywords,
  accepts: ['image/*'],          // what it can open: MIME family, '.ext', 'file', 'text', 'colour'
  steps: [ … ],                  // optional workflow steps (see js/workflows.js)
  render(root, incoming) { /* build the UI into root; incoming is a payload from Send to / drop */ } }
```

Add it to that file's exported array and it appears on the home page, in the sidebar
and in search. Helpers for fields, outputs with copy buttons and tabs are in `js/ui.js`;
icons are Lucide names from `js/icons.js` (add more with `node tools/icons.mjs <name>`); hand-offs are
in `js/hub.js`. Then add a known-answer check to `tests/checks/<file>.mjs`. Tools that handle secrets set `keep: false`. The offline file list in
`sw.js` is written automatically by `tools/deploy.sh`.

## Third-party code (in `vendor/`, `fonts/`, `js/icons.js`)

js-yaml (MIT), smol-toml (BSD-3), bcryptjs (BSD-3), qrcode-generator (MIT), jsdiff (BSD-3),
cronstrue (MIT), js-md5 (MIT), Papa Parse (MIT), marked (MIT), sql-formatter + nearley (MIT),
jsQR (Apache-2.0), fflate (MIT), svgo (MIT), imagetracerjs (Unlicense), pdf-lib (MIT),
pdf.js (Apache-2.0; its wasm decoders BSD-2/MIT), mediabunny (MPL-2.0, unmodified),
@ffmpeg/ffmpeg (MIT), gifenc (MIT), math.js (Apache-2.0, bundled with complex.js, decimal.js,
fraction.js, typed-function, escape-latex, javascript-natural-sort, seedrandom, tiny-emitter — all MIT),
bwip-js (MIT), opentype.js (MIT), wawoff2 (MIT), turndown + turndown-plugin-gfm (MIT),
mammoth (BSD-2), docx (MIT), Unicode character names (Unicode License v3, built by
`tools/build-unicode-names.py`), Lucide icons (ISC), Bricolage Grotesque and JetBrains Mono (SIL OFL).

Fetched at run time, never stored in this repo: transformers.js (Apache-2.0), the ormbg
background-removal model (Apache-2.0), Whisper tiny/base (MIT), and @ffmpeg/core (GPL-2.0+,
loaded from jsDelivr only when a video needs it).
