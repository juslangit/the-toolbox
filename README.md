# The Toolbox

**Live: https://thetoolbox.pages.dev**

Small developer tools that run entirely in the browser — nothing you type leaves the device,
and it works offline once opened. Inspired by [IT Tools](https://it-tools.tech); written from
scratch (no IT Tools code is used).

**31 tools in four drawers**

| Crypto & IDs | Converters | Web & dev | Everyday |
|---|---|---|---|
| Token & password | Base64 (text and files) | URL encode & parse | QR code (links, WiFi) |
| Hash text (MD5, SHA, HMAC) | Data formats (JSON ⇄ YAML ⇄ TOML ⇄ CSV) | Regex tester | QR scanner (camera or photo) |
| Bcrypt | Date & timestamp | Crontab | Lorem ipsum |
| UUID v4/v7, ULID, nanoid | Colour converter | chmod calculator | Text statistics |
| JWT decoder | Number bases | Text diff, JSON formatter | Case & slug |
| Password strength | HTML entities | IPv4 subnet, docker run → compose | Image placeholder |
| File checksum | Markdown preview | User-agent parser, SQL formatter, HTTP status codes | |

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
{ id, name, group, icon, desc, keywords, render(root) { /* build the UI into root */ } }
```

Add it to that file's exported array and it appears on the home page, in the sidebar
and in search. Helpers for fields, outputs with copy buttons and tabs are in `js/ui.js`;
icons are Lucide names from `js/icons.js`. Then add a known-answer check to
`tests/smoke.mjs`. Tools that handle secrets set `keep: false`. The offline file list in
`sw.js` is written automatically by `tools/deploy.sh`.

## Third-party code (in `vendor/`, `fonts/`, `js/icons.js`)

js-yaml (MIT), smol-toml (BSD-3), bcryptjs (BSD-3), qrcode-generator (MIT), jsdiff (BSD-3),
cronstrue (MIT), js-md5 (MIT), Papa Parse (MIT), marked (MIT), sql-formatter + nearley (MIT),
jsQR (Apache-2.0), Lucide icons (ISC),
Bricolage Grotesque and JetBrains Mono (SIL Open Font Licence).
