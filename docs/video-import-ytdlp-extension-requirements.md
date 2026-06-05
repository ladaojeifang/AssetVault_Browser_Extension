# 作品页视频导入（yt-dlp）— 浏览器扩展功能开发需求

> **状态**：M1/M2/M3/M4 已实现（含 batch.html 粘贴作品 URL、TikTok vm 短链重定向解析）；**未实现**：FR-VE-UI-07 格式预设  
> **与直链区分**：Popup「批量视频/GIF」走 `importFromURL` 深扫，**不是**本功能的 `pageVideoImport`  
> **读者**：AssetVault Browser Extension 开发  
> **关联 Pro 规格**：[video-import-ytdlp-pro-requirements.md](./video-import-ytdlp-pro-requirements.md)  
> **API 冻结规格**：[page-video-import-api-spec.md](./page-video-import-api-spec.md)  
> **原则**：扩展**不**嵌入 yt-dlp；只采集/提交**作品页 canonical URL**，由本机 Pro 用 `ytdlp-nodejs` 解析下载并入库。

---

## 1. 概述

### 1.1 功能名称

**保存作品页视频到资料库**（工作名：`Page Video Import` / `Ytdlp Page Import`）

### 1.2 用户故事

作为资料库用户，我在 YouTube、Bilibili、抖音等站点打开某个**视频/笔记作品页**后，希望一键把该作品保存到 AssetVault Pro 资料库（含合适清晰度与音轨），而无需扩展去解析 m3u8 或平台私有 CDN；批量浏览博主主页/列表时，希望勾选多个作品链接后排队导入。

### 1.3 业务目标

| 目标 | 说明 |
|------|------|
| 提交页面 URL | 向 Pro 传递**作品页链接**（非 CDN 直链为主路径） |
| 规范化链接 | 去掉 tracking 参数、统一短链/移动端 URL |
| 元数据附带 | `pageTitle`、`sourceUrl`（当前 tab）、可选 `referer` |
| 体验一致 | 默认文件夹、重复策略、Token、Toast、API 连通性与现有导入一致 |
| 批量可队列 | 多链接走 Pro 任务队列，扩展展示进度/失败项 |
| 与直链共存 | 已解析出的 `direct_file` / 图片仍走现有 `importFromURL` |

### 1.4 非目标（本功能不做）

- 在扩展内运行 yt-dlp、FFmpeg 或下载完整视频文件
- 页面 MAIN 世界 Hook 平台 API（抖音 aweme、FB GraphQL 等）作为**主路径**
- 依赖第三方云端解析服务（如 datatool 类 API）
- 在扩展内合并 HLS 分片（m3u8 → mp4）
- 评论/粉丝/地图等非视频资产爬取
- Pro 未启动时的「静默降级为 chrome.downloads 落盘」（可选 P5，非 MVP）

### 1.5 对 Pro 的依赖

| 依赖项 | 说明 |
|--------|------|
| **硬依赖** | Pro 实现 `pageVideoImport` 或扩展后的 `importFromURL`（见 Pro 需求文档） |
| **能力检测** | `GET /app/info` 暴露 feature，如 `pageVideoImport: true`、`ytdlpVersion` |
| **未就绪行为** | Toast 提示需升级 Pro；**不**假装成功；可保留「复制链接」兜底 |
| **Cookie** | 国内站失败时，提示用户在 Edge/Chrome 登录后由 Pro 使用 `--cookies-from-browser` |
| **联调版本** | 扩展 PR 标注最低 Pro 版本 |

---

## 2. 职责边界

```text
浏览器扩展（本文档范围）              AssetVault Pro（另文档）
────────────────────────────────────────────────────────────
识别当前页是否为「作品页」              —
canonical URL 规范化                    —
单条/批量 URL 列表、标题预览            —
调用 Web API 创建导入任务               yt-dlp 子进程、选格式、落盘
进度轮询 / 取消 job                     写入资料库、缩略图、metadata
Toast、右键/Popup/Board Saver UI        二进制管理、更新 yt-dlp
```

**与现有「深度视频探测」关系：**

| 路径 | 何时使用 |
|------|----------|
| **作品页 → Pro yt-dlp**（本功能） | URL 为 watch/video/note 等页面链接；用户点「保存视频到资料库」 |
| **直链 → importFromURL**（已有） | 已得到 `googlevideo`、`bilivideo`、`.mp4` 等；Board Saver / 探测列表 |
| **页面探测**（已有，弱化） | Pro 不支持或用户关闭 ytdlp 时，可作为补充展示候选直链 |

---

## 3. 功能需求

### 3.1 用户入口（FR-VE-UI）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-VE-UI-01 | Popup「保存当前页视频」 | 当前 tab URL 经判定为支持的作品页时可点；否则禁用并说明 |
| FR-VE-UI-02 | 右键菜单「保存视频到 AssetVault Pro」 | `contexts: ['page', 'video', 'link']`；链接上下文时对 `linkUrl` 规范化 |
| FR-VE-UI-03 | Board Saver 面板 | 增加「视频作品」筛选；卡片类型 `video_page`；支持多选批量提交 |
| FR-VE-UI-04 | （可选）批量页 `batch.html` | 粘贴多行 URL 提交队列（与 Popup 共用 API 客户端） |
| FR-VE-UI-05 | 长任务反馈 | Toast：已提交 / 下载中 / 完成 / 失败；显示 Pro 返回的 `jobId` 或资产标题 |
| FR-VE-UI-06 | 取消 | 对进行中的 job 调 Pro `DELETE`；Toast「已取消」 |
| FR-VE-UI-07 | 设置项 | 可选默认格式预设（如「最佳」「1080p」「仅音频」）映射到 Pro `format` 字段 |

### 3.2 作品页识别与 URL 规范化（FR-VE-URL）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-VE-URL-01 | 平台检测 | 基于 `location.hostname` + `pathname` 判断 `platform` |
| FR-VE-URL-02 | canonical 提取 | 每平台规则产出稳定 `pageUrl`（见 §3.2.1） |
| FR-VE-URL-03 | 去追踪参数 | 删除 `utm_*`、`share_id` 等不影响资源的 query（平台相关白名单） |
| FR-VE-URL-04 | 非作品页 | 首页、搜索列表、个人主页（仅列表无单条）返回 `NOT_A_VIDEO_PAGE` |
| FR-VE-URL-05 | 嵌入页 | iframe 内视频：优先父页 URL；否则提示打开作品页 |
| FR-VE-URL-06 | 链接右键 | `info.linkUrl` 若为作品页短链，规范化后再提交 |

#### 3.2.1 首批支持 URL 模式（MVP）

| platform | 匹配要点 | canonical 示例 |
|----------|----------|----------------|
| `youtube` | `watch?v=`、`youtu.be/`、`/shorts/` | `https://www.youtube.com/watch?v={id}` |
| `bilibili` | `/video/BV`、`/video/av` | `https://www.bilibili.com/video/{bvid}` |
| `douyin` | `/video/`、`modal_id` | `https://www.douyin.com/video/{id}` |
| `xiaohongshu` | `/explore/`、`/discovery/item/` | 稳定笔记 id URL |
| `tiktok` | `/@user/video/`、`vm.tiktok.com` | 解析后标准作品 URL |
| `twitter` | `/status/` | `https://x.com/i/status/{id}` |
| `instagram` | `/p/`、`/reel/` | permalink |
| `vimeo` | `vimeo.com/{id}` | 标准 watch URL |
| `kuaishou` | `/short-video/`、`/fw/photo/` | 平台规则表维护 |

规则表放 `src/shared/video-page-url-rules.ts`（纯函数，可单测）。

### 3.3 列表页批量发现（FR-VE-DISCOVER）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-VE-DISCOVER-01 | 列表扫描 | 在用户主页/搜索/发现页，从 `a[href]` 匹配作品 URL 模式 |
| FR-VE-DISCOVER-02 | 懒加载 | 复用 `AutoScrollEngine` + `board-saver-lazy-scroll` 加载更多卡片 |
| FR-VE-DISCOVER-03 | 去重 | 同 canonical URL 只保留一条 |
| FR-VE-DISCOVER-04 | 上限 | 单次批量默认 ≤ 50（可配置）；超出提示拆分 |
| FR-VE-DISCOVER-05 | 不解析 CDN | 批量项仅含 `pageUrl` + 可选卡片标题/封面图 URL（封面仍走图片 import 可选） |

### 3.4 与 Pro 通信（FR-VE-API）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-VE-API-01 | 客户端 | `src/shared/page-video-import-api.ts` |
| FR-VE-API-02 | 创建任务 | `POST` Pro 端点（见 Pro 文档）；body 含 `url`、`platform?`、`format?`、`cookiesFromBrowser?` |
| FR-VE-API-03 | 批量 | `POST .../batch` 或多次 `create` + 同一 `batchId`（与 Pro 约定一种） |
| FR-VE-API-04 | 偏好 | `targetFolderId`、`duplicatePolicy` 来自 `getPreferences()` |
| FR-VE-API-05 | 元数据 | `sourceMeta: { pageUrl, pageTitle, submittedAt }` |
| FR-VE-API-06 | 进度 | `GET .../jobs/{jobId}` 轮询或 SW 订阅；间隔 1–2s，完成停止 |
| FR-VE-API-07 | 取消 | `DELETE .../jobs/{jobId}` |
| FR-VE-API-08 | 能力检测 | 启动前读 `app/info.features.pageVideoImport`；false 时禁用入口 |
| FR-VE-API-09 | 错误映射 | Pro 错误码 → 用户中文文案（见 §6） |

**请求体草案（扩展 → Pro）：**

```json
{
  "url": "https://www.youtube.com/watch?v=xxxxx",
  "platform": "youtube",
  "targetFolderId": null,
  "duplicatePolicy": "import_copy",
  "format": "bv*+ba/b",
  "cookiesFromBrowser": "edge",
  "sourceMeta": {
    "pageUrl": "https://www.youtube.com/watch?v=xxxxx",
    "pageTitle": "页面标题",
    "tabId": 123
  }
}
```

### 3.5 消息与编排（FR-VE-MSG）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-VE-MSG-01 | `IMPORT_PAGE_VIDEO` | Popup/菜单 → SW：规范化 URL → 创建 job → 轮询 |
| FR-VE-MSG-02 | `IMPORT_PAGE_VIDEO_BATCH` | Board Saver / batch 页 → 项列表 → Pro batch |
| FR-VE-MSG-03 | `IMPORT_PAGE_VIDEO_ABORT` | 取消指定 `jobId` |
| FR-VE-MSG-04 | `GET_PAGE_VIDEO_CAPABILITIES` | Popup 打开时查询 Pro feature + 当前页是否作品页 |
| FR-VE-MSG-05 | 并发 | 同一 tab 可多 job；全局提交速率限流（如同时轮询 ≤ 8） |
| FR-VE-MSG-06 | 与整页截图 / Markdown 导出 | 互斥或共享「长任务占用」提示（实现一种即可） |

### 3.6 与现有导入的关系（FR-VE-COEXIST）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-VE-COEXIST-01 | 图片 Board Saver | 行为不变；新增 `kind: 'video_page'` 卡片 |
| FR-VE-COEXIST-02 | `IMPORT_MEDIA_CANDIDATE_BATCH` | 保留；直链视频仍批量提交 `importFromURL` |
| FR-VE-COEXIST-03 | 探测 UI 文案 | 有 Pro ytdlp 时，优先引导「保存作品页」；直链作为「高级/备用」 |
| FR-VE-COEXIST-04 | `headers` / Referer | 作品页路径**不**要求扩展传 CDN headers；直链路径仍可传 |

---

## 4. 模块与文件规划

```text
src/
  shared/
    video-page-url-rules.ts      # 平台判定 + canonicalize
    page-video-import-api.ts     # Pro API 封装
    page-video-import-types.ts   # JobStatus、错误码
    messages.ts                  # 新增消息类型常量
  background/
    page-video-import.ts         # SW 编排：create / poll / abort
  content/
    page-video-context.ts        # 当前页判定、供 SCAN 消息
  board-saver/
    board-saver-scan-collect.ts  # 扩展：列表页作品链接
    board-saver-panel.ts         # UI：视频页签/批量按钮
  popup/
    ...                          # 入口按钮 + 能力检测
```

**复用：**

| 现有模块 | 用途 |
|----------|------|
| `getPreferences` / `api.ts` | Token、文件夹、重复策略 |
| `ConcurrencyQueue` | 批量提交限流 |
| `auto-scroll-engine.ts` | 列表懒加载 |
| `board-saver-page-detection.ts` | 列表/详情页分类 |
| `collect-meta-core` / `sanitize` | 文件名安全（若展示用） |
| `tab-messaging.ts` | 注入 content 判定作品页 |

**不建议在本功能中扩展：**

- `stream-detector.ts` 大规模站点 Hook（除非 Pro 不可用时的 fallback 里程碑）

---

## 5. 权限与 manifest

| 项 | 说明 |
|----|------|
| `host_permissions` | 保持现有 `optional_host_permissions`；用户批量导入某站时需授权 |
| `contextMenus` | 新增「保存视频到 AssetVault Pro」 |
| `web_accessible_resources` | 本功能 **不需要** 新增 injected sniffer |

---

## 6. 错误处理

| Pro / 扩展码 | 用户文案（示例） |
|--------------|------------------|
| `PAGE_VIDEO_NOT_SUPPORTED` | 当前页面不是支持的视频作品页 |
| `PRO_FEATURE_UNAVAILABLE` | 请升级 AssetVault Pro 以使用作品页视频导入 |
| `YTDLP_AUTH_REQUIRED` | 请在 Edge 中登录该网站后重试 |
| `YTDLP_EXTRACTOR_FAILED` | 解析失败，请更新 Pro 或稍后重试 |
| `YTDLP_DOWNLOAD_FAILED` | 下载失败（网络或版权限制） |
| `JOB_CANCELLED` | 已取消 |
| `LIBRARY_NOT_OPEN` | 请先在 Pro 中打开资料库 |
| `DUPLICATE_ASSET` | 按重复策略跳过或已创建副本 |

---

## 7. 测试需求

| 类型 | 范围 |
|------|------|
| 单元测试 | `video-page-url-rules`：各平台 URL 规范化 fixture |
| 单元测试 | API 客户端 mock JSend 响应 |
| 手动测试 | YouTube / B站单条；抖音登录态；列表页批量 10 条 |
| 联调测试 | Pro job 全链路 → 库内出现可播放视频资产 |

**门禁：** `pnpm run typecheck`、`pnpm run test` 通过。

---

## 8. 实施分期

| 里程碑 | 交付物 | 依赖 Pro |
|--------|--------|----------|
| **VE-M1** | URL 规则 + `IMPORT_PAGE_VIDEO` + Popup/右键 | P-V1 |
| **VE-M2** | job 轮询、取消、错误文案 | P-V1 |
| **VE-M3** | Board Saver 列表发现 + 批量 | P-V2 |
| **VE-M4** | 格式预设、cookies 提示、batch.html | P-V2 |
| **VE-M5** | （可选）Pro 不可用时的直链探测降级提示 | — |

---

## 9. 验收标准（扩展侧）

- [ ] YouTube 作品页一键提交后，Pro 完成入库（扩展侧仅传 URL）  
- [ ] B站作品页同上  
- [ ] 非作品页按钮禁用且有说明  
- [ ] Pro `pageVideoImport: false` 时入口禁用并提示升级  
- [ ] 批量 10 条作品 URL 可提交并看到进度/失败汇总  
- [ ] 现有图片 Board Saver 与直链视频导入不受影响  
- [ ] `pnpm run typecheck` 与 `pnpm run test` 通过  

---

## 10. 文档与变更清单

| 项 | 说明 |
|----|------|
| 更新 `docs/architecture.md` | 增加 Page Video Import 数据流 |
| 更新 `docs/WEB_API.md` | 摘要 + 链接 Pro 规格 |
| 更新 `AGENTS.md` | 模块索引（可选） |
| `src/manifest.json` | 右键菜单项 |

---

## 11. 参考

- API 冻结规格：[page-video-import-api-spec.md](./page-video-import-api-spec.md)  
- Pro 端需求：[video-import-ytdlp-pro-requirements.md](./video-import-ytdlp-pro-requirements.md)  
- 现有 API：[WEB_API.md](./WEB_API.md)  
- 架构：[architecture.md](./architecture.md)  
- 会话式导入参考：[fullpage-stitch-session-api-spec.md](./fullpage-stitch-session-api-spec.md)
