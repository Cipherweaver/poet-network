---
phase: 01-release-consistency
plan: 01
subsystem: build
tags: [vite, release, pipeline, json, docs]
requires: []
provides:
  - Deterministic release build that no longer regenerates graph data implicitly
  - JSON-only graph generation pipeline
  - Updated maintainer documentation for refreshing committed public assets
affects: [deployment, pipeline, docs, phase-01-02]
tech-stack:
  added: []
  patterns: [Committed public assets as release contract]
key-files:
  created: []
  modified:
    - package.json
    - README.md
    - pipeline/build-data.mjs
    - pipeline/lib/build-graph.mjs
    - pipeline/lib/build-graph.test.mjs
key-decisions:
  - "Treat public/graph.json and public/poems/*.json as the only runtime data contract for release builds"
  - "Remove unused src/data/poetGraph.ts generation instead of carrying duplicate graph artifacts"
patterns-established:
  - "Build script determinism: npm run build only compiles and bundles frontend assets"
  - "Data refresh is explicit: maintainers run npm run build:data before committing changed graph assets"
requirements-completed: [RELI-01, RELI-02]
duration: 18min
completed: 2026-03-17
---

# Phase 1: Release Consistency Summary

**发布构建与数据流水线已经收敛到单一的 `public` JSON 合同，线上产物不再依赖构建机器本地是否存在真实诗词源目录。**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-17T16:20:00+08:00
- **Completed:** 2026-03-17T16:38:00+08:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- 将 `package.json` 的 `build` 改成纯前端构建，不再隐式调用 `build:data`
- 移除了 `pipeline/build-data.mjs` 中未被运行时消费的 `src/data/poetGraph.ts` 生成链
- 更新了 README，明确 `public/graph.json` 与 `public/poems/*.json` 是需要提交的发布资产

## Task Commits

未创建任务提交。

原因：
- 当前仓库仍处于“全部文件未跟踪”的初始状态
- 本机 Git 未配置 `user.name` / `user.email`

## Files Created/Modified
- `package.json` - 让 `build` 只执行 `tsc -b && vite build`
- `README.md` - 记录显式刷新并提交 `public` 静态资产的发布流程
- `pipeline/build-data.mjs` - 删除 TS 图模块输出，只保留 JSON 资产生成
- `pipeline/lib/build-graph.mjs` - 移除未再使用的 `serializeGraphModule`
- `pipeline/lib/build-graph.test.mjs` - 删除对应的模块序列化断言

## Decisions Made
- 发布版本以仓库内已提交的 `public` 图谱资产为准，而不是由 CI 根据本地目录动态决定数据规模
- 数据流水线只保留运行时实际读取的 JSON 输出

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None.
