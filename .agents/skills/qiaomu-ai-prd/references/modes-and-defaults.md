# Modes And Defaults

Use this reference to handle one-line ideas, optional tags, and ambiguity.

## Lazy-User Default

Most users will give a sentence such as:

```text
我想做一个英语单词学习网站
```

Do not force them to answer a blank template first. Produce a best-default PRD using these assumptions:

- platform: web app unless the user names iOS, Android, desktop, browser extension, CLI, or physical device
- product depth: MVP plus a credible P1 path
- business model: free single-user first unless the user asks for monetization
- account system: optional unless sync, sharing, payment, or multi-device state requires it
- backend: local-first or lightweight hosted backend unless collaboration, auth, payments, or persistent cross-device data is central
- AI use: only include AI if it clearly helps the core product, not because the skill name contains AI
- export: define output as files, share links, reports, saved projects, API responses, or user-visible completion states

State important assumptions inside feasibility boundaries, module decisions, or known unknowns. Do not open with a long caveat list.

## When To Ask Before Drafting

Ask at most 1-3 numbered questions only when a wrong assumption would be expensive or risky.

Ask before drafting when:

- platform is unclear and choices are mutually exclusive, for example native iOS vs web-only
- regulated domain is involved: medical, legal, financial, minors, education assessment, hiring, insurance, safety-critical
- product depends on copyrighted characters, celebrity likeness, real-world brand assets, or licensed content
- user asks for public release, payments, account automation, data scraping, or production infrastructure
- the same phrase can mean very different products, for example "GTA web game" could mean parody sandbox, map viewer, or multiplayer crime simulator

If the user is testing or brainstorming, continue with defaults and mark the assumptions.

## Optional Tags

### [深度模式]

Add boundary-case analysis to each module:

- unusual input
- empty and extreme data volume
- offline or failed dependency
- permission denied
- device or viewport edge cases
- recoverability

### [精简模式]

Still output all 11 chapters, but:

- fully specify P0 modules
- summarize P1-P3 as `待扩展`
- keep data model to the minimal entities needed for P0
- keep technical architecture to the smallest shippable path

### [前端视角]

Add product-relevant frontend guidance:

- component boundaries by user workflow, not file names
- state ownership and derived state
- loading, empty, error, optimistic, undo, and disabled states
- responsive layout implications
- accessibility decisions when they change UX

Do not dump CSS class names or framework boilerplate.

### [后端视角]

Add product-relevant backend guidance:

- API resources and operations
- authorization boundaries
- persistence model
- background jobs
- idempotency and retry behavior
- data retention and export behavior

Avoid premature microservice design.

### [移动优先]

Default diagrams and interaction details to mobile:

- single-column navigation
- thumb-safe primary actions
- bottom sheets or tabs when appropriate
- offline, keyboard, orientation, safe-area, and permission states

If the product is desktop-first, explain why.

### [竞品深挖]

Spend extra effort on:

- competitor workflow debt
- business-model constraints
- architectural lock-in
- switching triggers
- unfair advantages the new product can exploit

Do not invent current market claims. If competitor details are not verified, say so.

### [商业化]

Add monetization implications in the relevant chapters:

- which features are free vs paid
- upgrade trigger
- pricing unit
- trial boundary
- cost drivers
- what must remain free to build habit

Do not add monetization if it hurts the P0 behavior.

### [开源友好]

Prefer:

- MIT, Apache-2.0, BSD, or similarly permissive dependencies
- self-hostable architecture
- portable exports
- clear data ownership
- plugin-friendly extension points

Still choose proprietary services if they are the only credible path and explain the tradeoff.

## Combining Modes

When multiple tags appear, combine them by priority:

1. platform tags such as `[移动优先]`
2. scope tags such as `[精简模式]` or `[深度模式]`
3. perspective tags such as `[前端视角]` or `[后端视角]`
4. market tags such as `[竞品深挖]`, `[商业化]`, `[开源友好]`

If `[精简模式]` and `[深度模式]` both appear, make P0 deep and keep lower tiers short.

## Reliable Defaults By Product Type

For learning tools:

- core loop: learn -> practice -> feedback -> review
- P0: content input, practice session, progress state, review path
- common risk: overbuilding content management before the learning loop works

For creator tools:

- core loop: import/create -> edit -> preview -> export/share
- P0: one high-quality output path
- common risk: too many formats before one format is excellent

For dashboards:

- core loop: connect data -> inspect -> filter -> act/export
- P0: trustworthy data source and stateful filters
- common risk: beautiful charts without clear decisions

For games:

- core loop: control -> challenge -> feedback -> progression
- P0: playable loop and reset path
- common risk: content ambition before mechanics are fun and measurable

For websites:

- core loop: understand offer -> inspect proof/content -> take action
- P0: first-screen clarity, navigation, content model, responsive layout
- common risk: landing-page copy without real product/page substance

For AI tools:

- core loop: input -> model action -> inspect -> revise -> save/export
- P0: prompt/input, visible model state, editable output, retry/recovery
- common risk: hiding uncertainty and making outputs feel final when they need review
