---
name: qiaomu-ai-prd
description: |
  Generate AI-implementable product requirement documents (PRDs) from one-line product ideas, vague app/site/tool requests, or feature concepts. Use when the user asks for PRD, 产品需求文档, 需求文档, AI 可执行 PRD, 产品规格, MVP 方案, app/site/tool planning, or developer handoff docs for AI coding assistants.
---

# Qiaomu AI PRD

把一句模糊产品想法，写成产品经理、人类开发者和 AI 编程助手都能直接执行的 PRD。

Copyright (c) 向阳乔木
X: https://x.com/vista8
GitHub: https://github.com/joeseesun/

## Operating Mode

Run as a production-lite product specification skill.

Default assumptions:

- The user usually wants a finished PRD, not a questionnaire.
- If the input is only one sentence, infer the best conservative product direction and continue.
- Ask only when the answer would materially change product category, platform, safety, legal risk, budget, data ownership, or implementation scope.
- When a choice is needed, make the best default decision and give the reason inside the relevant chapter.
- Do not start implementation unless the user explicitly asks; this skill produces the PRD.
- Write Chinese-first unless the user asks for English.
- Output all 11 required chapters in order. Do not skip chapters, even in compact mode.
- Keep implementation details out unless they affect product behavior, architecture risk, data contracts, verification, or AI handoff.
- Do not invent current competitor, API, platform, or package facts. If current facts matter and cannot be verified, mark them as unresolved or use `未知`.
- Treat fuzzy product words as direction, not proof. Translate them into concrete UI states, measurable targets, outputs, and acceptance criteria.

## Workflow

1. Parse the user input and optional mode tags from `references/modes-and-defaults.md`.
2. Decide the likely product category, target users, primary platform, and MVP surface.
3. Identify constraints and unknowns that must be represented honestly in the PRD.
4. Generate the PRD with the exact chapter contract in `references/prd-methodology.md`.
5. For each module, include realistic ASCII UI/state diagrams, normal flow, at least two failure paths, states, dependencies, and 1-3 real product decisions or `无`.
6. For differentiation and technical choices, explain structural causes and tradeoffs instead of saying competitors "did not think of it".
7. Give numeric performance targets with measurement methods and degradation thresholds.
8. Finish chapter 11 as a direct note to the implementing AI assistant using second person `你`.
9. Run the self-check in `references/output-quality.md` before final output.
10. If the PRD is saved to a file, run `python3 scripts/lint_prd.py <file>` and fix any reported issue.

## Output Contract

When the user gives a product idea, output the PRD directly. Use this order:

1. `# [产品名] PRD`
2. `## 第一章：产品概述`
3. `## 第二章：整体布局与导航`
4. `## 第三章：核心模块详细设计`
5. `## 第四章：超越竞品的差异化功能`
6. `## 第五章：数据模型`
7. `## 第六章：技术架构`
8. `## 第七章：交互细节`
9. `## 第八章：导出与输出系统`
10. `## 第九章：开发优先级`
11. `## 第十章：性能指标`
12. `## 第十一章：开发者交接说明`

Do not add a long preface. If assumptions are needed, place them inside the relevant chapter, usually `1.3 可行性边界`, module `待决问题`, or `第十一章 d) 已知的未知项`.

## Optional Modes

Recognize these tags anywhere in the user request:

- `[深度模式]`: add boundary-case analysis to each major module.
- `[精简模式]`: keep every chapter, but focus detailed design on P0; mark lower tiers as `待扩展`.
- `[前端视角]`: add component decomposition and state-management guidance where product-relevant.
- `[后端视角]`: add API design and database schema where product-relevant.
- `[移动优先]`: make all layout diagrams mobile-first unless the product is clearly desktop-only.
- `[竞品深挖]`: deepen competitor weakness analysis and product blind-spot reasoning.
- `[商业化]`: add pricing, paid feature, and monetization implications where appropriate.
- `[开源友好]`: prefer permissive open-source libraries, especially MIT, when the choice does not harm the product.

See `references/modes-and-defaults.md` for how to combine modes.

## Quality Bar

A strong PRD from this skill:

- makes product decisions instead of pushing every ambiguity to the user
- contains realistic ASCII diagrams with actual labels and representative content
- names meaningful competitor differences instead of filling a comparison table with obvious parity
- defines module states, data flows, failure paths, and open decisions
- uses data structures with commented JSON fields and a top-level `version`
- explains technical choices and package-size uncertainty honestly
- prioritizes by user behavior impact, not implementation difficulty
- turns performance expectations into exact numbers and measurement methods
- tells the implementing AI what to build first, what not to reinterpret, and what remains unknown

Reject or revise a PRD that:

- leaves placeholders such as `[产品名]`, `按钮 A`, `TODO`, or `待补充`
- uses vague performance language such as `快`, `流畅`, `轻量`, or `可扩展` instead of numbers
- claims impossible browser, iOS, Android, web, AI model, or export capabilities
- invents competitor facts, package sizes, or platform limits
- has no honest known-unknown item in chapter 11
- lists P0 as a wishlist instead of the smallest usable product

## Reference Files

- `references/prd-methodology.md`: the required 11-chapter PRD structure and detailed generation rules.
- `references/modes-and-defaults.md`: lazy-user defaults, optional modes, question policy, and uncertainty handling.
- `references/output-quality.md`: output self-check and common failure patterns.
- `scripts/lint_prd.py`: lightweight checker for required chapters, unresolved placeholders, vague performance terms, and structural omissions.
