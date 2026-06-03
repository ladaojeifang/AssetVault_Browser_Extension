# 网页保存为 Markdown — 浏览器扩展功能开发需求

> **状态**：待开发  
> **读者**：AssetVault Browser Extension 开发  
> **关联 Pro 规格**：[page-markdown-export-pro-requirements.md](./page-markdown-export-pro-requirements.md)  
> **参考管线**：[webpage-to-markdown-export-scheme.md](../../github/webpage-to-markdown-export-scheme.md)（外部归纳，非本仓实现）

---

## 1. 概述

### 1.1 功能名称

**保存当前网页为 Markdown 资料包**（工作名：`Page Markdown Export`）

### 1.2 用户故事

作为资料库用户，我在浏览器中打开一篇文章/帖子后，希望一键将**主栏正文**保存为 Markdown 文件，并将正文中的图片、可下载视频保存到**同一资产目录**下，使 Markdown 内使用 `./assets/...` 相对路径即可离线阅读；资料库列表中用**页面最顶端一屏**截图作为该条目的缩略图（导出前滚至顶部单帧，非整页长图）。

### 1.3 业务目标

| 目标 | 说明 |
|------|------|
| 主栏正文 | 提取当前页「主内容列」文字结构，输出 GFM Markdown |
| 格式保留 | 段落、标题、列表、引用、表格、 fenced 代码块等 |
| 媒体本地化 | 主栏内图片、可直链视频下载后写入相对路径 |
| 视口缩略图 | **页面顶部**单帧截图（滚至 `scrollY=0` 后 `captureVisibleTab`，非整页长图） |
| 单条资产 | 通过 Pro API 入库为 **1 个** `assetId`（见 Pro 需求文档） |
| 体验一致 | 默认文件夹、重复策略、Token、Toast、API 连通性与现有导入一致 |

### 1.4 非目标（本功能不做）

- 在扩展内实现资料库磁盘目录与 DB 写入（全部由 Pro 完成）
- 以「每张图一次 `importFromURL`」冒充资料包（会破坏相对路径语义）
- 默认导出整页所有区域媒体（侧栏广告、全站 header/footer）
- 远程 HTML 抓取 / Jina Reader（后续版本可选）
- 浏览器本地下载 ZIP 作为主交付（仅可作为 Pro API 未就绪时的开发兜底）

### 1.5 对 Pro 的依赖

| 依赖项 | 说明 |
|--------|------|
| **硬依赖** | Pro 实现 `articleBundleSession` 或等价导入 API（见 Pro 需求文档） |
| **未就绪行为** | 扩展完成提取与组装后，若 API 不可用：Toast 提示需升级 Pro，**不**静默降级为多资产 URL 导入 |
| **联调版本** | 扩展 PR 需标注最低 Pro 版本（如 `app/info.version` 能力位或 OpenAPI tag） |

---

## 2. 职责边界

```text
浏览器扩展（本文档范围）              AssetVault Pro（另文档）
────────────────────────────────────────────────────────────
主栏 DOM 提取、Readability 兜底        —
Turndown + GFM、YAML front matter      —
主栏媒体 URL 清单、高清 URL            —
视口 captureVisibleTab → thumb         —
媒体 fetch / 临时文件路径              校验、会话、写入 {assetId}/
路径替换后的最终 markdown              —
编排、进度、取消、错误 Toast            返回 assetId / warnings
```

---

## 3. 功能需求

### 3.1 用户入口（FR-E-UI）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-E-UI-01 | Popup 提供「保存本页为 Markdown」按钮 | 在当前可注入 tab 上可触发；不可注入页禁用并提示 |
| FR-E-UI-02 | 页面右键菜单项「保存正文为 Markdown」 | 与 Popup 共用同一 SW 编排逻辑 |
| FR-E-UI-03 | （可选）Board Saver 面板内入口 | 与批量导入并列；使用当前页 URL 与用户文件夹偏好 |
| FR-E-UI-04 | 长任务反馈 | 显示阶段性 Toast（提取中 / 下载媒体 / 上传中）；支持取消 |
| FR-E-UI-05 | 完成反馈 | 成功：资产标题 + assetId 摘要；部分失败：列出 `warnings` |
| FR-E-UI-06 | 失败反馈 | 明确错误码文案（无正文、API 不可用、用户取消等） |

### 3.2 页面准备与主栏提取（FR-E-EXTRACT）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-E-EXTRACT-01 | 站点规则引擎 `PageMdRuleEngine` | URL 匹配 → `mainColumnSelector`、`postProcessDom`、`turndownRules` |
| FR-E-EXTRACT-02 | 首批内置规则 | 微信、知乎、CSDN、Medium、X/Twitter、贴吧 + `generic` |
| FR-E-EXTRACT-03 | 主栏优先 | 匹配 selector 且正文文本长度 ≥ 200 字时使用该节点 |
| FR-E-EXTRACT-04 | Readability 兜底 | 无规则或 selector 失败时使用 `@mozilla/readability` |
| FR-E-EXTRACT-05 | 提取失败 | 返回 `MAIN_COLUMN_NOT_FOUND`，不生成空 MD、不调用 Pro finish |
| FR-E-EXTRACT-06 | DOMPurify 净化 | 移除 script/style 等；白名单保留正文结构标签 |
| FR-E-EXTRACT-07 | 懒加载页预滚动 | `lazy` / `waterfall`（复用 `classifyPageType`）时滚动加载；优先滚动主栏容器 |
| FR-E-EXTRACT-08 | 懒加载归一化 | `img.src ← data-src \|\| currentSrc \|\| src`；微信等 `postProcessDom` 处理背景图 |
| FR-E-EXTRACT-09 | 标题 | 默认 `document.title`；规则可指定 `titleSelector` / `og:title` |
| FR-E-EXTRACT-10 | 未注入 content | SW 通过 `scripting.executeScript` 执行 extract（对齐 x-scan 模式） |

**主栏定义（默认）：** 用户当前阅读的主内容列；**不包含**全站导航、页脚、侧栏推荐、评论区（评论区纳入后续可选开关 `includeComments`）。

### 3.3 Markdown 转换（FR-E-MD）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-E-MD-01 | Turndown | `@joplin/turndown` + GFM 插件（tables、strikethrough、fenced code） |
| FR-E-MD-02 | Front matter | 至少包含 `title`、`source`（页 URL）、`exported_at`（ISO8601） |
| FR-E-MD-03 | 正文标题 | 文内保留一级标题与 front matter `title` 一致 |
| FR-E-MD-04 | 移除节点 | `script`、`style`、`noscript` 不进 MD |
| FR-E-MD-05 | 站点 Turndown 规则 | 规则表可注册 custom rules（如 Medium 代码块） |

### 3.4 媒体清单（FR-E-MEDIA）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-E-MEDIA-01 | 扫描范围 | 仅 `mainColumnRoot` 内 `img`、`video`、`source` 及规则转换后的等价节点 |
| FR-E-MEDIA-02 | URL 绝对化 | 相对 URL 基于页 URL；协议相对 URL 规范化 |
| FR-E-MEDIA-03 | 去重 | 相同 URL 只下载一次 |
| FR-E-MEDIA-04 | 图片高清 | 落盘前调用 `enlargeImageUrl`（与 Board Saver 一致） |
| FR-E-MEDIA-05 | 命名 | `img-001.jpg`、`vid-001.mp4`（三位序号 + 扩展名推断） |
| FR-E-MEDIA-06 | 直链视频 | `<video src>` / `<source>` 可解析则纳入下载清单 |
| FR-E-MEDIA-07 | iframe 流媒体 | YouTube/B 站等：**不**假装已下载；MD 内输出说明块 + 原始链接 |
| FR-E-MEDIA-08 | base64 图 | 小于阈值转 `assets/img-xxx.png`；过大跳过并记入 `failed_assets` |
| FR-E-MEDIA-09 | blob URL | 在页面上下文 fetch 转 blob 后上传；失败记入 `failed_assets` |

### 3.5 视口缩略图（FR-E-THUMB）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-E-THUMB-01 | 采集方式 | 导出前将标签页滚至顶部（`scrollY=0`），等待布局稳定后单次 `captureVisibleTab`（复用 `captureVisibleTabThrottled`），采集后恢复用户原滚动位置 |
| FR-E-THUMB-02 | 非整页 | **不得**走 `fullPageSession` 或多段滚动拼接；仅顶端一屏 |
| FR-E-THUMB-03 | 格式 | JPEG；质量/缩放控制体积（参考 `fullpage-capture` 条带体积思路，目标适配 Pro append 限制） |
| FR-E-THUMB-04 | 文件名 | 上传 Pro 时使用约定名 `_thumb.jpg`（与 Pro 文档一致） |
| FR-E-THUMB-05 | 正文 | 缩略图**不**写入 MD 正文（仅作库内预览） |

### 3.6 下载与路径替换（FR-E-LOCALIZE）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-E-LOCALIZE-01 | 下载并发 | 复用 `ConcurrencyQueue` / `BATCH_DOWNLOAD_CONCURRENCY`（建议 3–6） |
| FR-E-LOCALIZE-02 | 下载策略 | 优先 content script `fetch`（带 Cookie/Referer）；失败再交 Pro append 或 SW 代理（若 Pro 提供代下则为可选） |
| FR-E-LOCALIZE-03 | 重试 | 每个 URL 最多 2 次 |
| FR-E-LOCALIZE-04 | 路径替换 | 成功项在 MD 中替换为 `./assets/{filename}` |
| FR-E-LOCALIZE-05 | 替换顺序 | 按 URL 字符串长度降序替换，避免子串误替换 |
| FR-E-LOCALIZE-06 | 失败项 | 保留原始 URL；写入 `meta.failed_assets[]` |
| FR-E-LOCALIZE-07 | MD 文件名 | `sanitize(pageTitle).md`；非法字符替换、长度上限（如 120） |
| FR-E-LOCALIZE-08 | 可选 meta.json | `sourceUrl`、`ruleId`、`exportedAt`、`failed_assets` |

### 3.7 与 Pro 通信（FR-E-API）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-E-API-01 | 客户端封装 | `src/shared/article-bundle-session-api.ts`（命名可调整） |
| FR-E-API-02 | 会话流程 | `start` → 写入 thumb + md + 各 `assets/*`（`append`）→ `finish`；失败/取消 `abort` |
| FR-E-API-03 | 临时文件路径 | 与整页一致：`AssetVault_Temp/article/{sessionId}/...`，路径须落在 Pro 返回的 `tempDir` 下 |
| FR-E-API-04 | 请求字段 | `sourceMeta.pageUrl`、`pageTitle`；`output.targetFolderId`、`duplicatePolicy` 来自用户偏好 |
| FR-E-API-05 | 成功后 | 可选 `assignTags`；`updateAsset({ sourceUrl, notes })` 写入摘要或失败说明 |
| FR-E-API-06 | 能力检测 | 启动前 `GET /app/info` 或版本/feature 标志；无能力时明确提示 |
| FR-E-API-07 | 超时 | `append` 短超时、`finish` 长超时（具体值遵循 Pro 需求文档） |

### 3.8 消息与编排（FR-E-MSG）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-E-MSG-01 | `EXPORT_PAGE_MARKDOWN` | Popup/菜单 → SW 发起 |
| FR-E-MSG-02 | `PAGE_MD_EXTRACT` | SW → CS 返回 `{ title, sourceUrl, markdownDraft, media[], ruleId }` |
| FR-E-MSG-03 | `EXPORT_PAGE_MARKDOWN_ABORT` | 用户取消；SW 调 Pro `DELETE .../abort` 并清理本地状态 |
| FR-E-MSG-04 | 单 job | 同一 tab 同时仅一个导出 job（与整页截图互斥策略需定义，建议互斥） |

---

## 4. 模块与文件规划

```text
src/
  page-markdown/
    rules/                    # PageMdRuleEngine + 各站规则
    extract/
      main-column.ts
      prepare-dom.ts          # 滚动、懒加载
      media-inventory.ts
    convert/
      turndown.ts
      frontmatter.ts
      sanitize-filename.ts
    export/
      localize-paths.ts
      bundle-payload.ts
    orchestrate.ts            # CS：PAGE_MD_EXTRACT 入口
  shared/
    article-bundle-session-api.ts
    article-bundle-session-import.ts  # SW 编排（对齐 fullpage-session-import）
    messages.ts               # 新增消息类型
  background/
    page-markdown-export.ts   # 或并入 service-worker 路由
```

**复用（不重复实现）：**

| 现有模块 | 用途 |
|----------|------|
| `auto-scroll-engine.ts` | 懒加载预滚动 |
| `board-saver-page-detection.ts` | 页类型分类 |
| `page-image-scanner.ts` / `url-enlarger` | 高清 URL（仅主栏过滤后） |
| `site-adapters/*` | 站点经验迁移到 `page-markdown/rules` |
| `captureVisibleTabThrottled` | 缩略图 |
| `fullpage-session-import.ts` 模式 | 会话式上传编排 |
| `collect-meta-core.sanitize` | 文件名安全（可抽 shared） |
| `getPreferences` / `importFromUrlBatch` 并发模式 | 偏好与队列 |

---

## 5. 依赖与构建

### 5.1 新增 npm 依赖（拟）

| 包 | 用途 |
|----|------|
| `@mozilla/readability` | 主栏兜底 |
| `@joplin/turndown` | HTML → MD |
| `@joplin/turndown-plugin-gfm` | GFM |
| `dompurify` | 净化 |

### 5.2 构建约束

- Content script 为 IIFE 单文件：评估 Turndown/Readability 体积；必要时 **page-markdown 仅由 SW + injected script** 执行 extract，content 只转发消息。
- 新增 injected bundle 可选：`page-markdown-injected.js`（对齐 `fullpage-injected.js` 模式）。

### 5.3 权限

- 沿用现有 host permissions；无需新增 broad host（除非后续远程 fetch fallback）。

---

## 6. 错误处理

| 场景 | 扩展行为 |
|------|----------|
| `MAIN_COLUMN_NOT_FOUND` | Toast 说明；不调用 Pro |
| Pro API 404 / 版本过低 | 提示升级 Pro |
| 用户取消 | `abort` + Toast「已取消」 |
| 部分媒体失败 | 仍 `finish`（若 Pro 支持 partial）；Toast 列出失败数 |
| tab 不可注入 | `chrome://`、PDF 等提示不支持 |
| 与整页截图并发 | 拒绝或排队（需在 FR-E-MSG-04 实现一种） |

---

## 7. 测试需求

| 类型 | 范围 |
|------|------|
| 单元测试 | `sanitize-filename`、`localize-paths`、`media-inventory`（HTML fixture）、`main-column` 规则匹配 |
| 手动测试 | 微信 / 知乎 / CSDN / 无规则博客 / 含直链 video / lazy 长页 |
| 联调测试 | 与 Pro `articleBundleSession` 全链路；验证磁盘 `{assetId}/{title}.md` 与 `./assets/` |

**门禁：** `pnpm run typecheck`、`pnpm run test` 通过。

---

## 8. 实施分期

| 里程碑 | 交付物 | 依赖 Pro |
|--------|--------|----------|
| **E-M1** | 主栏提取 + Turndown + `start/append/finish`（仅 md + thumb） | P-M1 |
| **E-M2** | 主栏媒体下载 + `./assets/` 替换 + `failed_assets` | P-M1 |
| **E-M3** | 站点规则表 + 懒加载预滚动 | P-M2 |
| **E-M4** | 视频直链、并发/重试、与整页 job 互斥 | P-M2 |
| **E-M5** | Board Saver 入口、iframe 视频说明块 | P-M3 可选 |

---

## 9. 验收标准（扩展侧）

- [ ] Popup / 右键可触发，不可注入页有明确提示  
- [ ] 微信公众号：主栏图片在 MD 中为 `./assets/...`（Pro 落盘后离线可读）  
- [ ] CSDN / 知乎：fenced code 保留  
- [ ] 无规则博客：Readability 提取成功  
- [ ] MD 文件名为页标题（sanitize 后）  
- [ ] 缩略图为**页面顶部一屏**（非用户当前滚动位置、非整页长图）  
- [ ] 一次导出仅触发 **一条** Pro finish（不产生 N 次独立 URL 导入）  
- [ ] 主栏提取失败时不产生空资产  
- [ ] `pnpm run typecheck` 与 `pnpm run test` 通过  

---

## 10. 文档与变更清单

| 项 | 说明 |
|----|------|
| 更新 `docs/architecture.md` | 增加 Page Markdown 数据流与模块链接 |
| 更新 `docs/WEB_API.md` | 摘要 + 链接 Pro 规格 |
| 更新 `AGENTS.md` | 可选：测试与模块索引 |
| manifest | 右键菜单项、必要时权限说明 |

---

## 11. 参考

- Pro 端需求：[page-markdown-export-pro-requirements.md](./page-markdown-export-pro-requirements.md)  
- 整页会话参考实现：[fullpage-stitch-session-api-spec.md](./fullpage-stitch-session-api-spec.md)  
- 架构：[architecture.md](./architecture.md)
