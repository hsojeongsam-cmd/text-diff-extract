# text-diff-extract

[한국어](./README.ko.md) · English

A PWA that takes a WhatsApp chat export (`.zip` / `.txt`) and gives you back **only the messages added since you last ran it**. All processing happens inside your browser — chat contents never leave your device.

**Live**: https://hsojeongsam-cmd.github.io/text-diff-extract/

## Why

WhatsApp's "Export chat" always dumps the *entire* conversation. Pull the same chat weekly and 99% of every export is duplicate. This app remembers the messages you've already seen and, on the next export, hands you a `.txt` containing **only what was added in between**.

## How it works

1. Drop a `.zip` or `.txt` WhatsApp export onto the app.
2. The app parses messages and hashes each one over `(timestamp, sender, content)` with SHA-256.
3. It diffs the new hash set against the chat's previous run, stored in IndexedDB.
4. New messages are written to a downloadable `.txt` with a small header.
5. The new hashes are merged into the stored set, becoming the baseline for next time.

A chat is identified by a stable key derived from its first message's `(timestamp, sender)`. If you give the chat an explicit name, that name becomes the key — useful for merging multiple exports of the same conversation under one tracking record.

## Features

- **Incremental extraction**: only the delta is downloaded.
- **Multiple chats**: each conversation is tracked independently.
- **WhatsApp share-sheet integration** (Android Chrome): export from WhatsApp → share → pick this app, no manual file picking. Uses the Web Share Target API.
- **Offline**: a service worker precaches the app shell.
- **Installable (PWA)**: add to home screen and it runs like a native app.
- **State backup / restore**: export tracking state as JSON in case the browser ever evicts IndexedDB.
- **Zero network egress**: no analytics, no CDN, no upload. JSZip is vendored.

## Usage

### Install (mobile)

1. Open the live URL in iOS Safari or Android Chrome.
2. Share → "Add to Home Screen".

### Workflow

1. WhatsApp chat → menu → **More → Export chat → Without media**.
2. Open this app → drop the file in (Android: pick it from the share sheet).
3. Confirm "N new messages" → **Save new messages .txt**.
4. The chat name is auto-detected. Rename it on first run if you want a stable label across future exports.

## Privacy

- All parsing, hashing, and storage happen in-browser.
- No outbound network calls — no third-party CDN either (JSZip is vendored under `vendor/`).
- Tracking state (message hashes, chat names) lives only in your device's IndexedDB. Message bodies are not stored.
- "Reset all state" wipes everything at any time.

## Stack

| Concern | Choice |
|---|---|
| UI | Vanilla JS (ES modules), no framework |
| Unzip | [JSZip](https://stuk.github.io/jszip/) (vendored) |
| Hashing | Web Crypto `SubtleCrypto.digest("SHA-256", …)` |
| Storage | IndexedDB |
| Offline / share | Service Worker + Web Share Target API |
| Hosting | GitHub Pages (static, HTTPS enforced) |

## Files

```
index.html              # Entry point, inline CSS
app.js                  # UI, IndexedDB, processing pipeline
parser.js               # Pure parsing/hashing — runnable under Node for tests
sw.js                   # App-shell cache + share_target POST handler
manifest.webmanifest    # PWA manifest + share_target
vendor/jszip.min.js     # Zip extraction
icons/                  # 192 / 512 / maskable
scripts/test_parser.mjs # Parser tests (Node)
scripts/make_icons.py   # Icon generator (dev tooling)
```

## Development

No build step. Serve the directory statically.

```sh
# Local run (some PWA features need HTTPS — use the live URL for those)
python3 -m http.server 8000
# or
npx serve .
```

Run parser tests:

```sh
node scripts/test_parser.mjs
```

## Deploy

`main` branch root is the GitHub Pages source. Just push.

```sh
git push origin main
# Live in 1–2 min at https://hsojeongsam-cmd.github.io/text-diff-extract/
```

## Known limits

- iOS Safari has no Web Share Target API, so the share-sheet flow only works on Android Chrome — iOS users pick the file manually.
- Chrome may evict IndexedDB under storage pressure. Periodically use "State backup (JSON)".
- If WhatsApp changes its export format, the regexes in `parser.js` may need updating.

## License

MIT
