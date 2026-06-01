# Agent guide — AssetVault Browser Extension

独立 Chrome/Edge MV3 扩展，通过本机 **AssetVault Pro Web API** 导入网页媒体。

## 必读

| 主题 | 文档 |
|------|------|
| 扩展使用与构建 | [README.md](README.md) |
| Web API（桌面端仓库） | 与 [AssetVault Pro](../AssetVault_Pro/doc/web-api-v1-guide.md) 同机并列克隆时：`../AssetVault_Pro/doc/web-api-v1-guide.md` |
| URL 高清规则 | [src/shared/url-enlarger-site-rules.ts](src/shared/url-enlarger-site-rules.ts) |

## 布局

- `src/background/` — Service Worker
- `src/content/` — 页面注入
- `src/popup/`、`src/batch/` — 扩展 UI 页
- `src/shared/` — API 客户端、站点规则、采集逻辑
- `dist/` — 构建输出（加载到浏览器）
- `release/` — 打包 zip

## 质量

- `pnpm run typecheck` — 必须通过（`build` 已依赖）
- `pnpm run test` — 队列与 Board Saver 状态机最小回归
- 架构说明：[docs/architecture.md](docs/architecture.md)

## 约定

- 默认 API：`http://127.0.0.1:41596/api/v1`
- 修改与主应用 API 契约相关的请求/响应时，同步更新桌面端 `doc/web-api-v1-guide.md` 与 OpenAPI（在 AssetVault Pro 仓库）
- 不提交 Token、用户 `dist/` 调试产物以外的密钥
