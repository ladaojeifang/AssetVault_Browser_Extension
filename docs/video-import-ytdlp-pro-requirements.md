# 作品页视频导入（yt-dlp）— AssetVault Pro 功能开发需求

> **状态**：待开发  
> **读者**：AssetVault Pro 后端 / 主进程 / Web API 维护者  
> **关联扩展需求**：[video-import-ytdlp-extension-requirements.md](./video-import-ytdlp-extension-requirements.md)  
> **API 冻结规格**：[page-video-import-api-spec.md](./page-video-import-api-spec.md)（实现后同步 Pro 仓 OpenAPI 与 `doc/web-api-v1-guide.md`）

---

## 1. 概述

### 1.1 功能名称

**作品页视频导入**（工作名：`pageVideoImport` / `Ytdlp Import`）

### 1.2 用户故事

作为 AssetVault Pro 用户，我希望浏览器扩展只提交一个**视频作品页 URL**（如 YouTube watch、B站 BV 号、抖音视频页），由本机 Pro 使用 **yt-dlp** 自动选择清晰度、合并音视频（如需），将文件写入当前资料库并生成可预览的视频资产；批量提交时由 Pro 排队执行，不阻塞扩展 UI。

### 1.3 业务目标

| 目标 | 说明 |
|------|------|
| 本机解析 | 使用 `ytdlp-nodejs`（或等价 TS 封装）管理 yt-dlp / ffmpeg 二进制 |
| 页面 URL 入库 | 输入为作品页链接，非要求用户自备 CDN 直链 |
| 与直链共存 | 现有 `importFromURL` 对直链仍走 HTTP 下载；自动或显式分流 |
| 可队列 | 多任务并发上限可配置；支持进度与取消 |
| 可维护 | 支持更新 yt-dlp；失败错误码可诊断 |
| 隐私 | 下载与解析均在用户本机完成，不上传 URL 到第三方解析商 |

### 1.4 非目标（本功能不做）

- 在 Pro 内复刻浏览器扩展的 DOM 嗅探、页面注入 Hook
- 替代 yt-dlp 对某站的 extractor（站点失效时通过更新二进制解决）
- 云端代理解析、账号代下载
- 评论/粉丝/字幕云转写（字幕可作为 yt-dlp 可选轨，非 MVP）
- 在扩展进程内执行 yt-dlp

### 1.5 与扩展的分工

扩展负责：作品页 URL 规范化、批量列表、UI、调用本需求 Web API、轮询 job。  
Pro 负责：yt-dlp 调用、临时文件、入库、缩略图、DB、队列、二进制生命周期。

详见 [video-import-ytdlp-extension-requirements.md §2](./video-import-ytdlp-extension-requirements.md)。

---

## 2. 技术方案

### 2.1 依赖选型

| 组件 | 选型 | 说明 |
|------|------|------|
| Node 封装 | **`ytdlp-nodejs`**（或团队指定等价库） | TS 类型、进度回调、`updateYtDlpAsync()` |
| 媒体合并 | **ffmpeg** | 库自带 `downloadFFmpeg()` 或安装包预置 |
| 执行模型 | **子进程**（`child_process` / 库封装） | 禁止阻塞 UI 线程过久 |

**初始化（FR-P-YTDLP-INIT）：**

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-YTDLP-INIT-01 | 首次启动检测二进制 | 缺失则后台下载或提示用户 |
| FR-P-YTDLP-INIT-02 | 路径配置 | 支持 `binaryPath` / `ffmpegPath` 覆盖（高级设置） |
| FR-P-YTDLP-INIT-03 | 版本记录 | `app/info` 返回 `ytdlpVersion`、`ffmpegVersion` |
| FR-P-YTDLP-INIT-04 | 更新 | 提供「检查更新 yt-dlp」入口；API 可选 `POST /system/ytdlp/update` |
| FR-P-YTDLP-INIT-05 | 打包 | Windows 安装包可内嵌二进制，减少首次下载失败 |

### 2.2 URL 分流（FR-P-ROUTER）

`importFromURL` 增强或独立路由：

```text
POST body.url
    │
    ├─ 判定为 direct media（.mp4、.m3u8、googlevideo、bilivideo…）
    │       → 现有 HTTP 下载管线
    │
    └─ 判定为 page URL（youtube watch、bilibili /video、douyin /video…）
            → pageVideoImport job → yt-dlp
```

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-ROUTER-01 | 自动分流 | 默认根据 URL 模式选择管线 |
| FR-P-ROUTER-02 | 强制模式 | 支持 `importMode: 'direct' \| 'ytdlp'` 覆盖（调试） |
| FR-P-ROUTER-03 | 失败不回退云 | 解析失败返回明确错误，不调用外部 API |

### 2.3 yt-dlp 调用约定（FR-P-EXEC）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-EXEC-01 | 默认格式 | `format` 默认 `bv*+ba/b` 或用户设置；支持「仅音频」`bestaudio` |
| FR-P-EXEC-02 | 输出模板 | 临时目录 `{temp}/{jobId}/%(title).%(ext)s` |
| FR-P-EXEC-03 | Cookie | 支持 `cookiesFromBrowser: edge \| chrome \| firefox` |
| FR-P-EXEC-04 | Referer | 从 `sourceMeta.pageUrl` 注入 `--referer` |
| FR-P-EXEC-05 | 超时 | 单 job 硬超时（建议 30–60 min，可配置） |
| FR-P-EXEC-06 | 进度 | 解析 stdout / 库回调 → `progressPercent`、`stage` |
| FR-P-EXEC-07 | 元数据 | 解析完成后读取 title、duration、thumbnail URL |
| FR-P-EXEC-08 | 缩略图 | 优先 yt-dlp 内嵌封面；失败则用 `thumbnail` URL HTTP 拉取 |

**国内站注意：** 抖音、小红书、B站等失败且日志含 login 时，返回 `YTDLP_AUTH_REQUIRED` 并建议 `cookiesFromBrowser: edge`。

---

## 3. 资产模型（FR-P-MODEL）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-MODEL-01 | 资产类型 | `assetType`: `video`（或细分 `video_ytdlp`） |
| FR-P-MODEL-02 | 主文件 | 库内主文件为下载的 mp4/mkv/webm 等 |
| FR-P-MODEL-03 | 缩略图 | 生成 `_thumb.jpg` 或等价 preview |
| FR-P-MODEL-04 | sourceUrl | metadata 写入作品页 URL（`sourceMeta.pageUrl`） |
| FR-P-MODEL-05 | 标题 | 默认 yt-dlp 标题；可被 `sourceMeta.pageTitle` 覆盖或追加 |
| FR-P-MODEL-06 | 删除 | 删除资产时删除主文件 + 缩略图 |
| FR-P-MODEL-07 | 重复策略 | 与现有 `duplicatePolicy` 一致（skip / import_copy / replace） |

---

## 4. Web API 需求

### 4.1 设计原则

- Base：`http://127.0.0.1:41596/api/v1`
- JSend、Token、`LIBRARY_NOT_OPEN` 语义不变
- 长任务采用 **job 模型**（对齐异步导入预期，而非阻塞 HTTP 至下载完成）

### 4.2 API 概览（FR-P-API）

| 方法 | 路径 | 作用 |
|------|------|------|
| `POST` | `/asset/pageVideoImport` | 创建单条导入 job，立即返回 `jobId` |
| `POST` | `/asset/pageVideoImport/batch` | 创建批量 job（或返回 `batchId` + 子 job 列表） |
| `GET` | `/asset/pageVideoImport/jobs/{jobId}` | 查询状态、进度、结果 `assetId` |
| `DELETE` | `/asset/pageVideoImport/jobs/{jobId}` | 取消（杀子进程 + 清理 temp） |
| `GET` | `/app/info` | 增加 `features.pageVideoImport`、`ytdlpVersion` |
| `POST` | `/system/ytdlp/update` | （可选）更新 yt-dlp 二进制 |

OpenAPI tag 建议：`pageVideoImport`。

### 4.3 `POST /asset/pageVideoImport`（FR-P-API-CREATE）

**Request（草案）**

```json
{
  "url": "https://www.youtube.com/watch?v=xxxxx",
  "platform": "youtube",
  "targetFolderId": null,
  "duplicatePolicy": "import_copy",
  "format": "bv*+ba/b",
  "cookiesFromBrowser": "edge",
  "importMode": "auto",
  "sourceMeta": {
    "pageUrl": "https://www.youtube.com/watch?v=xxxxx",
    "pageTitle": "可选",
    "submittedBy": "extension"
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `url` | 是 | 作品页 canonical URL |
| `platform` | 否 | 扩展提示，用于日志与规则；yt-dlp 仍以 URL 为准 |
| `format` | 否 | yt-dlp `-f` 表达式 |
| `cookiesFromBrowser` | 否 | 默认 `edge`（Windows 与扩展一致） |
| `targetFolderId` | 否 | 同现有导入 |
| `duplicatePolicy` | 否 | 同现有导入 |

**Response `data`（草案）**

```json
{
  "jobId": "pvi_abc123",
  "status": "queued",
  "estimatedQueuePosition": 0
}
```

### 4.4 `POST /asset/pageVideoImport/batch`（FR-P-API-BATCH）

**Request（草案）**

```json
{
  "items": [
    { "url": "https://...", "platform": "douyin", "sourceMeta": { "pageTitle": "t1" } },
    { "url": "https://...", "platform": "douyin", "sourceMeta": { "pageTitle": "t2" } }
  ],
  "targetFolderId": null,
  "duplicatePolicy": "import_copy",
  "format": "bv*+ba/b",
  "cookiesFromBrowser": "edge"
}
```

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-BATCH-01 | 上限 | 单次 ≤ 50 条（可配置） |
| FR-P-BATCH-02 | 返回 | `batchId` + `jobIds[]` 或聚合状态 |
| FR-P-BATCH-03 | 失败隔离 | 单条失败不中断其余（除非 `stopOnError: true`） |

### 4.5 `GET .../jobs/{jobId}`（FR-P-API-STATUS）

**Response `data`（草案）**

```json
{
  "jobId": "pvi_abc123",
  "status": "running",
  "stage": "downloading",
  "progressPercent": 42,
  "url": "https://www.youtube.com/watch?v=xxxxx",
  "assetId": null,
  "error": null,
  "warnings": []
}
```

**`status` 枚举：** `queued` | `running` | `completed` | `failed` | `cancelled`

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-STATUS-01 | 完成态 | `completed` 时 `assetId` 非空 |
| FR-P-STATUS-02 | 失败态 | `failed` 时 `error.code` + `message` |
| FR-P-STATUS-03 | 轮询友好 | 扩展 1–2s 轮询；完成/失败后停止 |

### 4.6 `DELETE .../jobs/{jobId}`（FR-P-API-CANCEL）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-CANCEL-01 | 杀进程 | 终止 yt-dlp 子进程 |
| FR-P-CANCEL-02 | 清理 temp | 删除未入库的临时文件 |
| FR-P-CANCEL-03 | 不产生 asset | 已完成的 job 返回 `JOB_ALREADY_COMPLETED` |
| FR-P-CANCEL-04 | 幂等 | 重复 delete 可接受 |

### 4.7 与现有 `importFromURL` 的关系（FR-P-API-LEGACY）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-LEGACY-01 | 兼容 | 直链 URL 行为与现网一致 |
| FR-P-LEGACY-02 | 文档 | `web-api-v1-guide.md` 第 3.6 节增加「作品页 URL」小节 |
| FR-P-LEGACY-03 | OpenAPI | 新 schema 与旧 endpoint 关系写清 |

---

## 5. 任务队列与资源（FR-P-QUEUE）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-QUEUE-01 | 并发 | 全局同时运行 yt-dlp ≤ 2（可配置，默认 1–2） |
| FR-P-QUEUE-02 | 排队 | 超出并发入 FIFO |
| FR-P-QUEUE-03 | 磁盘 | 临时目录默认 `{appData}/AssetVault/temp/ytdlp/{jobId}/` |
| FR-P-QUEUE-04 | 空间检查 | 可用空间不足 → `DISK_FULL` 提前失败 |
| FR-P-QUEUE-05 | 崩溃恢复 | 启动时清理 orphan temp；job 标记 `failed` |

---

## 6. 错误码（FR-P-ERR）

| 错误码 | HTTP | 场景 |
|--------|------|------|
| `PAGE_VIDEO_NOT_SUPPORTED` | 400 | URL 无法识别为支持的作品页 |
| `YTDLP_NOT_INSTALLED` | 503 | 二进制缺失且下载失败 |
| `YTDLP_AUTH_REQUIRED` | 422 | 需登录 / Cookie |
| `YTDLP_EXTRACTOR_FAILED` | 422 | extractor 报错、格式不可用 |
| `YTDLP_DOWNLOAD_FAILED` | 422 | 网络、403、版权 |
| `JOB_NOT_FOUND` | 404 | jobId 无效 |
| `JOB_ALREADY_COMPLETED` | 409 | 取消已完成 job |
| `BATCH_TOO_LARGE` | 400 | 超过条数上限 |
| `DISK_FULL` | 507 | 磁盘不足 |
| `LIBRARY_NOT_OPEN` | 409 | 未打开资料库 |

---

## 7. 库内 UI 与设置（FR-P-UI）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-UI-01 | 设置页 | 默认 `format`、并发数、`cookiesFromBrowser` |
| FR-P-UI-02 | 列表 | 视频资产可播放/Reveal |
| FR-P-UI-03 | 任务中心 | （可选）显示进行中 ytdlp job |
| FR-P-UI-04 | 更新 yt-dlp | 按钮触发 `POST /system/ytdlp/update` |
| FR-P-UI-05 | 失败提示 | 展示 `YTDLP_AUTH_REQUIRED` 操作指引 |

---

## 8. 运维、安全与合规（FR-P-OPS）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-OPS-01 | 日志 | 记录 url（可截断）、platform、jobId、耗时、exit code |
| FR-P-OPS-02 | 能力暴露 | `GET /app/info.features.pageVideoImport: true` |
| FR-P-OPS-03 | 杀毒误报 | Windows 安装说明 yt-dlp 可能被误报 |
| FR-P-OPS-04 | 许可 | 分发包附带 yt-dlp / ffmpeg 许可证说明 |
| FR-P-OPS-05 | 用户责任 | 设置或文档声明：仅下载用户有权保存的内容 |

---

## 9. 文档交付（FR-P-DOC）

| 交付物 | 内容 |
|--------|------|
| `doc/web-api-v1-guide.md` | 新端点、请求体、错误码、job 轮询约定 |
| `doc/web-api-v1-openapi.yaml` | schema：`PageVideoImportJob`、`BatchRequest` |
| 扩展仓 `page-video-import-api-spec.md` | （可选）与扩展联调的冻结版 JSON |
| 用户手册 | 如何开启 Web API、Edge 登录态说明 |

**契约变更时** 同步扩展仓 `docs/WEB_API.md` 摘要。

---

## 10. 测试需求

| 类型 | 范围 |
|------|------|
| 集成测试 | mock yt-dlp 可执行文件；job 状态机 queued→running→completed |
| 手动测试 | YouTube 单条；B站；抖音（Edge 已登录）；取消 job |
| 回归 | 直链 `importFromURL` 图片/MP4 不受影响 |
| 压力 | 批量 20 条排队；并发=1 时顺序完成 |

---

## 11. 实施分期

| 里程碑 | 交付物 | 扩展依赖 |
|--------|--------|----------|
| **P-V1** | ytdlp 初始化 + `POST pageVideoImport` + job GET + 单条入库 | VE-M1 |
| **P-V2** | batch、DELETE cancel、进度、错误码完善 | VE-M2、VE-M3 |
| **P-V3** | `importFromURL` 自动分流、设置页、update yt-dlp | VE-M4 |
| **P-V4** | UI 任务中心、缩略图优化、warnings（部分格式） | 可选 |

---

## 12. 验收标准（Pro 侧）

- [ ] 扩展提交 YouTube watch URL，无需扩展传 CDN，库内出现可播放视频资产  
- [ ] B站 BV 页同上  
- [ ] Edge 已登录抖音时，作品页 URL 可成功或返回明确 `YTDLP_AUTH_REQUIRED`  
- [ ] `GET /app/info` 含 `pageVideoImport` 能力位  
- [ ] 批量 10 条可排队，失败条目不影响其余  
- [ ] `DELETE` 可取消进行中的 job  
- [ ] 直链 `importFromURL` 回归通过  
- [ ] OpenAPI 与 web-api 文档已更新  

---

## 13. 参考

- 扩展端需求：[video-import-ytdlp-extension-requirements.md](./video-import-ytdlp-extension-requirements.md)  
- 扩展 API 摘要：[WEB_API.md](./WEB_API.md)  
- 异步会话参考：[fullpage-stitch-session-api-spec.md](./fullpage-stitch-session-api-spec.md)  
- yt-dlp 上游：https://github.com/yt-dlp/yt-dlp  
- Node 封装示例：https://github.com/iqbal-rashed/ytdlp-nodejs  
