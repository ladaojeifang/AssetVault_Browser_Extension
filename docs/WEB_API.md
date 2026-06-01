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
| `POST` | `/asset/importFromDataUrl` | Data URL / 截图导入（若已实现） |

请求体、JSend 响应、`Referer`、重复策略等完整说明见 **AssetVault Pro** 仓库：

- `doc/web-api-v1-guide.md`（第 3.6 节 URL 导入）
- `doc/web-api-v1-openapi.yaml`

若两个仓库并列放在同一父目录，本地路径为：`../AssetVault_Pro/doc/web-api-v1-guide.md`。
