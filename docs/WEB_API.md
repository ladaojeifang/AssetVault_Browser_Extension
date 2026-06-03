# Web API 对接说明

扩展只与本机 AssetVault Pro 的 HTTP API 通信，不嵌入 Electron 主进程。

## 默认地址

- Base URL：`http://127.0.0.1:41596/api/v1`
- 在桌面端 **设置 → Advanced → Web API** 启用；远程访问需 Token。

## 常用端点

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/app/info` | 连接检测（应用名与版本） |
| `POST` | `/asset/importFromURL` | 单条 URL 导入 |
| `POST` | `/asset/importFromURLBatch` | 批量 URL 导入 |
| `POST` | `/asset/importFromDataUrl` | Data URL / 截图导入（区域/元件/回退） |
| `POST` | `/asset/fullPageSession/start` | 整页截图会话：创建 |
| `POST` | `/asset/fullPageSession/append` | 登记一条本地条带文件 |
| `POST` | `/asset/fullPageSession/finish` | 拼接并导入为单资产 |
| `DELETE` | `/asset/fullPageSession/{sessionId}` | 取消并清理临时目录 |

整页高画质拼接的**完整方案 B 规格**（请求体、错误码、扩展集成流程）：[fullpage-stitch-session-api-spec.md](./fullpage-stitch-session-api-spec.md)

Markdown 资料包（扩展已实现提取与编排流程，Pro 需实现对应 API 后才可入库）：

| 文档 | 说明 |
|------|------|
| [page-markdown-export-pro-requirements.md](./page-markdown-export-pro-requirements.md) | Pro：`articleBundleSession` 等待开发需求 |
| [page-markdown-export-extension-requirements.md](./page-markdown-export-extension-requirements.md) | 扩展：提取 / Turndown / 上传编排需求（已实现） |

**注意**：条带通过 `chrome.downloads` 写入 `下载/AssetVault_Temp/fullpage/{sessionId}/`，须与 Pro 使用的系统「下载」目录一致（Chrome 若改到其他文件夹，append 会报路径不一致）。

请求体、JSend 响应、`Referer`、重复策略等完整说明见 **AssetVault Pro** 仓库：

- `doc/web-api-v1-guide.md`（第 3.6 节 URL 导入）
- `doc/web-api-v1-openapi.yaml`

若两个仓库并列放在同一父目录，本地路径为：`../AssetVault_Pro/doc/web-api-v1-guide.md`。
