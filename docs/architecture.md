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
| `fullpage-injected` | Vite（`closeBundle` 第 2 次 pass） | **IIFE** `fullpage-injected.js` | 整页滚动/浮层；**禁止** ESM `import` 注入 |

**构建命令：** 仅 `vite build`（主配置打 ESM；`closeBundle` 插件再打 content IIFE，并执行 `postbuild.mjs` 复制 manifest/静态资源到 `dist/`）。

**开发监听：** `pnpm run dev` 时，`src/content/`、`src/board-saver/` 以及 manifest/CSS/HTML 静态资源会通过 `addWatchFile` 注册到 Rollup watch，改动后会重建 `dist/`。

**为何 content 仍单独一档：** 不是第二套工具，而是 **同一 Vite/Rollup 下无法用一次 output 混用 ESM + IIFE**，故两次 build pass。`src/shared` 仍会在 content 与各 ESM 入口里**各打一份**（扩展场景无法共用一个 runtime chunk）。

**历史：** 曾用独立 `esbuild` 脚本打 content；已合并进 Vite，避免双引擎维护成本。

## Board Saver 扫描状态

- **static**：短页，检测后单次扫描即可
- **lazy**：`AutoScrollEngine` 自动滚动触发懒加载；25s 未到底则转入 periodic
- **waterfall**：持续 periodic 扫描

导入时暂停 periodic；结束后由 `resolvePostImportAction()` 决定恢复 periodic、继续懒加载滚动或 idle。

## 整页截图

### 采集与入库

- 滚动屏数 **不人为上限**（仍受 Chrome `captureVisibleTab` 频率与页面 CSS 高度 **40000px** 限制）
- **唯一路径**：`fullPageSession`（start → append `stripDataUrl` → finish），条带写入当前资料库 `remote-imports/inspect-{时间戳}/strip-NNNN.jpg`，Pro 竖拼入库
- `FULLPAGE_KEEP_STRIP_FILES_AFTER_FINISH`：默认 `false`（finish 后删条带）；`true` 时保留 `remote-imports/inspect-*` 供调试
- 采集：`fullpage-injected.js` + `FullpageOutputBuffer`（懒分配条带 canvas）；滚动中每 8 屏可重读 `scrollHeight`
- 发给 Pro 的 `devicePixelRatio` = 实际 `captureScale`（首帧 bitmap 宽度 / CSS 视口宽）
- 失败直接报错（无扩展内压缩回退）
- `finish` 超时 **180s**（`FULLPAGE_SESSION_FINISH_TIMEOUT_MS`）

规格见 [fullpage-stitch-session-api-spec.md](./fullpage-stitch-session-api-spec.md)。相关模块：`fullpage-session-api.ts`、`fullpage-session-import.ts`、`fullpage-strip-upload.ts`。

## 网页保存为 Markdown

- 扩展已实现：页面顶部视口缩略图 → 采集主栏 → Turndown → 媒体本地化 → 编排会话长传
- 缩略图：滚至 `scrollY=0` 后单次 `captureVisibleTab`（非整页拼接），采集后恢复滚动；正文提取可在懒加载预滚动后进行
- 会话接口 `articleBundleSession` 位于 `article-bundle-session-api.ts`
- 等待 Pro 端实现对应的 `start/append/finish` 接口
- 需求文档（扩展）：[page-markdown-export-extension-requirements.md](./page-markdown-export-extension-requirements.md)
- 需求文档（Pro）：[page-markdown-export-pro-requirements.md](./page-markdown-export-pro-requirements.md)

## 相关文件

- `src/board-saver/board-saver-bridge.ts` — UI 编排与状态（mount/scan/import 协调）
- `src/board-saver/board-saver-lifecycle.ts` — mount/unmount、CSS 注入、面板事件绑定
- `src/board-saver/board-saver-scan-collect.ts` — 深度页面采集（背景图/srcset/站点特化）
- `src/board-saver/board-saver-import.ts` — 批量导入响应聚合与摘要
- `src/board-saver/board-saver-import-flow.ts` — 分批导入与重试
- `src/board-saver/board-saver-filters.ts` — 尺寸/格式/低质量筛选（纯函数，可单测）
- `src/board-saver/board-saver-filter-sidebar.ts` — 筛选侧栏 DOM
- `src/board-saver/board-saver-panel.ts` — 面板 HTML、卡片、导入摘要
- `src/board-saver/board-saver-grid.ts` — 网格筛选/排序/选中同步
- `src/board-saver/board-saver-edit.ts` — 预览编辑与批量重命名
- `src/board-saver/board-saver-quick-save.ts` — 快采模式点击保存
- `src/board-saver/board-saver-page-detection.ts` — 页面类型分类（纯函数）
- `src/board-saver/board-saver-lazy-scroll.ts` — 懒加载页滚动控制器
- `src/board-saver/board-saver-settings.ts` / `board-saver-history.ts` — 持久化
- `src/board-saver/board-saver-scan-state.ts` — 导入后恢复策略（可单测）
- `src/shared/auto-scroll-engine.ts` — 懒加载页 RAF 滚动
- `vite.config.ts` — ESM 入口 + content IIFE + postbuild 静态复制插件
- `scripts/postbuild.mjs` — manifest、静态页、图标（由 Vite 插件调用）
