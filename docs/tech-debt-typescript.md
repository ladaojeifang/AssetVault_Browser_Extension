# TypeScript 技术债清理记录

## 基线（2026-06-01）

- `tsc --noEmit`：**219** 个错误
- 构建链未执行 typecheck，错误可长期累积

## 修复策略

| 类别 | 处理方式 |
|------|----------|
| `site-adapters/*` 中 `Element` 访问 `src`/`dataset` | `querySelectorAll<HTMLImageElement>` / `HTMLVideoElement`；`tsconfig` 增加 `DOM.Iterable` |
| `batch/batch.ts` `dataset` | `querySelectorAll<HTMLElement>` |
| `concurrency.ts` 泛型队列 | 重构为类型安全的 `QueueEntry.run`；构造函数校验 `number` |
| `content` hooks | `__assetVaultScanBatch` 返回 `Promise<PageMediaItem[]>` |
| Board Saver 导入后状态 | `board-saver-scan-state.ts` 纯函数决策恢复策略 |

## 当前状态

- `pnpm run typecheck`：**0 错误**
- `pnpm run build`：先 typecheck 再单次 Vite build（含 content IIFE 插件）

## 约定

- 禁止新增 `@ts-ignore`（无审查理由时）
- 站点适配器新增图片扫描优先使用 `querySelectorAll<HTMLImageElement>(...)`
- 可选复用 `src/shared/dom-utils.ts`
