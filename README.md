# AssetVault Pro — 浏览器扩展

Chrome / Edge（Manifest V3）扩展：从网页采集图片/视频 URL，通过本机 **AssetVault Pro Web API** 由桌面应用下载并导入资料库。

**独立项目**：源码不在 `AssetVault_Pro` 主仓库内；需与本机已安装的 [AssetVault Pro](https://github.com/) 桌面端配合使用。

依赖主应用已启动，并在 **设置 → Advanced → Web API** 中启用 API（默认 `http://127.0.0.1:41596/api/v1`）。

- API 说明：[docs/WEB_API.md](docs/WEB_API.md)（完整版在桌面端仓库 `doc/web-api-v1-guide.md`）

---

## 功能（v0.1）

| 能力 | 说明 |
|------|------|
| 右键菜单 | 图片/页面上「保存到 AssetVault Pro」 |
| 拖拽区域 | 将图片拖到右下角投放区（可在弹窗关闭） |
| 弹窗 | API 地址、Token、默认文件夹、连接状态 |
| 批量采集 | 多源探测（meta / srcset / 懒加载 / Performance 等）+ 预览图与高清原图 |
| 视频/GIF 深度采集 | 通用检测 + 站点适配（YouTube、Twitter/X、Bilibili） |
| 站点权限 | 按需 `optional_host_permissions` |
| URL 高清规则 | `src/shared/url-enlarger-site-rules.ts`（50+ 站点）；X 走专用 syndication 管线 |

---

## 目录结构

```text
src/
  manifest.json
  background/     # Service Worker
  content/        # 页面注入
  popup/          # 扩展弹窗
  batch/          # 批量采集页
  shared/         # API、站点规则、采集逻辑
scripts/          # postbuild、package（content 由 vite.config 插件构建）
dist/             # 构建输出（加载到浏览器）
release/          # 打包 zip
docs/             # Web API 对接摘要
```

---

## 开发

```bash
cd AssetVault_Browser_Extension   # 或你的克隆路径
pnpm install
pnpm run build
```

- Chrome：`chrome://extensions` → **加载已解压的扩展程序** → 选择本仓库 **`dist`** 目录（见 `LOAD-EXTENSION-HERE.txt`）。
- 修改后 `pnpm run build`，在扩展页 **重新加载**。

可选监听（ESM 入口 + content IIFE 均会重建；改 `src/content` / `board-saver` 后请在扩展页重新加载）：

```bash
pnpm run dev
```

---

## 打包

### ZIP（Chrome 网上应用店 / 手动分发）

```bash
pnpm run package
```

输出：`release/assetvault-extension-v0.1.0.zip`。

### CRX（本地安装包）

```bash
pnpm install
pnpm run package:crx
```

输出：

| 文件 | 说明 |
|------|------|
| `release/assetvault-extension-v*.crx` | 安装包 |
| `release/assetvault-extension.pem` | 私钥（**首次生成后务必备份**；同一 `.pem` 才能覆盖安装同 ID 扩展） |
| `release/assetvault-extension-v*.zip` | 同内容 ZIP（`crx3` 附带生成） |

**Chrome 图形界面打包**（不装依赖也可）：

1. `pnpm run build`
2. 打开 `chrome://extensions` → 开启「开发者模式」
3. **打包扩展程序** → 扩展根目录选 **`dist`** → 私钥选已有 `release/assetvault-extension.pem` 或留空生成新的
4. 得到 `.crx` 与同目录 `.pem`

**安装 CRX 的注意**：

- 上架 [Chrome Web Store](https://chrome.google.com/webstore/devconsole) 用 **ZIP**，不用 CRX。
- 新版 Chrome（Win/Mac）一般**不能**双击 CRX 安装；常用仍是「加载已解压的扩展程序」指向 `dist`，或企业策略 / Edge「加载扩展」。
- `.pem` 不要提交到 Git（已在 `.gitignore`）。

---

## 配置

| 项 | 默认 |
|----|------|
| API | `http://127.0.0.1:41596/api/v1` |
| Token | 空（仅本机一般不需要） |
| 重复策略 | `use_existing` |

---

## 与桌面端仓库协作

建议本地目录布局：

```text
work/soft_script/
  AssetVault_Pro/              # Electron 桌面端
  AssetVault_Browser_Extension/  # 本仓库
```

修改 Web API 契约时：先改桌面端 `doc/web-api-v1-guide.md` 与 OpenAPI，再改本仓库 `src/shared/api.ts` 等调用处。

初始化 Git（可选）：

```bash
cd AssetVault_Browser_Extension
git init
git add .
git commit -m "chore: initial browser extension project"
```
