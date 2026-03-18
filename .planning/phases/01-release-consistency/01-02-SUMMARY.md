---
phase: 01-release-consistency
plan: 02
subsystem: testing
tags: [react, vitest, jsdom, testing-library, state]
requires:
  - phase: 01-01
    provides: Deterministic build and narrowed data contract for runtime assets
provides:
  - Explicit React-driven poem modal open state between App and Sidebar
  - Component regression tests for graph loading, poem fallback, and Escape behavior
  - Vitest jsdom setup for React component tests
affects: [ui-state, tests, verification]
tech-stack:
  added: [@testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom]
  patterns: [Per-file jsdom test environment, explicit modal-open callback from child to parent]
key-files:
  created:
    - src/test/setup.ts
    - src/App.test.tsx
    - src/components/Sidebar.test.tsx
  modified:
    - package.json
    - package-lock.json
    - vite.config.ts
    - src/App.tsx
    - src/components/Sidebar.tsx
    - src/lib/poems.test.ts
key-decisions:
  - "Use explicit poemModalOpen state in App instead of DOM queries"
  - "Keep global Vitest environment as node and opt jsdom in per component test file"
patterns-established:
  - "Sidebar notifies App about modal visibility via callback prop"
  - "Component tests use fixtureGraph + fetch stubs instead of introducing separate test-only graph fixtures"
requirements-completed: [LOAD-01, TEST-01]
duration: 32min
completed: 2026-03-17
---

# Phase 1: Release Consistency Summary

**图谱与诗作加载相关的高风险交互已经转成显式 React 状态，并且用组件测试覆盖了成功、失败、回退和 `Escape` 路径。**

## Performance

- **Duration:** 32 min
- **Started:** 2026-03-17T16:38:00+08:00
- **Completed:** 2026-03-17T17:10:00+08:00
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- `App` 不再通过 `document.querySelector('.poem-modal-backdrop')` 推断全文弹层是否打开
- `Sidebar` 通过显式回调把全文弹层开闭状态同步给 `App`
- 新增组件测试覆盖图谱加载失败、诗作回退、以及“第一次 Escape 只关全文，第二次 Escape 才关侧栏”的行为

## Task Commits

未创建任务提交。

原因：
- 当前仓库仍处于“全部文件未跟踪”的初始状态
- 本机 Git 未配置 `user.name` / `user.email`

## Files Created/Modified
- `vite.config.ts` - 配置 Vitest，并保留默认 `node` 环境
- `src/App.tsx` - 添加 `poemModalOpen` 显式状态并清理 DOM 查询
- `src/components/Sidebar.tsx` - 增加弹层状态回调
- `src/test/setup.ts` - 添加 testing-library 清理与 jest-dom 断言支持
- `src/App.test.tsx` - 覆盖图谱加载和 Escape 行为
- `src/components/Sidebar.test.tsx` - 覆盖诗作请求失败时的 fallback 行为
- `src/lib/poems.test.ts` - 增加默认 note 回退测试

## Decisions Made
- 组件测试环境采用“默认 node + 每个 `.test.tsx` 文件头部声明 jsdom”，避免影响 Node 环境下的流水线测试
- 弹层开闭状态归口到父组件控制，使键盘行为可测试、可维护

## Deviations from Plan

### Auto-fixed Issues

**1. Vitest environment configuration mismatch**
- **Found during:** Task 2 (Add component-test coverage for loading and fallback flows)
- **Issue:** `environmentMatchGlobs` 在当前 Vitest/Vite 组合里不被配置类型接受，且会影响现有 Node 环境测试
- **Fix:** 改为全局 `node` 环境，并在 `src/App.test.tsx` 与 `src/components/Sidebar.test.tsx` 文件头部使用 `@vitest-environment jsdom`
- **Files modified:** `vite.config.ts`, `src/App.test.tsx`, `src/components/Sidebar.test.tsx`
- **Verification:** `npm run test`, `npm run build`, `npm run lint`

---

**Total deviations:** 1 auto-fixed
**Impact on plan:** 修正的是测试环境配置实现方式，不影响既定目标和范围。

## Issues Encountered

None after the test environment adjustment.

## User Setup Required

None.
