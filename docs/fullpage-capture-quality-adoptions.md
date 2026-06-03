# 整页截图采集质量增强（Eagle 借鉴项）

**前提**：保留现有 `fullPageSession`（扩展内存纵拼 → 少量 export strip → Pro `append` / `finish`）架构，不改为扩展内单张入库或「一屏一条目图」。

**范围**：仅扩展侧采集环（`service-worker.ts` 注入脚本与滚动循环）；Pro API 与条带会话契约不变。

---

## P1 — 滚动到位校验与重试

### 目标

每次滚动到计划位置 `yCss` 后，确认实际滚动位置已到位再调用 `captureVisibleTab`，避免平滑滚动、懒布局或内层容器未同步导致截到错误区域或接缝错位。

### 行为

1. `scrollTo(yCss)` 后进入等待阶段（见「计时」）。
2. 读取实际位置 `actualYCss`：
   - 主滚动元素为 `documentElement` / `body`：`window.scrollY`（取整）。
   - 否则：`scrollEl.scrollTop`（取整）。
3. 若 `|actualYCss - yCss| <= 2`，视为到位，进入截图。
4. 若未到位：
   - **第 1 次**：额外等待 **1000ms**，再读一次；仍失败则进入步骤 5。
   - **第 2 次（可选）**：再 `scrollTo(yCss)` 一次 + 等待 **520ms**，再读；仍失败则 **本屏失败**（整页流程报错并 `abort` 会话，与现有「无低画质回退」一致）。
5. 到位后仍执行现有 `FULLPAGE_AFTER_SCROLL_MS` 懒加载等待（见「计时」）。

### 计时（与现有常量关系）

- 默认：到位确认通过后，再 `sleep(FULLPAGE_AFTER_SCROLL_MS)`（当前 520ms）再截图。
- 重试等待 1000ms **替代**该次循环里第一次 520ms，不叠加两次 520+1000（避免无谓拉长）；重试成功后的截图前仍保留 520ms。

### 验收标准

| # | 场景 | 通过条件 |
|---|------|----------|
| A1 | 普通长文页（window 滚动） | 各屏 `actualYCss` 与计划 `yCss` 差 ≤2；成品无水平错位条带 |
| A2 | 内层滚动容器页（如可复现的 div 滚动站） | 选中 `scrollEl` 后各屏 `scrollTop` 与计划一致；高度与肉眼可见底部一致 |
| A3 | 人为模拟慢滚动（DevTools 节流或极高 `scroll-behavior: smooth`） | 触发 1000ms 重试后仍能完成整页或明确失败，不出现「半屏偏移」长图 |
| A4 | 重试仍不到位 | 用户可见错误信息含「滚动未到位」或等价文案；Pro 会话已 `abort`（调试保留条带时按现有策略） |
| A5 | 性能 | 正常页不触发重试时，总耗时相对改版前增加 **< 5%**（同页同高度对比一次） |

### 非目标

- 不保证滚动过程中 `scrollHeight` 增长（瀑布流动态加段另项）。
- 不改变 `planFullpageCapturePositions` 的 overlap 公式。

---

## P2 — 浮层（fixed/sticky）隐藏细化

### 目标

减少整页成品中重复出现的顶栏/底栏/悬浮钮，同时避免误隐藏正文侧栏、窄条工具栏等应保留内容。参考 Eagle 的「几何 + 占比」启发式，在现有 `shouldHideFloating` 上收紧。

### 行为（在注入脚本内，截图开始前执行）

对 `position: fixed | sticky`、可见、与视口相交的元素，**默认候选隐藏**；满足下列 **任一「保留」** 条件则 **不隐藏**：

1. **过小控件**：`clientWidth * clientHeight < 5625`（75×75）且 `clientHeight < innerHeight`。
2. **窄侧栏（右贴边）**：`right === 0px`（computed）、`top === 0px`、`height === innerHeight`、`width < 0.3 * innerWidth`。
3. **底栏窄条**：`bottom === 0px`、`top !== 0px`、`height < 0.3 * innerHeight` 且宽度与 `body` 同宽或接近全宽。
4. **占屏过大**：`clientWidth * clientHeight > 0.7 * innerWidth * innerHeight`（视为页面主体而非浮层）。
5. **全屏高但非全宽挡板**：`position: fixed`、`top: 0`、`height` 为视口高、`width === 100%` 或 `clientWidth === innerWidth` 且 `clientHeight === innerHeight` — **保留**（避免误藏主列）。

**末屏加强**（最后一帧 `captureVisibleTab` 之前）：在以上规则基础上，对仍候选的元素，若同时满足「fixed + 贴底 + 高度 < 0.3 * innerHeight + 宽约等于 body」则 **强制隐藏**（收底部 cookie 条、下载条等）。

隐藏方式保持现有：`visibility: hidden`、`pointer-events: none`、`opacity: 0`、`data-assetvault-fullpage-hidden`，结束后恢复。

### 验收标准

| # | 场景 | 通过条件 |
|---|------|----------|
| B1 | 带固定顶栏的文档站 | 成品长图顶栏 **不重复** 出现在每个接缝条带中（允许首屏出现一次） |
| B2 | 右侧窄工具栏（宽 < 30% 视口） | 侧栏内容仍在长图中可见 |
| B3 | 底部固定「接受 Cookie」条 | 末屏加强后，长图底部 **至多一处** 该条或已隐藏 |
| B4 | 回归：无 fixed 的普通页 | 行为与改版前视觉一致 |
| B5 | 结束后 DOM | 所有 `data-assetvault-fullpage-hidden` 已清除，样式恢复 |

### 非目标

- 不处理 `position: absolute` 非 sticky 的「假浮层」。
- 不改变视频暂停逻辑。

---

## 测试建议

- 单元：`planFullpageCapturePositions` 等纯函数测试保持；P1 到位逻辑可抽纯函数 `(planned, actual) => ok` 单测。
- 手工：各 1 个代表页——长文博客（P1 A1）、内层滚动页（P1 A2）、固定头+底栏站（P2 B1/B3）。
- 合并：`pnpm run typecheck`、`pnpm run test` 通过；整页走 Pro 会话的现有 E2E/手工清单加一行「到位重试 / 浮层」勾选。

---

## 后续 backlog（本文不验收）

- P3：主滚动容器 `elementFromPoint` 可见性 + z-index 排序  
- P4：超宽页横向分条  
- P5：可配置 `captureDelay` / 站点预设  
- P6：Firefox 接缝 3px 裁切  
