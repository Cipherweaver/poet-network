# Requirements: 诗人交际网

**Defined:** 2026-03-17
**Core Value:** 用户可以稳定、流畅地探索诗人关系图，并且线上看到的数据与本地发布版本一致。

## v1 Requirements

### Release Determinism

- [ ] **RELI-01**: 发布构建不会因为构建机器是否存在 `pipeline/source/chinese-poetry` 而生成不同规模的线上图谱数据
- [ ] **RELI-02**: 运行时只依赖 `public/graph.json` 和 `public/poems/*.json`，数据流水线不再生成未被前端消费的重复图谱模块

### Loading Robustness

- [ ] **LOAD-01**: 用户在图谱或诗作 JSON 加载成功、失败、回退三种路径下都能获得明确且一致的界面状态

### Testing

- [ ] **TEST-01**: 自动化测试覆盖图谱加载、诗作回退和 `Esc` / 弹层相关交互，避免后续回归

### Scene Performance

- [ ] **PERF-01**: 页面进入后台或不可见时，星图动画会暂停或显著减少无意义渲染工作
- [ ] **PERF-02**: 背景与前景 canvas 的动画调度被合并或协调，避免重复的永久渲染循环

## v2 Requirements

### Observability

- **OBS-01**: 为关键交互建立更明确的性能基准和回归检查脚本

### Data Expansion

- **DATA-01**: 支持更大规模的诗人图谱并保留当前可读性

## Out of Scope

| Feature | Reason |
|---------|--------|
| 重新设计整套视觉系统 | 当前工作优先稳定部署与运行时行为 |
| 新增后端 API / 数据库存储 | 当前产品仍以静态站点为发布目标 |
| 扩大数据抓取范围或改写关系抽取算法 | 先稳定现有数据链路，再考虑扩大范围 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RELI-01 | Phase 1 | Pending |
| RELI-02 | Phase 1 | Pending |
| LOAD-01 | Phase 1 | Pending |
| TEST-01 | Phase 1 | Pending |
| PERF-01 | Phase 2 | Pending |
| PERF-02 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after initial optimization planning*
