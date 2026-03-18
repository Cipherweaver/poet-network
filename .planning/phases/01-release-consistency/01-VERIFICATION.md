---
phase: 01-release-consistency
verified: 2026-03-17T17:12:00+08:00
status: passed
score: 7/7 must-haves verified
---

# Phase 1: Release Consistency Verification Report

**Phase Goal:** 让部署产物与本地确认版本保持一致，删除运行时未消费的数据模块，并为关键加载路径和键盘交互建立回归保护。
**Verified:** 2026-03-17T17:12:00+08:00
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Release builds use committed public graph assets instead of regenerating data from machine-local source directories | ✓ VERIFIED | `package.json` now uses `\"build\": \"tsc -b && vite build\"`; `npm run build` output shows no `build:data` step |
| 2 | The data pipeline writes only runtime-used JSON artifacts under public/ | ✓ VERIFIED | `pipeline/build-data.mjs` only writes `public/graph.json` and `public/poems/*.json`; `serializeGraphModule` and `src/data/poetGraph.ts` are removed |
| 3 | Project documentation tells maintainers to refresh graph assets explicitly before committing or deploying data changes | ✓ VERIFIED | `README.md` development / real-data / Vercel sections now describe explicit `npm run build:data` refresh and commit flow |
| 4 | Graph loading success and failure produce explicit, test-covered UI states | ✓ VERIFIED | `src/App.test.tsx` covers graph load failure and successful graph initialization; `npm run test` passes |
| 5 | Poem modal open/close behavior is controlled by React state instead of DOM queries | ✓ VERIFIED | `src/App.tsx` now uses `poemModalOpen`; `document.querySelector('.poem-modal-backdrop')` is gone |
| 6 | Poem JSON failures fall back to graph-derived relation data with automated regression coverage | ✓ VERIFIED | `src/components/Sidebar.test.tsx` verifies fetch failure shows fallback relation cards and error hint |
| 7 | Phase 1 code changes remain buildable and lint-clean | ✓ VERIFIED | `npm run test`, `npm run lint`, and `npm run build` all pass after the changes |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | Deterministic release build scripts | ✓ EXISTS + SUBSTANTIVE | `build` no longer calls `build:data`; component test dependencies added |
| `pipeline/build-data.mjs` | JSON-only graph generation | ✓ EXISTS + SUBSTANTIVE | Output narrowed to runtime-used JSON assets |
| `README.md` | Documented release asset workflow | ✓ EXISTS + SUBSTANTIVE | Explicit maintainer workflow for refreshing and committing `public` assets |
| `src/App.tsx` | Explicit graph loading and keyboard interaction state | ✓ EXISTS + SUBSTANTIVE | `poemModalOpen` state controls Escape behavior |
| `src/components/Sidebar.tsx` | Explicit poem modal state notifications and fallback behavior | ✓ EXISTS + SUBSTANTIVE | Parent callback receives modal open/close changes |
| `src/App.test.tsx` | Graph loading and Escape interaction regression tests | ✓ EXISTS + SUBSTANTIVE | Covers error state and modal/sidebar Escape sequence |
| `src/components/Sidebar.test.tsx` | Poem fallback regression tests | ✓ EXISTS + SUBSTANTIVE | Covers failed poem asset request fallback |

**Artifacts:** 7/7 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/App.tsx` | `src/components/Sidebar.tsx` | modal state callback props | ✓ WIRED | `onPoemModalChange={setPoemModalOpen}` links child modal state to App Escape logic |
| `src/App.test.tsx` | `src/App.tsx` | component render and interaction assertions | ✓ WIRED | Test opens modal, dispatches `Escape`, and verifies sidebar remains until second `Escape` |
| `pipeline/build-data.mjs` | `public/poems` | JSON write operations | ✓ WIRED | `poemsOutputDir` remains the per-poet JSON output target |

**Wiring:** 3/3 connections verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| RELI-01: 发布构建不会因为构建机器是否存在 `pipeline/source/chinese-poetry` 而生成不同规模的线上图谱数据 | ✓ SATISFIED | - |
| RELI-02: 运行时只依赖 `public/graph.json` 和 `public/poems/*.json`，数据流水线不再生成未被前端消费的重复图谱模块 | ✓ SATISFIED | - |
| LOAD-01: 用户在图谱或诗作 JSON 加载成功、失败、回退三种路径下都能获得明确且一致的界面状态 | ✓ SATISFIED | - |
| TEST-01: 自动化测试覆盖图谱加载、诗作回退和 `Esc` / 弹层相关交互，避免后续回归 | ✓ SATISFIED | - |

**Coverage:** 4/4 requirements satisfied

## Anti-Patterns Found

None.

## Human Verification Required

None — all Phase 1 requirements were verified programmatically.

## Gaps Summary

**No gaps found.** Phase goal achieved. Ready to proceed.

## Verification Metadata

**Verification approach:** Goal-backward
**Must-haves source:** Phase 1 PLAN frontmatter + ROADMAP success criteria
**Automated checks:** 3 commands passed (`npm run test`, `npm run lint`, `npm run build`)
**Human checks required:** 0
**Total verification time:** 6 min

---
*Verified: 2026-03-17T17:12:00+08:00*
*Verifier: Codex inline execution*
