# 作品页视频导入（pageVideoImport）优化与 Bug 修复计划

> **依据**：2026-06 代码走读（以 `src/` 为准，非需求文档为准）  
> **范围**：yt-dlp 作品页导入管线；**不含**「批量视频/GIF 直链扫描 → `batch.html` → `importFromUrl`」  
> **目标**：修真实 Bug、减重复逻辑、对齐文档与实现；不扩大 Pro API 契约

---

## 1. 现状摘要

| 已可用 | 半成品 / 风险 |
|--------|----------------|
| Popup「保存当前页视频」、右键菜单 | Popup 多一次无效 `READ_PAGE_VIDEO_COOKIE_HEADER` |
| URL 规范化（9 平台规则） | Cookie 校验双份（策略表 + `LOGIN_COOKIE_HINTS`） |
| `cookieHeader` + `cookiesFromBrowser: none` | preflight 重复读 Cookie（pairs + fields） |
| Pro 能力探测 + 单 job 轮询 + Toast | `IMPORT_PAGE_VIDEO_BATCH` / `ABORT` 无 UI 调用方 |
| 站点 Cookie 策略（B站/抖音/小红书） | 批量路径无登录 Cookie 校验、无 `platform` |
| | `getPageVideoCapabilities` 的 `proVersion` 永不填充 |
| | 能力探测 GET 成功时 `cachedSupport = false` 语义反直觉 |
| | VE-M3 Board Saver 作品页批量（文档 VE-M3，代码未接） |

---

## 2. 原则

1. **行为不变优先**：单条导入成功路径（B 站已登录）回归通过后再合入结构性重构。
2. **策略单点**：登录 Cookie 规则只维护 `page-video-import-cookie-strategies.ts`。
3. **文档跟代码**：未实现的 FR 从「已实现」改为「计划 / 暂缓」，避免新人按文档找 UI。
4. **Pro 契约**：仅当实测需要时，在 Pro 仓库同步 `cookieHeader` / 错误码；扩展侧不恢复 `cookiesFromBrowser: edge|chrome`。

---

## 3. 阶段与优先级

```text
P0  Bug + Cookie/预检收敛     ← 先合（用户可见失败）
P1  UX/探测/死代码/文档       ← 第二批
P2  批量 + Board Saver VE-M3  ← 产品确认后排期
P3  增强（取消 UI、TikTok 短链等）← 可选
```

---

## 4. P0 — Bug 修复与 Cookie/预检收敛

### 4.1 合并 Cookie 登录校验（Bug：双源不一致）

| 项 | 内容 |
|----|------|
| **问题** | `validatePageVideoCookies` 使用 `LOGIN_COOKIE_HINTS` 正则；策略表已有 `hasLoginCookies`。改 B 站规则需改两处。 |
| **改动** | 删除 `page-video-import.ts` 中 `LOGIN_COOKIE_HINTS`；`validatePageVideoCookies` 仅调用 `hasPlatformLoginCookies(platform, cookiePairs)`，header 存在时用 `hasPlatformLoginCookies(platform, parseCookieHeader(header))` 或策略内统一解析。 |
| **文件** | `src/background/page-video-import.ts` |
| **验收** | `tests/page-video-import-cookies.test.ts` / 策略测试仍通过；B 站仅有 `buvid3` 仍报「未检测到登录 Cookie」。 |

### 4.2 preflight 只解析一次 Cookie（Bug：重复 IO）

| 项 | 内容 |
|----|------|
| **问题** | `preflightPageVideoImport` 先后调用 `readPageVideoCookiePairs` 与 `resolvePageVideoCookieFields`，后者再次读 Chrome。 |
| **改动** | preflight 内：`pairs = await readPageVideoCookiePairs(...)` → `cookieFields = pairsToFields(pairs)`（或 `formatCookieHeader` + `{ cookiesFromBrowser: 'none', cookieHeader }`）；**不再**二次 `resolvePageVideoCookieFields` 触发读取。 |
| **文件** | `src/background/page-video-import.ts`，必要时在 `page-video-import-cookie-strategies.ts` 导出 `pairsToCookieFields` 小函数。 |
| **验收** | 单测 mock `getCookies` 调用次数为 1；Edge 真机 B 站导入仍带 `SESSDATA`。 |

### 4.3 登录失败文案按平台生成（Bug：硬编码 B 站）

| 项 | 内容 |
|----|------|
| **问题** | 读不到 Cookie 时固定提示「B 站视频页」，抖音/小红书误导读。 |
| **改动** | 在策略表或 `page-video-import-errors.ts` 增加 `platformDisplayName(platform)`；空 Cookie 提示用 `当前站点` + 平台名。 |
| **验收** | 三站空 Cookie 提示含对应站名，不含错误站名。 |

### 4.4 Popup 去掉冗余 `READ_PAGE_VIDEO_COOKIE_HEADER`（性能/复杂度）

| 项 | 内容 |
|----|------|
| **问题** | Popup 先 READ_COOKIE 再 IMPORT；preflight 已读 Cookie，READ 结果未单独用于失败提示。 |
| **改动** | Popup 仅发 `IMPORT_PAGE_VIDEO`（保留 `ensureHostPermissionForTab`）；删除或保留 SW 消息仅作调试（建议删除调用，保留 handler 一版 deprecated 注释后删）。 |
| **文件** | `src/popup/popup.ts`，`src/background/service-worker.ts`，`src/shared/messages.ts` |
| **验收** | Network/SW 日志：点击导入仅 1 次 Cookie 读取路径；失败仍 `alert(resp.error)`。 |

### 4.5 能力探测语义加固（潜在 Bug）

| 项 | 内容 |
|----|------|
| **问题** | `supportsPageVideoImportApi`：探针 GET **成功** → `cachedSupport = false`，依赖「探针 job 必不存在」。 |
| **改动** | GET 成功时解析 body：若含 `jobId` 且 status 合法 → 视为 API 存在（`true`）；仅当明确 404 路由不存在 → `false`；其余 inconclusive 不缓存或缓存短 TTL。补充注释对齐 `page-video-import-api-spec.md` 探针约定。 |
| **文件** | `src/shared/page-video-import-api.ts`，`src/shared/page-video-import-core.ts` |
| **验收** | 单测：模拟 GET 200 + `JOB_NOT_FOUND` 与 GET 404 两种响应；旧 Pro（无 features）行为与现网一致。 |
| **不确定** | 需对照 Pro 实际 JSend 形态（本仓库无 Pro 源码时用 curl/集成测确认）。 |

---

## 5. P1 — 体验、类型与文档对齐

### 5.1 填充或删除 `proVersion` / `ytdlpVersion`

| 项 | 内容 |
|----|------|
| **问题** | `getPageVideoCapabilitiesForTab` 未返回 `proVersion`；`PageVideoCapabilities` 类型有字段未用。 |
| **改动** | `pingApp()` 结果映射 `app.version` → `proVersion`；可选 `ytdlp.version` → `ytdlpVersion`（若 `app/info` 有）。Popup hint 可展示。 |
| **文件** | `src/background/page-video-import.ts`，`src/popup/popup.ts` |

### 5.2 删除或标注运行时死代码

| 项 | 内容 |
|----|------|
| **候选** | `detectPageVideoCookiesBrowser`（扩展路径恒 `none`）、未使用的 `VideoPlatform 'generic'`、孤儿消息类型（若删除 READ_COOKIE）。 |
| **改动** | 若 Pro 永不需要扩展传 browser：删除 export 或移至 `// @deprecated` 注释块仅留测试；`generic` 从类型移除或注明 reserved。 |
| **验收** | `pnpm run typecheck` + `pnpm run test` 通过。 |

### 5.3 格式化 `page-video-import-api.ts`

| 项 | 内容 |
|----|------|
| **问题** | 双空行风格与仓库不一致，diff 噪音大。 |
| **改动** | 仅格式化该文件（无逻辑变更）。 |

### 5.4 同步扩展需求文档状态

| 项 | 内容 |
|----|------|
| **文件** | `docs/video-import-ytdlp-extension-requirements.md` |
| **改动** | 顶部状态：M1/M2 完成项列表；VE-M3 / `IMPORT_PAGE_VIDEO_ABORT` / batch UI 标为 **未实现**；区分「作品页 yt-dlp」与「直链 batchVideoSave」。 |
| **文件** | `docs/architecture.md` 增加一小节「作品页视频导入」数据流（SW → pageVideoImport API）。 |

### 5.5 `PAGE_VIDEO_CONTEXT` 兜底评估

| 项 | 内容 |
|----|------|
| **问题** | content 与 tab.url 同函数，价值低。 |
| **选项 A** | 保留（低成本，SPA tab.url 滞后时仍有用）。 |
| **选项 B** | 删除消息与 `resolveContextForTab` 分支，仅 `tab.url`。 |
| **建议** | P1 做 **选项 A**；若 telemetry 证明从未命中再删。 |

---

## 6. P2 — 批量导入与 Board Saver（VE-M3）

> **前置**：产品确认是否本季度做；Pro `POST .../batch` 与 `maxBatchItems` 已上线。

### 6.1 统一批量 preflight

| 项 | 内容 |
|----|------|
| **问题** | `orchestratePageVideoImportBatch` 无 `validatePageVideoCookies`、Cookie 读取无 `platform`。 |
| **改动** | 每项 `resolveVideoPageContext` → `readPageVideoCookiePairs({ platform })` → 校验；失败项跳过或整批失败（产品定）。 |
| **文件** | `src/background/page-video-import.ts` |

### 6.2 Board Saver 发现 `video_page` 卡片

| 项 | 内容 |
|----|------|
| **需求** | FR-VE-UI-03（见 extension requirements） |
| **改动** | 扫描/分类增加 `video_page`；多选后 `IMPORT_PAGE_VIDEO_BATCH`；进度 Toast 与单条一致。 |
| **文件** | `src/board-saver/*` 或 `src/content/*`，`service-worker.ts` |
| **验收** | Pinterest/小红书等页不破坏原图片批量；B 站视频页可勾选 ≥2 个作品 URL 批量提交。 |

### 6.3 批量轮询限流

| 项 | 内容 |
|----|------|
| **文档** | spec：并行 poll ≤ 4 |
| **改动** | `orchestratePageVideoImportBatch` 用 `ConcurrencyQueue(4)` 或顺序 poll（与 spec 对齐）。 |

---

## 7. P3 — 可选增强

| ID | 项 | 说明 |
|----|-----|------|
| P3-1 | 取消任务 UI | Popup 导入中显示「取消」→ `IMPORT_PAGE_VIDEO_ABORT`；维护当前 tab 的 `jobId`。 |
| P3-2 | TikTok 短链 | `vm.tiktok.com` 扩展侧 follow redirect 或交给 Pro；需验证 yt-dlp 是否已支持。 |
| P3-3 | `readPlatformCookies` | 仅当某站 generic 读取仍失败时实现（如 iframe 隔离站）。 |
| P3-4 | poll 超时策略 | `PAGE_VIDEO_POLL_TIMEOUT_MS` 按 `stage` 或 job 大小分级（需 Pro 字段）。 |
| P3-5 | 集成测试脚本 | `scripts/probe-page-video-import.mjs`：ping → create → poll（需本机 Pro）。 |

---

## 8. 不在本计划内

- **直链视频/GIF 扫描**（`batchVideoSave` / `importFromUrl`）重构。
- **恢复** `cookiesFromBrowser: edge|chrome` 作为主路径（已明确放弃，避免 `YTDLP_COOKIE_COPY_FAILED`）。
- **Pro 侧** yt-dlp 升级、队列架构（另见 `video-import-ytdlp-pro-requirements.md`）。

---

## 9. 测试与回归清单

每阶段合并前：

```text
pnpm run typecheck
pnpm run test
pnpm run build
```

手动（Edge/Chrome，本机 Pro `pageVideoImport: true`）：

| # | 场景 | 期望 |
|---|------|------|
| 1 | B 站已登录视频页 → Popup 导入 | Toast 提交成功 → 完成/失败有中文；Network `POST pageVideoImport` 含 `cookieHeader`、`cookiesFromBrowser: none` |
| 2 | B 站未登录 | preflight 失败，alert/Toast 含登录提示（非仅 B 站硬编码若已修 4.3） |
| 3 | YouTube 观看页 | 不要求 Cookie，可提交 job |
| 4 | 非视频页 | 按钮禁用或 `PAGE_VIDEO_NOT_SUPPORTED` |
| 5 | Pro 关闭 / 无 feature | 入口禁用或 `PRO_FEATURE_UNAVAILABLE` |
| 6 | 右键「保存视频到 AssetVault Pro」 | 与 Popup 行为一致 |
| 7 | 扩展重载后 | manifest `host_permissions` + cookies 权限仍生效 |

建议补充单测：

- `validatePageVideoCookies` 仅用策略表（4.1 后）
- `supportsPageVideoImportApi` 探针响应分支（4.5）
- preflight mock 断言 `getCookies` 调用 1 次（4.2）

---

## 10. 排期建议（人日粗估）

| 阶段 | 内容 | 估时 |
|------|------|------|
| **P0** | 4.1–4.4 | 1–1.5 d |
| **P0** | 4.5 + Pro 联调确认 | 0.5–1 d |
| **P1** | 5.1–5.4 | 1 d |
| **P2** | VE-M3 批量 + Board Saver | 3–5 d（视 UI 范围） |
| **P3** | 按需 | — |

**推荐合并顺序**：P0 一个 PR → P1 文档+清理一个 PR → P2 独立 feature PR。

---

## 11. 风险与依赖

| 风险 | 缓解 |
|------|------|
| Edge `chrome.cookies` 仍偶发空 | P0 后仍失败则实现 P3-3 或 content 辅助探测（不能替代 HttpOnly） |
| Pro 未接受 `cookieHeader` | 导入前用 curl 对照 `page-video-import-api-spec.md` 请求体 |
| 删 READ_COOKIE 消息 | 确认无外部脚本依赖该 message type |
| Board Saver 范围大 | P2 单独立项，不与其他 P0 混 PR |

---

## 12. 完成定义（Definition of Done）

- [x] P0 全部验收项通过，B 站回归无回退（2026-06-03 代码合入）
- [x] Cookie/登录规则仅存在于 `page-video-import-cookie-strategies.ts`（`validatePageVideoCookies` 只调策略表）
- [x] 需求文档状态与代码一致
- [x] `architecture.md` 含 pageVideoImport 数据流
- [x] P2：Board Saver `video_page` + `IMPORT_PAGE_VIDEO_BATCH`；批量 poll `ConcurrencyQueue(4)`
- [x] P3-1：单条导入 Toast「取消」→ `IMPORT_PAGE_VIDEO_ABORT`

---

*文档版本：2026-06-03 · 维护者：扩展仓库*
