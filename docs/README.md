# Browser Extension — 公开文档索引

本目录为 **GitHub 对外发布** 的集成与架构文档。路线图、优化计划、Pro 侧需求草稿等在 **`docs-internal/`**（gitignore，不推送）；克隆后运行 `node scripts/init-docs-internal.mjs`。

---

## 集成

| 文档 | 说明 |
|------|------|
| [WEB_API.md](./WEB_API.md) | Web API 对接摘要 |
| [cross-repo-workflow.md](./cross-repo-workflow.md) | 与 AssetVault Pro 协作流程 |
| [architecture.md](./architecture.md) | 扩展架构 |

## API 规格（扩展 ↔ Pro）

| 文档 | 说明 |
|------|------|
| [fullpage-stitch-session-api-spec.md](./fullpage-stitch-session-api-spec.md) | 整页截图会话 |
| [page-video-import-api-spec.md](./page-video-import-api-spec.md) | 作品页视频导入 Job API |
| [page-markdown-export-extension-requirements.md](./page-markdown-export-extension-requirements.md) | 页面 Markdown 导出（扩展侧） |
| [video-import-ytdlp-extension-requirements.md](./video-import-ytdlp-extension-requirements.md) | yt-dlp 视频导入（扩展侧） |

## 维护约定

- 契约真源：Pro 仓库 `doc/web-api-v1-openapi.yaml` → `pnpm run contract:sync`
- 内部规划文档：放入 `docs-internal/`，勿提交到公开仓库
