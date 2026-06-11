# Publishing to GitHub

## One-time setup

```bash
node scripts/init-docs-internal.mjs
git config core.hooksPath .githooks
git remote add origin https://github.com/ladaojeifang/AssetVault_Browser_Extension.git
```

## Before push

```bash
pnpm run typecheck
pnpm run test
git push -u origin master:main
```

## Public vs local

| Pushed | Local only (`docs-internal/`) |
|--------|-------------------------------|
| `docs/WEB_API.md`, `architecture.md`, API specs | ROADMAP, optimization plans, Pro-side drafts |
| `src/`, `testing/`, `contracts/` | — |
