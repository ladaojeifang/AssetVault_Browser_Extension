# AssetVault Browser Extension — 2026 年度开发计划

> 基于 Eagle v3.1.22 功能对比审计 | 2026-06-01 制定
>
> **当前基准**: 核心采集能力约达 Eagle 的 **65~70%**
> **年度目标**: 达到 **90%+** 功能覆盖 + 独有优势（反防盗链 / 并发控制 / 微信支持）

---

## 一、时间轴总览

```
Q2 (6月)          Q3 (7-9月)              Q4 (10-12月)           2027 H1
═══════════       ════════════            ════════════           ═════════
 Phase 1:         Phase 2:                Phase 3:               Phase 4:
 核心体验修复      交互体验升级             差异化优势               生态完善
 ──────────       ──────────              ──────────             ──────────
 ✓ 微信适配器      □ Batch Saver 增强      □ 瀑布流采集            □ 更多站点适配器
 ✓ URL 过滤修复    □ Auto Detect 模式      □ 截图标注编辑          □ 电商/设计站URL规则
                 □ 全局快捷键             □ URL 书签保存          □ i18n 多语言
                 □ 右键菜单增强           □ Badge 角标           □ 虚拟滚动/黑名单等
                 □ 拖拽增强               □ 标签系统
```

---

## 二、Phase 1 — 核心体验修复（已完成）

> 目标：解决"完全无法使用"的关键缺陷

| # | 任务 | 状态 | 产出文件 |
|---|------|:----:|---------|
| 1.1 | `isLikelyImageUrl()` 过滤器修复 — 腾讯CDN `_jpg` 格式 / `wx_fmt` 参数 / 中国CDN域名白名单 | ✅ | `page-image-scanner.ts` |
| 1.2 | 微信公众号专用适配器 — data-src懒加载 / mmbiz CDN / script内嵌提取 | ✅ | `site-adapters/wechat.ts` (新) |
| 1.3 | 微信 mmbiz CDN URL 放大规则 — 去除 `/640` 缩略后缀 / 清除懒加载参数 | ✅ | `url-enlarger-site-rules.ts` |
| 1.4 | esbuild 兼容性修复 — concurrency.ts / xiaohongshu.ts 语法问题 | ✅ | `concurrency.ts`, `xiaohongshu.ts` |

---

## 三、Phase 2 — 交互体验升级（建议：7-8月）

> 目标：Batch Saver 从"能用"到"好用"，补齐日常高频操作

### Sprint 2A — Batch Saver 增强（预计 2 周）

| # | 功能 | 描述 | 复杂度 | 验收标准 |
|---|------|------|--------|---------|
| 2.1 | **格式过滤面板** | 左侧边栏新增过滤区：全部 / 图片 / GIF / 视频 三档切换，带计数 badge | 中 | 点击"仅视频"后只显示 video 类型卡片 |
| 2.2 | **尺寸过滤** | 按分辨率区间筛选：< 500px / 500-1000px / > 1000px / 全部 | 低-中 | 输入最小宽度阈值，隐藏小尺寸项 |
| 2.3 | **域名来源过滤** | 列出当前页面图片的域名列表（如 mmbiz.qpic.cn, cdn.example.com），点击筛选 | 中 | 显示去重后的 hostname 列表，点击即过滤 |
| 2.4 | **排序功能** | 支持按：尺寸(大→小)、尺寸(小→大)、域名(A→Z)、格式、默认顺序 | 低 | 排序按钮组在工具栏或右键菜单 |
| 2.5 | **模糊搜索** | 文件名/URL 关键字搜索，输入时实时过滤，匹配字符高亮 | 中 | 输入 "mmbiz" 只显示微信 CDN 图片 |

**涉及文件**: `batch.html`, `batch.css`, `batch.ts`

### Sprint 2B — Auto Detect + 快捷键（预计 1.5 周）

| # | 功能 | 描述 | 复杂度 | 验收标准 |
|---|------|------|--------|---------|
| 2.6 | **Auto Detect 持续扫描模式** | Batch Saver 打开后进入检测态：每 800ms 重扫页面 → 发现新图片追加到列表底部（去重） → 顶部提示 "向下滚动可发现更多" | 中 | 打开批量面板后滚动 Pinterest 页面，新出现的图片自动追加 |
| 2.7 | **全局快捷键注册** | manifest.json `commands` 注册 4 组快捷键；content script 监听并分发 | 低-中 | `Alt+1` 打开批量采集，`Alt+2` 区域截图，`Alt+3` 可视截图，`Alt+4` 整页截图 |

**涉及文件**: `manifest.json`, `background/service-worker.ts`, `content/index.ts`, `batch.ts`

### Sprint 2C — 右键菜单 + 拖拽增强（预计 1.5 周）

| # | 功能 | 描述 | 复杂度 | 验收标准 |
|---|------|------|--------|---------|
| 2.8 | **右键菜单增强** | a) 新增「保存音频」(audio元素) b) 新增「保存背景图」(css background-image) c) 新增「保存链接为书签」 | 低 | 在有 audio 的页面右键出现"保存音频"选项 |
| 2.9 | **拖拽缩略图反馈** | 拖拽开始时生成 canvas 缩略图跟随光标（max 140px）；Drop Zone 出现 Eagle 式翻转动画 | 中 | 拖动页面图片时看到缩略图跟随 |
| 2.10 | **Drop 时文件夹选择** | 拖拽释放后弹出轻量文件夹选择浮层（从 API 加载），而非直接存入默认文件夹 | 中 | 拖拽图片后可选择目标文件夹再确认保存 |

**涉及文件**: `content/index.ts` (drag), `popup/popup.html` (folder picker), `shared/injected-shot-ui.ts` (可选复用样式)

### Phase 2 完成标志

- [ ] Batch Saver 支持 5 种过滤 + 排序 + 搜索
- [ ] Auto Detect 模式可用，瀑布流页面无需手动刷新
- [ ] 4 组全局快捷键全部工作
- [ ] 右键菜单覆盖 audio / background-image / 书签
- [ ] 拖拽有视觉反馈 + 文件夹选择

---

## 四、Phase 3 — 差异化优势（建议：9-11 月）

> 目标：实现 Eagle 没有的或明显更弱的能力，形成竞争壁垒

### Sprint 3A — 瀑布流采集器（预计 3 周，**最高复杂度**）

这是与 Eagle 差距最大的单一功能。

| # | 子任务 | 描述 |
|---|--------|------|
| 3.1 | **Board Saver 窗口** | 新建 `board-saver.html/ts/css`，独立于 batch 面板的专门窗口 |
| 3.2 | **站点识别** | 自动检测当前页是否为已知瀑布流站点(Pinterest / 小红书 / Twitter / Dribbble / Behance / 500px 等) |
| 3.3 | **自动滚动引擎** | `requestAnimationFrame` 驱动的平滑滚动，可调速度，遇底部停止 |
| 3.4 | **增量扫描 & 去重** | 滚动过程中每 500ms 触发一次 `collectPageImageCandidates()`，结果用 `Set<url>` 去重后追加 |
| 3.5 | **进度 UI** | 顶部进度条（已采集 N 张 / 滚动位置百分比）+ "已到底部" 检测 |
| 3.6 | **手动+自动混合** | 默认提示用户手动滚动（省资源）；提供"自动滚动"开关（无操作时自动滚） |
| 3.7 | **暂停/继续/完成** | 用户可随时暂停扫描、查看当前结果、一键导入 |

**涉及文件（新建）**:
```
src/board-saver/board-saver.ts        ← 主控制器
src/board-saver/board-saver.html      ← 窗口UI
src/board-saver/board-saver.css       ← 样式
src/shared/auto-scroll-engine.ts      ← 可复用的滚动引擎
```
**涉及文件（修改）**: `manifest.json` (添加 board-saver 入口), `content/index.ts`, `background/service-worker.ts`

### Sprint 3B — 截图标注 + 书签 + Badge（预计 2 周）

| # | 功能 | 描述 | 复杂度 | 验收标准 |
|---|------|------|--------|---------|
| 3.8 | **截图标注工具栏** | 截取区域后进入标注模式：文字标注 / 箭头 / 矩形框 / 马赛克模糊；canvas 2D 实现 | 高 | 截图后可在图片上画箭头写文字再保存 |
| 3.9 | **URL 书签保存** | 将当前页以"书签"形式存入仓库：标题 + URL + og:image 或自动截取的缩略图 + 页面描述 | 中 | popup 中新增"保存此网页"按钮 |
| 3.10 | **Badge 角标** | `chrome.action.setBadgeText()` 显示本次会话已采集数量；`setBadgeBackgroundColor()` 绿色 | 低 | 导入 5 张图片后图标角标显示 "5" |
| 3.11 | **截图复制到剪贴板** | 截图后不保存而是写入 clipboard API（需权限） | 低 | 截图弹窗新增"复制"按钮 |

**涉及文件**: `injected-shot-ui.ts` (标注), `popup/*` (书签), `service-worker.ts` (badge)

### Sprint 3C — 标签系统（预计 1.5 周）

| # | 功能 | 描述 | 复杂度 | 验收标准 |
|---|------|------|--------|---------|
| 3.12 | **标签输入组件** | Batch Saver 侧边栏新增标签区域：输入框 + 已有标签列表（从API获取历史标签） | 中 | 批量导入时可输入 "设计参考, 配色" 等标签 |
| 3.13 | **API 标签联动** | 导入请求携带 tags 字段；API 返回时更新历史标签缓存 | 低 | 导入后在 AssetVault 中可按标签检索 |

**涉及文件**: `batch.html/ts/css`, `shared/api.ts` (扩展 tags 参数)

### Phase 3 完成标志

- [ ] Board Saver 可用于 Pinterest / 小红书 / Twitter 等至少 5 个瀑布流站点
- [ ] 截图后可做基础标注（箭头/文字/马赛克）
- [ ] 可将任意网页保存为书签到仓库
- [ ] 工具栏显示采集计数角标
- [ ] 批量导入支持标签

---

## 五、Phase 4 — 生态完善（建议：12月 ~ 2027 Q1）

> 目标：长尾覆盖，从 90% 向 95%+ 推进

### 4.1 更多站点适配器（每个约 2-3 天）

| 优先级 | 站点 | 理由 | 依赖的 URL 规则 |
|:------:|------|------|-----------------|
| ★★★ | **Behance** | 设计师核心平台，项目多图 | ✅ 已有 enlargeBehance() |
| ★★★ | **Pixiv** | 插画社区，日活高 | ✅ 已有 enlargePixiv() |
| ★★☆ | **ArtStation** | 3D/概念艺术 | ✅ 已有 enlargeArtstation() |
| ★★☆ | **Reddit** | 图片子版块(r/pics等) | ✅ 已有 enlargeReddit() |
| ★★☆ | **Tumblr** | 图片博客 | — 需新增规则 |
| ★☆☆ | **500px** | 摄影社区 | — 需新增规则 |
| ★☆☆ | **Facebook** | 社交媒体图片 | — 反爬严格 |

### 4.2 补充缺失的 URL 放大规则（每条约 0.5 天）

Eagle 有但 AssetVault 缺少的规则：

| 站点 | 规则用途 |
|------|---------|
| 淘宝/天猫/1688 | 去除商品图 `_NNNxNNN` 尺寸后缀 |
| 京东 | 去除 `/nN/` 和 `@` 缩略参数 |
| 豆瓣 | `/s/` → `/original/` |
| 百度贴吧 | ab(pic/) 还原 + sign 参数处理 |
| Medium | 移除 `/max/NNN` 限制 |
| Squarespace | `format=NNNw` → `format=3000w` |
| Bluesky | `feed_thumbnail` → `feed_fullsize` |
| Poco (旧版) | 去 `_NNN` 后缀 |
| 各设计站群 (Archdaily/Dezeen/Houzz 等 10 条) | 已在 Eagle 中存在 |

### 4.3 其他长尾项

| # | 任务 | 预计工作量 | 说明 |
|---|------|-----------|------|
| 4.4 | **i18n 多语言框架** | 3 天 | 先支持中文 + 英文；提取所有 UI 文本到 locale JSON |
| 4.5 | **虚拟滚动** | 2 天 | 当采集结果 > 200 时启用；推荐用 tiny-virtual-list 或自实现 |
| 4.6 | **域名黑名单** | 0.5 天 | 设置页添加"对以下域名禁用"列表，存 storage.sync |
| 4.7 | **Shift+范围选择 / 框选** | 1 天 | Batch Saver 中 Shift+点击选范围，Ctrl+拖拽矩形框选 |
| 4.8 | **音频采集** | 0.5 day | `<audio>` 元素 src/currentSrc 检测 |
| 4.9 | **截图复制到剪贴板** | 0.5 day | navigator.clipboard.write() (需 permission) |

### Phase 4 完成标志

- [ ] 站点适配器总数 ≥ 22（当前 16）
- [ ] URL 放大规则总数 ≥ 60（当前 ~54）
- [ ] 支持中英双语界面
- [ ] 大数据量场景性能优化通过（≥500 条不卡顿）
- [ ] 所有 P0-P2 项目关闭

---

## 六、各阶段量化目标

| 指标 | 当前 (v0.1) | Phase 2 后 | Phase 3 后 | Phase 4 后 |
|------|:-----------:|:----------:|:----------:|:----------:|
| **Eagle 功能覆盖率** | ~68% | **~78%** | **~88%** | **~92%** |
| 站点适配器数 | 16 | 16 | 16 | **≥22** |
| URL 放大规则数 | ~54 | ~54 | ~54 | **≥62** |
| Batch Saver 功能数 | ~10 | **~18** | **~20** | **~23** |
| 全局快捷键 | 0 | **4** | 4 | 4+ |
| 采集方式数 | 5 | 6 | **8** | 9 |
| 截图后编辑 | ❌ | ❌ | **✅** | ✅ |
| 瀑布流采集 | ❌ | ❌ | **✅** | ✅ |
| 标签系统 | ❌ | ❌ | **✅** | ✅ |
| 多语言 | 中文 | 中文 | 中文 | **中+英** |
| 独有优势 | 反防盗链/并发/微信 | 同左 | **+瀑布流+标注** | 同左 |

---

## 七、风险与依赖

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **Chrome MV3 权限限制** | clipboard / notifications 等部分 API 需要用户授权 | 使用 optional_permissions + 渐进式请求 |
| **站点 DOM 结构变化** | 适配器可能因改版失效 | 解析逻辑与 UI 选择器分离；fallback 到通用扫描 |
| **Board Saver 性能** | 高频 DOM 扫描可能导致卡顿 | 使用 ConcurrencyQueue 限流；requestIdleCallback |
| **API 兼容性** | 新增 tags/书签等字段需要桌面端 API 同步更新 | 同步更新 `docs/WEB_API.md` 和 AssetVault Pro 端 |
| **i18n 工作量膨胀** | 翻译 + 维护成本随文本量增长 | 先做框架，翻译后期逐步补充 |

---

## 八、技术债务清理（穿插进行）

| # | 债务 | 建议处理时机 | 说明 |
|---|------|-------------|------|
| T1 | batch.ts 单文件过大（当前行数待确认） | Phase 2 重构时拆分 | 将渲染/状态/通信分离为模块 |
| T2 | content/index.ts 职责过多 | Phase 3 前重构 | 消息路由 / DOM 注入 / Observer 分离 |
| T3 | site-adapters 测试缺失 | Phase 4 | 为每个适配器编写 mock DOM 单测 |
| T4 | TypeScript strictness 不一致 | 随时 | 统一 tsconfig strict 模式 |

---

*本文档应在每个 Phase 完成后更新实际完成日期和状态。*
