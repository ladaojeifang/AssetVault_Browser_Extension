# AssetVault Browser Extension — 测试目录

测试文档、用例与夹具与 `src/` 业务代码分离。历史 `tests/` 目录已迁移至本目录。

```text
testing/
  README.md              ← 本文件（入口）
  doc/
    strategy.md          ← 扩展侧测试方案（契约、矩阵、与 Pro 联调）
  unit/                  L1 单元测试（Node node:test）
  fixtures/
    assets/              HTML 片段、JSON 等可提交样例
  helpers/               测试专用 helper（待扩展）
```

**双仓库总方案：** Pro 仓库 [testing/doc/strategy.md](../../AssetVault_Pro/testing/doc/strategy.md)  
**契约协作：** [docs/cross-repo-workflow.md](../docs/cross-repo-workflow.md)

---

## 快速运行

在仓库根目录执行：

| 命令 | 说明 |
|------|------|
| `pnpm test` | **推荐门禁**：全部 `testing/unit/*.test.ts` + `contract:check` |
| `pnpm run test:unit` | 仅单元测试（不含 OpenAPI 契约） |
| `pnpm run test:fullpage` | 仅整页长图 capture 相关用例 |
| `pnpm run contract:check` | `extension-api-surface.json` ⊆ OpenAPI 镜像 |
| `pnpm run contract:sync` | 从 `../AssetVault_Pro/doc/web-api-v1-openapi.yaml` 同步到 `contracts/` |
| `pnpm run contract:gen` | 生成 `src/shared/api-contract.generated.ts`（可选） |
| `pnpm run contract` | `contract:sync` + `contract:check` |
| `pnpm run smoke:pro` | Pro **已启动**时探测 `GET /api/v1/app/info` |

**当前基线（本地）：** 28 个测试文件，126 条断言（`node:test` 统计为 tests）。

**注意：** `pnpm test` **不会**运行 Pro 仓库的 Vitest 用例；两端需分别在各自目录执行。

---

## 分层说明

| 层级 | 内容 | 命令 |
|------|------|------|
| **L0** | `typecheck` `build` `contract:check` | `pnpm run typecheck` `pnpm run build`；契约已含在 `pnpm test` |
| **L1** | `testing/unit/*.test.ts` 纯函数、解析、状态机 | `pnpm run test:unit` |
| **L2** | Mock `fetch` 的 API 客户端序列（待扩展） | 未来 `testing/integration/` |
| **L3** | 真 Chrome + 加载扩展（待建） | 未来 `testing/e2e/` |

PR 最低门禁建议：

```bash
pnpm run typecheck && pnpm test && pnpm run build
```

---

## 运行器与约定

- **运行器：** Node 内置 [`node:test`](https://nodejs.org/api/test.html)（`node --experimental-strip-types --test`）
- **位置：** 所有 L1 用例放在 `testing/unit/`，文件名 `*.test.ts`
- **import 路径：** 从被测模块使用 `../../src/...`（相对 `testing/unit/`）
- **契约脚本：** `scripts/check-api-contract.mjs`、`scripts/lib/*`；测试中可 `../../scripts/lib/...`

### 最小用例模板

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { myFn } from '../../src/shared/myModule.ts'

describe('myFn', () => {
  it('returns expected value', () => {
    assert.equal(myFn('input'), 'output')
  })
})
```

### 夹具

- 小片段 HTML / JSON → `testing/fixtures/assets/`
- 测试中：`readFileSync(join(import.meta.dirname, '../fixtures/assets/sample.html'), 'utf8')`

---

## 契约测试（L0）

扩展不实现 HTTP 服务端；契约保证**调用面**与 Pro OpenAPI 一致。

| 文件 | 作用 |
|------|------|
| `contracts/web-api-v1-openapi.yaml` | Pro OpenAPI 镜像（`contract:sync` 更新，**提交 git**） |
| `contracts/extension-api-surface.json` | 扩展实际调用的路径列表 |
| `testing/unit/api-contract.test.ts` | 解析 OpenAPI、校验 surface |
| `scripts/check-api-contract.mjs` | CI 入口（`pnpm test` 末尾执行） |

**改 API 顺序：** Pro 实现 + OpenAPI → `pnpm run contract:sync` → 改 `src/shared/*` → 更新 `extension-api-surface.json` → `pnpm test`

`probe: true` 的端点（能力探测）故意可能 404，不参与 OpenAPI 存在性检查。

---

## 已有用例索引（28 文件）

| 领域 | 文件 |
|------|------|
| **契约** | `api-contract.test.ts` |
| **Board Saver** | `board-saver-filters.test.ts` `board-saver-filters.edge.test.ts` `board-saver-import.test.ts` `board-saver-edit.test.ts` `board-saver-scan-state.test.ts` `board-saver-page-detection.test.ts` `board-saver-video-discover.test.ts` |
| **主栏 / 文章导出** | `main-column-extract.test.ts` `main-column-media.test.ts` `main-column-url-match.edge.test.ts` `media-inventory.test.ts` `wechat-page-data.test.ts` |
| **图片 URL / 校验** | `image-url-resolve.test.ts` `image-blob-validate.test.ts` `data-url-import.test.ts` |
| **整页截图** | `fullpage-session.test.ts` `fullpage-capture.test.ts` `fullpage-long-capture.test.ts` `fullpage-page-helpers.test.ts` |
| **作品页视频** | `video-page-url-rules.test.ts` `video-page-url-resolve.test.ts` `page-video-import-api.test.ts` `page-video-import-errors.test.ts` `page-video-import-cookies.test.ts` `page-video-import-cookie-strategies.test.ts` `page-video-import-summarize.test.ts` |
| **通用** | `concurrency.test.ts` |

领域说明与待补矩阵见 [doc/strategy.md](./doc/strategy.md)。

---

## 与 Pro 联调

| 场景 | 做法 |
|------|------|
| 只改扩展逻辑 | `pnpm test` |
| 改 Web API 契约 | Pro `openapi:check` + 扩展 `contract:sync` + `pnpm test` |
| 验证运行中 Pro | 启动 Pro → `pnpm run smoke:pro` |
| Pro 全量回归 | 在 Pro 目录 `pnpm run test:all`（与扩展无关） |

---

## 新增测试 checklist

1. 在 `testing/unit/` 新建 `feature-name.test.ts`
2. import 使用 `../../src/...`
3. 边界用例可加 `.edge.test.ts` 后缀（约定名，仍被 `*.test.ts` glob 收录）
4. 若调用新 API 路径 → 更新 `contracts/extension-api-surface.json`
5. Pro OpenAPI 变更后 → `pnpm run contract:sync`
6. 需要 HTML 夹具 → 放入 `testing/fixtures/assets/`，控制体积

---

## 常见问题

**Q: 为什么不用 Vitest？**  
扩展以 Service Worker / 纯 TS 模块为主，L1 用 Node 原生 test 零额外依赖、启动快；与 Pro Vitest 栈独立。

**Q: `pnpm test` 会启动 Chrome 吗？**  
不会。无 E2E 时全程 Node。

**Q: Pro 不在 `../AssetVault_Pro`？**  
手动复制 OpenAPI 到 `contracts/`，或调整路径后跑 `contract:check`；`contract:sync` 默认并列目录。

---

*最后更新：2026-06-05*
