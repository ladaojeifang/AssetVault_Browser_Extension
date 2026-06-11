# AssetVault Browser Extension — 自动化测试方案

本文档描述**浏览器扩展仓库**的测试策略、用例矩阵与和 Pro 的契约协作。双仓库总览见 Pro 侧 [testing/doc/strategy.md](../../../AssetVault_Pro/testing/doc/strategy.md)。

**入口：** [testing/README.md](../README.md) · [docs/cross-repo-workflow.md](../../docs/cross-repo-workflow.md)

---

## 1. 目标

1. **采集与导出逻辑可回归**：主栏提取、Board Saver、整页会话、作品页视频等在无浏览器环境下可测。
2. **API 调用面不漂移**：`extension-api-surface.json` 与 Pro OpenAPI 镜像一致。
3. **PR 快速反馈**：`pnpm test` < 1 分钟（单元 + 契约）。

### 非目标（当前阶段）

- 真实站点爬虫 / 外网 E2E
- 扩展 UI 截图对比
- 在扩展 CI 内编译运行 Pro 全量 Vitest

---

## 2. 工具链

| 项 | 选择 |
|----|------|
| L1 运行器 | Node `node:test` + `--experimental-strip-types` |
| 类型检查 | `tsc --noEmit` |
| 契约 | `scripts/check-api-contract.mjs` + `testing/unit/api-contract.test.ts` |
| 构建验证 | `vite build`（`pnpm run build`） |

```json
// package.json 片段
"test": "node --experimental-strip-types --test testing/unit/*.test.ts && node scripts/check-api-contract.mjs"
```

---

## 3. 分层

```text
  L3  E2E（待建）     Playwright + --load-extension
        │
  L2  Mock HTTP（待建）  articleBundle / pageVideo 请求序列
        │
  L1  单元（当前主力）   testing/unit/*.test.ts
        │
  L0  门禁              typecheck · test(含 contract) · build
```

| 层级 | 目录 | CI 默认 |
|------|------|---------|
| L0 | — | ✅ 每次 PR |
| L1 | `testing/unit/` | ✅ `pnpm test` |
| L2 | `testing/integration/`（规划） | 待建 |
| L3 | `testing/e2e/`（规划） | Nightly |

---

## 4. 目录规范

```text
testing/
  unit/           *.test.ts；边界用例可用 *.edge.test.ts
  fixtures/assets/  可提交的小 HTML/JSON
  helpers/        共享 mock、读夹具
  doc/strategy.md 本文件
contracts/
  web-api-v1-openapi.yaml      Pro 镜像（sync 维护）
  extension-api-surface.json   扩展调用真源
```

**import 约定：** `testing/unit/foo.test.ts` → `import { x } from '../../src/...'`

---

## 5. 功能矩阵

### 5.1 Board Saver — L1 ★★★

| ID | 场景 | 文件 | 状态 |
|----|------|------|------|
| BS-01 | 尺寸 / 格式 / 域名 / 关键词过滤 | `board-saver-filters.test.ts` | ✅ |
| BS-02 | 边界尺寸、video_page、低质量隐藏 | `board-saver-filters.edge.test.ts` | ✅ |
| BS-03 | 扫描状态机 | `board-saver-scan-state.test.ts` | ✅ |
| BS-04 | 页面类型检测（静态 / 懒加载 / 瀑布流） | `board-saver-page-detection.test.ts` | ✅ |
| BS-05 | 视频作品卡片发现 | `board-saver-video-discover.test.ts` | ✅ |
| BS-06 | 导入累积 / 批处理响应 | `board-saver-import.test.ts` | ✅ |
| BS-07 | 编辑态文件名前后缀 | `board-saver-edit.test.ts` | ✅ |
| BS-08 | 真页 E2E 扫描数量 | — | 待 L3 |

### 5.2 主栏 / Markdown 导出 — L1 ★★★

| ID | 场景 | 文件 | 状态 |
|----|------|------|------|
| MC-01 | 主栏 DOM 提取 | `main-column-extract.test.ts` | ✅ |
| MC-02 | 媒体清单 | `main-column-media.test.ts` | ✅ |
| MC-03 | URL 规范化 / lazy / 微信 | `main-column-url-match.edge.test.ts` | ✅ |
| MC-04 | 媒体路径替换 | `media-inventory.test.ts`（及相关） | ✅ |
| MC-05 | 微信 picture_page_info | `wechat-page-data.test.ts` | ✅ |
| MC-06 | 图片 blob 校验 | `image-blob-validate.test.ts` | ✅ |
| MC-07 | 高清 URL 解析 | `image-url-resolve.test.ts` | ✅ |

### 5.3 整页截图会话 — L1 ★★

| ID | 场景 | 文件 | 状态 |
|----|------|------|------|
| FP-01 | 会话 ID / 探针错误分类 | `fullpage-session.test.ts` | ✅ |
| FP-02 | 滚动 / 拼接计划 | `fullpage-capture.test.ts` `fullpage-long-capture.test.ts` | ✅ |
| FP-03 | 页面辅助（隐藏浮动条等） | `fullpage-page-helpers.test.ts` | ✅ |
| FP-04 | append/finish 请求体序列 | — | 待 L2 mock |

规格：[fullpage-stitch-session-api-spec.md](../../docs/fullpage-stitch-session-api-spec.md)

### 5.4 作品页视频 — L1 ★★

| ID | 场景 | 文件 | 状态 |
|----|------|------|------|
| PV-01 | URL 规则 / canonicalize | `video-page-url-rules.test.ts` `video-page-url-resolve.test.ts` | ✅ |
| PV-02 | Job API 轮询 / 终止 | `page-video-import-api.test.ts` | ✅ |
| PV-03 | 错误码中文化 | `page-video-import-errors.test.ts` | ✅ |
| PV-04 | Cookie 策略 / 合并 | `page-video-import-cookies.test.ts` `page-video-import-cookie-strategies.test.ts` | ✅ |
| PV-05 | Job 摘要文案 | `page-video-import-summarize.test.ts` | ✅ |
| PV-06 | 真 yt-dlp 下载 | — | **禁止 CI**；Pro 侧手工 |

### 5.5 API 契约 — L0 ★★★

| 检查 | 命令 |
|------|------|
| surface ⊆ OpenAPI | `contract:check`（含在 `pnpm test`） |
| OpenAPI 解析 | `api-contract.test.ts` |
| 可选生成类型 | `contract:gen` |

### 5.6 通用基础设施 — L1

| 文件 | 说明 |
|------|------|
| `concurrency.test.ts` | 并发队列 |
| `data-url-import.test.ts` | Data URL 体积估算 |

---

## 6. 与 Pro 的协作流

```text
  Pro 改 API
      │
      ├─► doc/web-api-v1-openapi.yaml
      │
      ▼
  扩展 pnpm run contract:sync
      │
      ├─► src/shared/api.ts 等
      ├─► extension-api-surface.json
      └─► pnpm test
              │
              ▼
  可选：Pro 已启动 → pnpm run smoke:pro
```

**两端测试独立执行：**

```bash
# Pro（Vitest + Electron 集成）
cd AssetVault_Pro && pnpm run test:all

# 扩展（node:test + 契约）
cd AssetVault_Browser_Extension && pnpm test
```

---

## 7. CI 建议（待添加 workflow）

```yaml
# .github/workflows/extension-fast.yml
name: Extension Fast
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install
      - run: pnpm run typecheck
      - run: pnpm test
      - run: pnpm run build
```

Nightly 可选：checkout Pro + 启动 headless API + `smoke:pro`（需另 workflow）。

---

## 8. 分阶段计划

### Phase 1（当前）— L0 + L1 覆盖核心采集

- [x] `testing/` 目录与 `tests/` 迁移
- [x] Board Saver / 主栏 / 整页 / page-video L1
- [x] `contract:check` 纳入 `pnpm test`
- [ ] GitHub Actions `extension-fast.yml`

### Phase 2 — L2 Mock HTTP

- [ ] `articleBundleSession` start→append→finish mock 序列
- [ ] `pageVideoImport` create→poll mock
- [ ] `importFromURL` 错误映射到 notify 文案

### Phase 3 — L3 E2E

- [ ] `testing/fixtures/pages/sample-gallery.html`
- [ ] Playwright 加载 `dist/` 扩展
- [ ] Board Saver 扫描计数断言

---

## 9. 维护约定

1. **新增 Pro API 调用** → `extension-api-surface.json` + `contract:sync` + `pnpm test`
2. **新增站点采集规则** → 优先 L1 表驱动 + 小 HTML 夹具
3. **Bug 修复** → 先加 `testing/unit` 失败用例再改 `src/`
4. **大 HTML 夹具** → 只保留最小复现片段，勿提交整页 dump

---

*文档版本：2026-06-05*
