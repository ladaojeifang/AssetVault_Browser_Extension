# AssetVault Pro — Browser Extension

> **中文说明：** [README.zh-CN.md](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Chrome / Edge (Manifest V3) extension: collect image/video URLs from web pages and import them into your library via the local **AssetVault Pro Web API** (desktop app downloads and ingests assets).

**Standalone project:** requires [AssetVault Pro](https://github.com/ladaojeifang/AssetVault_Pro) desktop ([Community Edition](https://github.com/ladaojeifang/AssetVault_Pro), MIT) running on the same machine.

The desktop app must be running with **Settings → Advanced → Web API** enabled (default `http://127.0.0.1:41596/api/v1`).

- API reference: [docs/WEB_API.md](docs/WEB_API.md) (full guide: [AssetVault_Pro/doc/web-api-v1-guide.md](https://github.com/ladaojeifang/AssetVault_Pro/blob/main/doc/web-api-v1-guide.md))

---

## Features (v0.1)

| Capability | Description |
|------------|-------------|
| Context menu | “Save to AssetVault Pro” on images/pages |
| Drop zone | Drag images to the bottom-right drop area (can disable in popup) |
| Popup | API URL, token, default folder, connection status |
| Batch collect | Multi-source probing (meta / srcset / lazy-load / Performance, etc.) + preview and full-resolution URLs |
| Video/GIF deep collect | Generic detection + site adapters (YouTube, Twitter/X, Bilibili) |
| Site permissions | On-demand `optional_host_permissions` |
| URL enlarger rules | `src/shared/url-enlarger-site-rules.ts` (50+ sites); X uses dedicated syndication pipeline |

---

## Project layout

```text
src/
  manifest.json
  background/     # Service Worker
  content/        # Page injection
  popup/          # Extension popup
  batch/          # Batch collection page
  shared/         # API client, site rules, collection logic
testing/          # Unit tests, fixtures, test docs
scripts/          # postbuild, package, contract checks
dist/             # Build output (load into browser)
release/          # Packaged zip
docs/             # Public integration docs (index: docs/README.md)
contracts/        # OpenAPI mirror and extension-api-surface
```

---

## Development

```bash
cd AssetVault_Browser_Extension   # or your clone path
pnpm install
pnpm run build
```

- Chrome: `chrome://extensions` → **Load unpacked** → select this repo’s **`dist`** folder (see `LOAD-EXTENSION-HERE.txt`).
- After changes: `pnpm run build`, then **Reload** on the extensions page.

Optional watch mode (rebuilds ESM entry + content IIFE; reload extension after editing `src/content` / `board-saver`):

```bash
pnpm run dev
```

---

## Packaging

### ZIP (Chrome Web Store / manual distribution)

```bash
pnpm run package
```

Output: `release/assetvault-extension-v0.1.0.zip`.

### CRX (local install package)

```bash
pnpm install
pnpm run package:crx
```

Output:

| File | Description |
|------|-------------|
| `release/assetvault-extension-v*.crx` | Install package |
| `release/assetvault-extension.pem` | Private key (**back up after first generation**; same `.pem` required to update the same extension ID) |
| `release/assetvault-extension-v*.zip` | Same content as ZIP (`crx3` also emits this) |

**Chrome UI packaging** (no extra deps):

1. `pnpm run build`
2. Open `chrome://extensions` → enable **Developer mode**
3. **Pack extension** → root directory **`dist`** → private key: existing `release/assetvault-extension.pem` or leave empty to generate new
4. Produces `.crx` and `.pem` in the output directory

**CRX install notes**:

- [Chrome Web Store](https://chrome.google.com/webstore/devconsole) uploads use **ZIP**, not CRX.
- Recent Chrome (Win/Mac) usually **cannot** install CRX by double-click; common options: **Load unpacked** pointing at `dist`, enterprise policy, or Edge “Load extension”.
- Do not commit `.pem` to Git (listed in `.gitignore`).

---

## Configuration

| Setting | Default |
|---------|---------|
| API | `http://127.0.0.1:41596/api/v1` |
| Token | empty (usually not needed on localhost) |
| Duplicate policy | `use_existing` |

---

## Testing

Test code lives under `testing/`, separate from `src/`.

| Command | Description |
|---------|-------------|
| `pnpm test` | Unit tests + OpenAPI contract check |
| `pnpm run test:unit` | Unit tests only (no contract) |
| `pnpm run contract:sync` | Sync OpenAPI from Pro into `contracts/` |

Details: [testing/README.md](testing/README.md) · [testing/doc/strategy.md](testing/doc/strategy.md)

Does **not** include Pro’s Vitest suites; run `pnpm run test:all` in `AssetVault_Pro`.

---

## Working with the desktop repo

Recommended local layout:

```text
work/soft_script/
  AssetVault.code-workspace    # optional: Cursor multi-root workspace
  AssetVault_Pro/              # Electron desktop (API source of truth)
  AssetVault_Browser_Extension/  # this repo
```

Full workflow: **[docs/cross-repo-workflow.md](docs/cross-repo-workflow.md)**.

| Command | Description |
|---------|-------------|
| `pnpm run contract:sync` | Copy OpenAPI from Pro into `contracts/` |
| `pnpm run contract:check` | Verify extension surface ⊆ OpenAPI (included in `pnpm test`) |
| `pnpm run smoke:pro` | Probe `GET /app/info` when Pro is running |

When changing Web API contracts: update Pro guide + OpenAPI → `contract:sync` → update `src/shared/api.ts` etc. → update `contracts/extension-api-surface.json`.

## Open source

MIT — see [LICENSE](LICENSE). Maintainer-only docs: **`docs-internal/`** (`node scripts/init-docs-internal.mjs`). Publishing: [PUBLISHING.md](PUBLISHING.md).
