# The Toolbox

Small developer tools that run entirely in the browser — nothing you type leaves the device,
and it works offline once opened. Inspired by [IT Tools](https://it-tools.tech); written from
scratch (no IT Tools code is used).

**21 tools in four drawers**

| Crypto & IDs | Converters | Web & dev | Everyday |
|---|---|---|---|
| Token & password | Base64 (text and files) | URL encode & parse | QR code (links, WiFi) |
| Hash text (MD5, SHA, HMAC) | Data formats (JSON ⇄ YAML ⇄ TOML ⇄ CSV) | Regex tester | Lorem ipsum |
| Bcrypt | Date & timestamp | Crontab | Text statistics |
| UUID v4/v7, ULID, nanoid | Colour converter | chmod calculator | Case & slug |
| JWT decoder | Number bases | Text diff, JSON formatter | Image placeholder |

## Run it

No build step — plain HTML, CSS and ES modules.

```bash
node serve.mjs          # http://127.0.0.1:8471/
node tests/smoke.mjs    # opens every tool in headless Chrome and checks known answers
node tests/smoke.mjs --shots   # …and refreshes screenshots/
```

On iPhone: open the site in Safari → Share → **Add to Home Screen**. It then opens full
screen like an app and keeps working without a connection (`sw.js`).

## Adding a tool

Each tool is an object in one of `js/tools/*.js`:

```js
{ id, name, group, icon, desc, keywords, render(root) { /* build the UI into root */ } }
```

Add it to that file's exported array and it appears on the home page, in the sidebar
and in search. Helpers for fields, outputs with copy buttons and tabs are in `js/ui.js`;
icons are Lucide names from `js/icons.js`. Then add a known-answer check to
`tests/smoke.mjs` and list any new file in `sw.js`.

## Third-party code (in `vendor/`, `fonts/`, `js/icons.js`)

js-yaml (MIT), smol-toml (BSD-3), bcryptjs (BSD-3), qrcode-generator (MIT), jsdiff (BSD-3),
cronstrue (MIT), js-md5 (MIT), Papa Parse (MIT), Lucide icons (ISC),
Bricolage Grotesque and JetBrains Mono (SIL Open Font Licence).
