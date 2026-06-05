# 双仓库协作（Pro + 浏览器扩展）

扩展与桌面端**保持两个独立 Git 仓库**，通过本机 HTTP API 松耦合。本文说明推荐目录布局、契约同步与验证。

## 目录布局

```text
G:/work/soft_script/          # 或你的父目录
  AssetVault.code-workspace   # Cursor / VS Code 多根工作区（可选）
  AssetVault_Pro/             # Electron 桌面端 + API 真源
  AssetVault_Browser_Extension/   # 本仓库
```

在 Cursor 中：**文件 → 从文件打开工作区** → 选择 `AssetVault.code-workspace`，即可同时编辑两端。

## 职责划分

| 仓库 | 负责 |
|------|------|
| **Pro** | API 实现、`doc/web-api-v1-guide.md`、`doc/web-api-v1-openapi.yaml` |
| **扩展** | `src/shared/api.ts` 及 `*-session-api.ts` 调用方、`contracts/` 镜像与调用面 |

## 改 API 的标准顺序

1. **Pro**：实现路由 → 更新 `web-api-v1-guide.md` + `web-api-v1-openapi.yaml`
2. **扩展**：`pnpm run contract:sync` 拉取 OpenAPI 镜像
3. **扩展**：改 `src/shared/*` 调用代码
4. **扩展**：若新增/删除端点，更新 `contracts/extension-api-surface.json`
5. **扩展**：`pnpm run contract:check`（已纳入 `pnpm test`）
6. **本地**：启动 Pro 后 `pnpm run smoke:pro` 验证连通性

## 契约工具

| 命令 | 作用 |
|------|------|
| `pnpm run contract:sync` | 从 `../AssetVault_Pro/doc/web-api-v1-openapi.yaml` 复制到 `contracts/` |
| `pnpm run contract:check` | 校验 `extension-api-surface.json` 每条（非 probe）均在 OpenAPI 中存在 |
| `pnpm run contract:gen` | （可选）用 `openapi-typescript` 生成 `src/shared/api-contract.generated.ts` |
| `pnpm run contract` | `sync` + `check` |
| `pnpm run smoke:pro` | 对运行中的 Pro 做 `GET /app/info` 冒烟 |

`contracts/web-api-v1-openapi.yaml` **提交进扩展仓库**，这样 CI / 无 Pro 克隆时也能跑契约检查。

## 类型策略

- **手写类型**：`src/shared/types.ts` 及功能模块内类型（当前主力）
- **生成类型**（可选）：`pnpm run contract:gen` 产出 `api-contract.generated.ts`，用于对照 OpenAPI schema；不强制替换现有手写类型

## 功能规格文档

跨端功能仍用**两份需求文档**（扩展 / Pro 各一份），API 细节以 OpenAPI + guide 为准：

- Markdown 导出：`page-markdown-export-*-requirements.md`
- 作品页视频：`video-import-ytdlp-*-requirements.md`、`page-video-import-api-spec.md`
- 整页截图：`fullpage-stitch-session-api-spec.md`

## 常见问题

**Q: Pro 仓库不在 `../AssetVault_Pro`？**  
手动复制 `web-api-v1-openapi.yaml` 到 `contracts/`，或设置符号链接；`contract:sync` 仅支持默认并列路径。

**Q: probe 路径为何不在 OpenAPI？**  
`fp___capability_probe___` 等用于检测旧版 Pro 是否支持会话 API，故意返回 404；在 `extension-api-surface.json` 标 `probe: true` 并跳过契约检查。
