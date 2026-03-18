# Phase 1: Release Consistency - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段只处理发布一致性、数据产物收敛、加载状态鲁棒性和对应测试。不会在这一阶段重做视觉设计、扩展诗词数据源，也不会系统性优化场景渲染性能。

</domain>

<decisions>
## Implementation Decisions

### Release asset contract
- 发布版本以仓库内的 `public/graph.json` 和 `public/poems/*.json` 为唯一运行时数据来源
- `npm run build` 不再隐式执行 `npm run build:data`
- 数据刷新由维护者显式执行 `npm run build:data`，然后提交更新后的 `public` 资产

### Data pipeline scope
- `pipeline/build-data.mjs` 只生成运行时实际使用的 JSON 产物
- 删除 `src/data/poetGraph.ts` 这条未被消费的生成链，并同步清理相关文档与测试断言

### Loading and modal state
- `App` 不再通过 `document.querySelector` 判断诗词全文弹层是否打开
- 全文弹层开闭状态通过显式 React 状态在 `Sidebar` 与 `App` 间传递
- 图谱与诗作加载继续保留失败回退，但状态表达要更明确、可测试

### Test strategy
- 在现有 Vitest 基础上补组件级测试
- 测试要覆盖图谱加载成功/失败、诗作回退、`Escape` 与全文弹层交互
- 如果现有测试栈不够，允许新增最小必要的 React 测试依赖

### Claude's Discretion
- 具体选择提取成 loader helper，还是保持在组件内但抽平逻辑
- 组件测试是集中在 `App.test.tsx` 还是拆分到 `Sidebar.test.tsx`
- 文案微调和细小的 UI 状态文案命名

</decisions>

<specifics>
## Specific Ideas

- 这次工作要先回答“这些优化有没有必要”，因此优先级必须体现为：发布一致性 > 加载鲁棒性与测试 > 渲染性能
- Phase 1 完成后，才值得继续投入 Scene 渲染优化

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Build and deploy contract
- `package.json` — 当前 `build` / `build:data` 脚本定义
- `README.md` — 当前部署与数据生成说明
- `.gitignore` — 真实数据源目录与发布产物的跟踪边界

### Data pipeline
- `pipeline/build-data.mjs` — 图谱与诗作静态资产生成入口
- `pipeline/lib/build-graph.mjs` — 生成图谱和诗作集合的核心逻辑
- `pipeline/lib/build-graph.test.mjs` — 现有流水线回归测试

### Runtime loading
- `src/App.tsx` — 图谱加载与 `Escape` 逻辑
- `src/components/Sidebar.tsx` — 诗作 JSON 加载与全文弹层状态
- `src/lib/poems.ts` — 诗作资源路径与回退数据构造
- `src/lib/poems.test.ts` — 现有诗作辅助函数测试

### Testing foundation
- `vite.config.ts` — 当前 Vite 配置，必要时承载 Vitest 组件测试环境
- `src/test/fixtureGraph.ts` — 现有前端测试夹具

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/test/fixtureGraph.ts`: 可直接用于组件测试里的图谱夹具
- `src/lib/poems.ts`: 已有 poem fallback 构造逻辑，适合继续复用
- `pipeline/lib/build-graph.test.mjs`: 已覆盖流水线核心行为，可在此基础上调整断言而不是重写测试

### Established Patterns
- 前端代码使用函数组件 + hooks，且测试目前以 Vitest 为主
- 数据加载采用 `fetch(...).then(...).catch(...)` + 本地状态管理，没有全局 store
- README 已明确把 Vercel 作为目标发布场景，因此构建合同必须面向静态部署

### Integration Points
- `package.json` 的构建脚本决定 Vercel 和本地发布行为
- `App` 与 `Sidebar` 之间的选中/弹层交互是这次状态整理的主要接口
- 流水线输出和 README 文档必须一起改，否则维护者会继续按旧方式操作

</code_context>

<deferred>
## Deferred Ideas

- 背景/前景 canvas 动画合并 — Phase 2
- 可见性监听与后台暂停策略 — Phase 2
- 更系统的性能 profiling 脚本 — Phase 2 或后续 OBS 工作

</deferred>

---

*Phase: 01-release-consistency*
*Context gathered: 2026-03-17*
