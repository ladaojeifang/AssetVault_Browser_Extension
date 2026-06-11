# Local-only documentation (`docs-internal/`)

**`docs-internal/`** is gitignored and not pushed to GitHub.

## Setup

```bash
node scripts/init-docs-internal.mjs
```

## Typical contents

| Path | Examples |
|------|----------|
| `planning/` | ROADMAP, Pro-side requirement drafts |
| `maintenance/` | optimization plans, tech-debt notes |

Commit inside `docs-internal/` with its nested git repo; do not push to GitHub.
