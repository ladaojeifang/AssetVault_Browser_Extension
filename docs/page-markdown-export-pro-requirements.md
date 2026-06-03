# 网页保存为 Markdown — AssetVault Pro 功能开发需求

> **状态**：待开发  
> **读者**：AssetVault Pro 后端 / 主进程 / Web API 维护者  
> **关联扩展需求**：[page-markdown-export-extension-requirements.md](./page-markdown-export-extension-requirements.md)  
> **实现后建议**：在本仓或 Pro 仓补充 OpenAPI 级规格 `article-bundle-session-api-spec.md`（对齐 [fullpage-stitch-session-api-spec.md](./fullpage-stitch-session-api-spec.md)）

---

## 1. 概述

### 1.1 功能名称

**Markdown 资料包导入**（工作名：`articleBundle` / `Article Bundle Session`）

### 1.2 用户故事

作为 AssetVault Pro 用户，我希望浏览器扩展将「一篇网页」保存为**单个资料库条目**：条目对应磁盘上一个 `assetId` 目录，内含以**页标题命名**的 Markdown 文件、页面顶部视口缩略图、以及 `assets/` 子目录中的图片/视频；在资源管理器或 Pro 内打开 Markdown 时，相对路径 `./assets/...` 有效。

### 1.3 业务目标

| 目标 | 说明 |
|------|------|
| 单资产 | 一次导入产生 **1 个** `assetId`，非 N 个独立图片资产 |
| 目录即包 | `{storageRoot}/{assetId}/` 存放 md、thumb、`assets/**` |
| 离线可读 | MD 内相对路径与磁盘布局一致 |
| 列表预览 | `_thumb.jpg` 作为该资产在库内的缩略图/预览 |
| 原子性 | 失败不残留半成品资产或孤儿目录 |
| 可扩展 | 大包（多图、视频）采用会话式 append，对齐 `fullPageSession` |

### 1.4 非目标（本功能不做）

- 在 Pro 内实现 HTML 解析、Readability、Turndown（由扩展完成）
- 将 `assets/` 下每个文件默认注册为独立可搜索资产（避免资料库刷屏）
- 替代扩展去抓取需登录且未打开的标签页 URL
- 内嵌 Markdown 渲染器（可作为后续版本 P5）

### 1.5 与扩展的分工

扩展负责：主栏提取、MD 草稿、媒体下载到临时路径、页面顶部单帧截图。  
Pro 负责：会话目录校验、原子写入 `{assetId}/`、DB 注册、缩略图绑定、清理、错误码。

详见 [page-markdown-export-extension-requirements.md §2](./page-markdown-export-extension-requirements.md)。

---

## 2. 存储与资产模型

### 2.1 目录布局（规范）

导入成功后，资料库内**必须**符合：

```text
{libraryStorage}/{assetId}/
├── {sanitizedTitle}.md      # 主文档；文件名由扩展传入，= 页标题 sanitize
├── _thumb.jpg                 # 页面顶部一屏缩略图（库 UI 预览）
├── assets/
│   ├── img-001.jpg
│   ├── img-002.webp
│   └── vid-001.mp4
└── meta.json                  # 可选；扩展传入则写入
```

### 2.2 相对路径规则

- Markdown 文件与 `assets/` **同级**（均在 `{assetId}/` 下）。
- MD 内引用形式：`./assets/img-001.jpg`。
- Pro 打开/导出时不改写相对路径。

### 2.3 资产类型（FR-P-MODEL）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-MODEL-01 | 类型标识 | 新增 `assetType`（或等价字段）：如 `markdown_bundle` / `article` |
| FR-P-MODEL-02 | 主文件 | 库内「主文件」指向 `{sanitizedTitle}.md` |
| FR-P-MODEL-03 | 子文件 | `assets/**` 标记为从属文件（`childOf` / `bundlePart` / 不入主列表） |
| FR-P-MODEL-04 | 缩略图 | `_thumb.jpg` 映射到现有 thumbnail/preview 管线 |
| FR-P-MODEL-05 | sourceUrl | 写入资产 metadata（来自 `sourceMeta.pageUrl`） |
| FR-P-MODEL-06 | 删除 | 删除主资产时**递归**删除整个 `{assetId}/` 目录 |
| FR-P-MODEL-07 | 重命名冲突 | 同文件夹下 `{title}.md` 冲突：自动后缀 `(2)` 或返回 `DUPLICATE_FILENAME`（与扩展约定一种） |

---

## 3. Web API 需求

### 3.1 设计原则

与现有 `fullPageSession` 对齐：

- Base：`http://127.0.0.1:41596/api/v1`
- JSend 响应、Token 鉴权、`LIBRARY_NOT_OPEN` 等错误语义不变
- **方案 B（推荐）**：会话式 `start` → `append` → `finish` / `abort`，避免单次 JSON/multipart 过大
- **方案 A（可选）**：小包容器 `POST /asset/importArticleBundle`（multipart），上限明确（如 ≤ 50MB）

以下按 **方案 B** 描述；若 Pro 仅实现方案 A，需在 OpenAPI 中标注扩展最低适配版本。

### 3.2 API 概览（FR-P-API）

| 方法 | 路径 | 作用 |
|------|------|------|
| `POST` | `/asset/articleBundleSession/start` | 创建会话，返回 `sessionId`、`tempDir`、limits |
| `POST` | `/asset/articleBundleSession/append` | 登记一个本地文件（md / thumb / assets/*） |
| `POST` | `/asset/articleBundleSession/finish` | 原子写入 `{assetId}/` 并注册单资产 |
| `DELETE` | `/asset/articleBundleSession/{sessionId}` | 取消并删除临时目录 |
| `GET` | `/asset/articleBundleSession/{sessionId}` | （可选）查询已 append 文件列表/字节数 |

OpenAPI tag 建议：`articleBundleSession`。

### 3.3 `POST .../start`（FR-P-API-START）

**Request（草案）**

```json
{
  "output": {
    "markdownFilename": "页面标题.md",
    "targetFolderId": null,
    "duplicatePolicy": "import_copy"
  },
  "sourceMeta": {
    "pageUrl": "https://example.com/post/1",
    "pageTitle": "页面标题"
  },
  "options": {
    "sessionTtlSeconds": 3600,
    "maxSessionBytes": 524288000,
    "maxSingleFileBytes": 104857600,
    "maxAssetFiles": 500
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `output.markdownFilename` | string | 是 | 最终 md 文件名；须 `.md` 且通过路径安全校验 |
| `output.targetFolderId` | string \| null | 否 | 目标文件夹 UUID |
| `output.duplicatePolicy` | string | 否 | `import_copy` / `use_existing` |
| `sourceMeta.pageUrl` | string | 否 | 写入 `sourceUrl`（http/https） |
| `sourceMeta.pageTitle` | string | 否 | 可写入 `notes` 或 metadata |
| `options.sessionTtlSeconds` | number | 否 | 空闲过期，默认 3600 |
| `options.maxSessionBytes` | number | 否 | 会话总字节上限 |
| `options.maxSingleFileBytes` | number | 否 | 单文件上限（含视频） |
| `options.maxAssetFiles` | number | 否 | `assets/` 下文件数上限 |

**Response `data`（草案）**

```json
{
  "sessionId": "ab_8f3c2a1b-4e5d-6f7a-8b9c-0d1e2f3a4b5c",
  "tempDir": "C:\\Users\\me\\Downloads\\AssetVault_Temp\\article\\ab_8f3c2a1b...",
  "limits": {
    "maxSessionBytes": 524288000,
    "maxSingleFileBytes": 104857600,
    "maxAssetFiles": 500,
    "appendTimeoutMs": 30000,
    "finishTimeoutMs": 120000
  },
  "expiresAt": "2026-06-03T12:00:00.000Z"
}
```

| 错误码 | 场景 |
|--------|------|
| `LIBRARY_NOT_OPEN` | 未打开资料库 |
| `INVALID_REQUEST` | 字段非法 |
| `ARTICLE_BUNDLE_SESSION_LIMIT` | 全局并发会话超限（建议 ≤ 4） |

### 3.4 `POST .../append`（FR-P-API-APPEND）

**Request（草案）**

```json
{
  "sessionId": "ab_...",
  "relativePath": "assets/img-001.jpg",
  "filePath": "C:\\Users\\me\\Downloads\\AssetVault_Temp\\article\\ab_...\\assets\\img-001.jpg"
}
```

| 字段 | 说明 |
|------|------|
| `relativePath` | 会话内逻辑路径：`{markdownFilename}`、`_thumb.jpg`、`assets/...`、`meta.json` |
| `filePath` | 本地绝对路径；**必须**位于 `start` 返回的 `tempDir` 下（与 `fullPageSession` 一致） |

**校验（FR-P-SEC）**

| ID | 需求 |
|----|------|
| FR-P-SEC-01 | `relativePath` 禁止 `..`、绝对路径、盘符穿越 |
| FR-P-SEC-02 | 扩展名白名单：`.md`、图片、视频、`.json`；拒绝 `.exe` 等 |
| FR-P-SEC-03 | 单文件大小 ≤ `maxSingleFileBytes` |
| FR-P-SEC-04 | 会话累计 ≤ `maxSessionBytes` |
| FR-P-SEC-05 | `assets/` 文件数 ≤ `maxAssetFiles` |

**Response `data`（草案）**

```json
{
  "relativePath": "assets/img-001.jpg",
  "bytes": 245760,
  "sessionBytes": 1048576
}
```

### 3.5 `POST .../finish`（FR-P-API-FINISH）

**Request（草案）**

```json
{
  "sessionId": "ab_...",
  "requiredFiles": {
    "markdown": "页面标题.md",
    "thumbnail": "_thumb.jpg"
  }
}
```

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-FINISH-01 | 必填校验 | 缺少 md 或 `_thumb.jpg` → `INVALID_REQUEST` |
| FR-P-FINISH-02 | 原子提交 | 先写入 staging，成功后再分配 `assetId` 并 move 到库目录 |
| FR-P-FINISH-03 | 注册资产 | 仅 **1** 条 DB 记录；`assets/*` 不单独入库 |
| FR-P-FINISH-04 | metadata | 写入 `sourceUrl`、`pageTitle`、可选 `meta.json` 解析字段 |
| FR-P-FINISH-05 | 清理 | 成功后删除 `tempDir`；失败保留 temp 直至 TTL 或 abort |
| FR-P-FINISH-06 | 部分成功 | 若扩展声明部分媒体失败：仍允许 finish，`warnings[]` 列出缺失文件 |

**Response `data`（草案）**

```json
{
  "assetId": "uuid",
  "skipped": false,
  "storagePath": "{assetId}/",
  "warnings": [
    { "code": "ASSET_FILE_MISSING", "relativePath": "assets/img-003.jpg", "message": "append never called" }
  ]
}
```

| 错误码 | 场景 |
|--------|------|
| `ARTICLE_BUNDLE_INCOMPLETE` | 缺少必填文件 |
| `ARTICLE_BUNDLE_TOO_LARGE` | 超会话/库限制 |
| `DUPLICATE_FILENAME` | 冲突且策略不允许覆盖 |

### 3.6 `DELETE .../{sessionId}`（FR-P-API-ABORT）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-ABORT-01 | 删除 tempDir | 无残留文件 |
| FR-P-ABORT-02 | 不产生 assetId | |
| FR-P-ABORT-03 | 幂等 | 重复 delete 返回成功或 `NOT_FOUND` |

### 3.7 方案 A：单次导入（可选，FR-P-API-BUNDLE）

`POST /asset/importArticleBundle`（`multipart/form-data`）：

| 部分 | 说明 |
|------|------|
| `markdown` | 文件或字段 |
| `filename` | `{title}.md` |
| `thumbnail` | `_thumb.jpg` |
| `assets[]` | 每项带 `relativePath` |
| `sourceUrl`、`targetFolderId`、`duplicatePolicy` | 同 start |

上限建议 ≤ 50MB；超过则扩展必须使用方案 B。

---

## 4. 库内 UI 与行为（FR-P-UI）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-UI-01 | 列表缩略图 | 显示 `_thumb.jpg` |
| FR-P-UI-02 | 类型展示 | 可选角标/图标区分「Markdown 资料包」 |
| FR-P-UI-03 | 打开主文件 | 支持用系统默认应用打开 `.md` |
| FR-P-UI-04 | Reveal in Explorer | 打开 `{assetId}/` 目录 |
| FR-P-UI-05 | 搜索 | MVP：可按标题/sourceUrl 搜索；正文全文索引为可选 |
| FR-P-UI-06 | 重复导入 | `duplicatePolicy` 行为与 URL 导入一致 |

---

## 5. 运维与安全（FR-P-OPS）

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-P-OPS-01 | 会话过期 | 定时扫描过期 `articleBundleSession` 目录并删除 |
| FR-P-OPS-02 | 并发限制 | 全局活跃会话 ≤ 4（可配置） |
| FR-P-OPS-03 | 下载目录一致 | 与扩展 `chrome.downloads` 写入路径一致（同整页说明） |
| FR-P-OPS-04 | 日志 | finish/abort 记录 sessionId、assetId、字节数、耗时 |
| FR-P-OPS-05 | 能力暴露 | `GET /app/info` 增加 feature 标志，如 `articleBundleSession: true` |

---

## 6. 文档交付（FR-P-DOC）

| 交付物 | 内容 |
|--------|------|
| `doc/web-api-v1-guide.md` | 新章节：Markdown 资料包 / articleBundleSession |
| `doc/web-api-v1-openapi.yaml` | 路径、schema、错误码 |
| 扩展仓 `docs/WEB_API.md` | 摘要表（由扩展维护者同步） |
| 详细规格（建议） | `article-bundle-session-api-spec.md`（请求/响应 JSON、扩展集成序列图） |

---

## 7. 与整页截图 API 的对照

| 维度 | fullPageSession | articleBundleSession |
|------|-----------------|----------------------|
| 产物 | 单张长图 | md + thumb + assets/ |
| append 内容 | 条带 JPEG | md、thumb、assets 下任意文件 |
| finish | Sharp 竖拼 | 无拼接，目录 move + 注册 |
| 主资产 | 1 | 1 |
| temp 路径 | `AssetVault_Temp/fullpage/{id}/` | `AssetVault_Temp/article/{id}/` |

复用现有：会话管理、路径校验、TTL 清理、JSend、Token、`targetFolderId`、`duplicatePolicy`。

---

## 8. 实施分期

| 里程碑 | 交付物 |
|--------|--------|
| **P-M0** | 资产类型 + `{assetId}/` 目录约定 + 删除递归 |
| **P-M1** | `articleBundleSession` start/append/finish/abort + OpenAPI |
| **P-M2** | 缩略图预览、sourceUrl、duplicatePolicy、warnings |
| **P-M3** | `GET /app/info` feature 标志、会话过期清理、UI 打开/reveal |
| **P-M4** | （可选）单次 multipart `importArticleBundle` |
| **P-M5** | （可选）内嵌 MD 预览、ZIP 导出、全文搜索 |

---

## 9. 验收标准（Pro 侧）

- [ ] 一次 finish 仅产生 **1 个** `assetId`  
- [ ] 磁盘布局符合 §2.1；`./assets/` 相对路径在系统文件管理器中可验证  
- [ ] `_thumb.jpg` 在库列表/网格中作为该资产预览  
- [ ] `finish` 失败不产生半成品资产；`abort` 后 temp 无残留  
- [ ] `relativePath` 含 `..` 或非法扩展名时被拒绝  
- [ ] 超 `maxSessionBytes` / `maxSingleFileBytes` 返回明确错误码  
- [ ] 删除资产后 `{assetId}/` 目录不存在  
- [ ] OpenAPI 与 web-api-v1-guide 已更新  
- [ ] 与扩展 E-M1 联调通过  

---

## 10. 联调顺序

```text
P-M0（模型 + 目录）
    ↓
P-M1（API） ←→ 扩展 E-M1
    ↓
P-M2 ←→ 扩展 E-M2（媒体 + warnings）
    ↓
P-M3 ←→ 扩展 E-M3/E-M4
```

**阻塞关系：** 扩展 **E-M2**（媒体本地化入库）依赖 Pro **P-M1** 可用；此前扩展仅可做本地组装与 mock。

---

## 11. 待产品确认项

| 项 | 选项 | 建议 |
|----|------|------|
| API 形态 | 仅 Session B / 仅 Bundle A / 两者 | Session B 为主，A 为小包快捷路径 |
| 评论区 | 默认不含 / 可选含 | 默认不含 |
| iframe 视频 | 仅外链说明 / Pro 代下 | 仅外链说明 |
| `assets/*` 在库内 | 隐藏 / 可见子节点 | 隐藏 |
| finish 缺部分 assets | 拒绝 / 警告并完成 | 警告并完成（与扩展 `failed_assets` 一致） |

---

## 12. 参考

- 扩展需求：[page-markdown-export-extension-requirements.md](./page-markdown-export-extension-requirements.md)  
- 整页会话规格（实现参考）：[fullpage-stitch-session-api-spec.md](./fullpage-stitch-session-api-spec.md)  
- 扩展 Web API 摘要：[WEB_API.md](./WEB_API.md)
