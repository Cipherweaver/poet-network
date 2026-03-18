# Roadmap: 诗人交际网

## Overview

当前项目已经具备可交互的诗人关系星图和数据流水线，下一步不是继续堆功能，而是先把“发布出来的版本是否可信”这件事做扎实。路线图分成两个阶段：先解决发布一致性、重复产物和加载测试，再处理场景持续渲染带来的性能浪费。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Release Consistency** - 固定发布数据合同，移除未使用产物，并补齐加载/交互测试
- [ ] **Phase 2: Scene Efficiency** - 降低星图后台与常驻动画成本，保持当前视觉表现

## Phase Details

### Phase 1: Release Consistency
**Goal**: 让部署产物与本地确认版本保持一致，删除运行时未消费的数据模块，并为关键加载路径和键盘交互建立回归保护。
**Depends on**: Nothing (first phase)
**Requirements**: [RELI-01, RELI-02, LOAD-01, TEST-01]
**Success Criteria** (what must be TRUE):
  1. 生产构建不再依赖 `pipeline/source/chinese-poetry` 是否存在来决定线上图谱规模
  2. 运行时数据明确来自 `public/graph.json` 与 `public/poems/*.json`，维护者以显式命令刷新这些资产
  3. 图谱加载、诗作回退和 `Esc` / 全文弹层行为拥有自动化测试覆盖
**Plans**: 2 plans

Plans:
- [ ] 01-01: Stabilize release data contract and remove unused generated graph module
- [ ] 01-02: Refactor loading state and add component-level regression tests

### Phase 2: Scene Efficiency
**Goal**: 在不改变现有视觉和交互的前提下，减少页面后台和常驻渲染时的 CPU/GPU 浪费。
**Depends on**: Phase 1
**Requirements**: [PERF-01, PERF-02]
**Success Criteria** (what must be TRUE):
  1. 页面不可见或切到后台时，场景动画会暂停或显著降低调度频率
  2. 背景与前景 canvas 不再各自进行无协调的永久渲染循环
  3. 保持现有星图的旋转、拖拽、缩放与视觉氛围不发生明显退化
**Plans**: 1 plan

Plans:
- [ ] 02-01: Consolidate animation scheduling and add visibility-aware throttling

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Release Consistency | 0/2 | Not started | - |
| 2. Scene Efficiency | 0/1 | Not started | - |
