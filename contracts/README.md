# Web API 契约（扩展侧）

Pro 仓库中的 **`doc/web-api-v1-openapi.yaml`** 为 API 的**唯一真源**。本目录保存镜像与扩展调用面清单，用于防止两端漂移。

## 文件

| 文件 | 说明 |
|------|------|
| `web-api-v1-openapi.yaml` | 从 Pro 同步的 OpenAPI 镜像（可提交，CI 不依赖 Pro 仓库） |
| `extension-api-surface.json` | 扩展实际使用的路径 + HTTP 方法（手维，与 `src/shared/*-api.ts` 对齐） |

## 日常流程

```bash
# 1. 从并列克隆的 Pro 拉取最新 OpenAPI（无 Pro 时保留现有镜像）
pnpm run contract:sync

# 2. 校验 extension-api-surface 是否仍被 OpenAPI 覆盖
pnpm run contract:check

# 3. （可选）根据镜像生成 TypeScript 路径类型
pnpm run contract:gen
```

修改 Pro API 时：**先**改 Pro 的 `doc/web-api-v1-guide.md` 与 `web-api-v1-openapi.yaml`，再 `contract:sync` → 改扩展调用代码 → 更新 `extension-api-surface.json`（若新增端点）。

## 能力探测（probe）

`extension-api-surface.json` 中 `probe: true` 的项（如 `fp___capability_probe___`）**故意不在 OpenAPI 中**，仅用于检测路由是否存在；契约检查会跳过。

## 相关文档

- [docs/cross-repo-workflow.md](../docs/cross-repo-workflow.md) — 双仓库协作总览
- Pro：`../AssetVault_Pro/doc/web-api-v1-guide.md`
