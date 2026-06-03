# 扩展架构概要

## 数据流

```text
网页 (content.js)
  ├─ 右键/拖拽/Shot UI → chrome.runtime.sendMessage
  ├─ Board Saver 面板 → IMPORT_BATCH
  └─ hooks: __assetVaultScanBatch / __assetVaultResolveHd
        ↓
Service Worker (background.js)
  ├─ ConcurrencyQueue 限流批量导入
  └─ shared/api.ts → 本机 AssetVault Pro Web API
        ↓
桌面端导入资料库
```

## 构建产物

| 入口 | 构建 | 格式 | 说明 |
|------|------|------|------|
| `content/index.ts` | Vite（第 2 次 build） | IIFE `content.js` | manifest 注入，必须单文件、非 module |
| `popup` / `batch` / `background` | Vite（第 1 次 build） | ESM | 扩展页与 SW |
| `injected-shot-ui` / `injected-x-scan` | Vite（第 1 次 build） | ESM | `scripting.executeScript` 注入 |

**构建命令：** 仅 `vite build`（主配置打 ESM；`closeBundle` 插件再打 content IIFE 到同一 `dist/`）。

**开发监听：** `pnpm run dev` 时，`src/content/` 与 `src/board-saver/` 会通过 `addWatchFile` 注册到 Rollup watch，改动后会触发重建并更新 `dist/content.js`。

**为何 content 仍单独一档：** 不是第二套工具，而是 **同一 Vite/Rollup 下无法用一次 output 混用 ESM + IIFE**，故两次 build pass。`src/shared` 仍会在 content 与各 ESM 入口里**各打一份**（扩展场景无法共用一个 runtime chunk）。

**历史：** 曾用独立 `esbuild` 脚本打 content；已合并进 Vite，避免双引擎维护成本。

## Board Saver 扫描状态

- **static**：短页，检测后单次扫描即可
- **lazy**：自动滚动触发懒加载，完成后可转入 periodic
- **waterfall**：持续 periodic 扫描

导入时暂停 periodic；结束后由 `resolvePostImportAction()` 决定恢复 periodic、继续懒加载滚动或 idle。

## 整页截图限制

- 最多 **25** 段 `captureVisibleTab`（Chrome 频率配额）
- 页面 CSS 高度上限 **40000px**（超出会截断并提示）
- 输出按 Canvas 像素上限分片；单分片 **>6MB** 时自动降 JPEG 质量/缩放，超大走下载再 `importAsset`
- API 导入超时：整页分片 **120s**（普通请求仍为 10s）

## 相关文件

- `src/board-saver/board-saver-bridge.ts` — UI + 编排
- `src/board-saver/board-saver-scan-state.ts` — 导入后恢复策略（可单测）
- `vite.config.ts` — ESM 入口 + content IIFE 插件
- `scripts/postbuild.mjs` — manifest、静态页、图标
