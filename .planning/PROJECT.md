# 诗人交际网

## What This Is

一个基于 Vite + React 的古典诗词关系可视化项目，用球形星图展示诗人之间的赠答、提及与关联诗作。它的主要用户是希望快速浏览诗人关系、并从具体诗作回到人物网络的中文互联网读者。

## Core Value

用户可以稳定、流畅地探索诗人关系图，并且线上看到的数据与本地发布版本一致。

## Requirements

### Validated

- ✓ 用户可以在浏览器中查看诗人关系星图并进行悬停、选中和缩放交互 — existing
- ✓ 用户可以搜索作者并打开侧栏查看关联诗作摘要与全文弹层 — existing
- ✓ 项目可以从样本数据或本地诗词数据源生成前端图谱 JSON — existing

### Active

- [ ] 发布构建必须使用确定的静态图谱资源，不能因为构建机器是否存在本地数据源而产出不同结果
- [ ] 数据流水线只生成运行时真正使用的资产，移除未被消费的重复产物
- [ ] 图谱与诗作加载逻辑需要显式状态管理和回退路径，不依赖 DOM 查询推断 UI 状态
- [ ] 为关键加载和键盘交互补齐自动化测试
- [ ] 后续降低场景持续渲染成本，但不改变当前视觉风格和核心交互

### Out of Scope

- 全新视觉改版 — 当前工作聚焦稳定性、可发布性和性能，不重做界面语言
- 扩充新的诗词抓取源或关系识别算法 — 先稳定现有发布链路和运行时行为
- 引入后端服务或在线数据库 — 当前站点仍保持静态站点部署模型

## Context

- 当前 `npm run build` 会先运行 `npm run build:data`，而 `build-data` 是否使用真实数据依赖本地是否存在 `pipeline/source/chinese-poetry`
- 运行时只读取 `public/graph.json` 和 `public/poems/*.json`，但流水线还会生成 `src/data/poetGraph.ts`
- `App` 的 `Esc` 行为目前通过查询 `.poem-modal-backdrop` 来判断全文弹层是否打开，这属于跨组件的隐式状态耦合
- 现有测试覆盖了图算法和流水线纯函数，但 `App`、`Sidebar`、`PoetScene` 的关键交互几乎没有组件级测试
- 当前项目规模不大，代码结构清晰，适合在不引入大范围重构的前提下先解决发布一致性和加载鲁棒性

## Constraints

- **Deployment**: 继续兼容静态托管和 Vercel 输出 `dist` — 不能把当前项目改造成依赖运行时后端的系统
- **Tech stack**: 保持 React + Vite + TypeScript 现有栈 — 只在测试或运行时鲁棒性上做最小必要补充
- **Data ownership**: 真实诗词源目录 `pipeline/source/chinese-poetry/` 不纳入仓库 — 发布方案必须在没有该目录时仍然确定
- **UX continuity**: 不能破坏现有星图视觉、交互语义和侧栏阅读路径 — 优化应以无感改进为主

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 先处理发布一致性，再处理渲染性能 | 线上结果不确定会直接影响部署可信度，优先级高于性能打磨 | — Pending |
| 将 `public/graph.json` / `public/poems/*.json` 作为发布时的唯一数据输入 | 运行时已经依赖这些静态资产，最容易形成可复现构建 | — Pending |
| 把加载和弹层开闭改为显式 React 状态并补测试 | 当前 DOM 查询方式脆弱，且没有测试保护 | — Pending |

---
*Last updated: 2026-03-17 after optimization planning bootstrap*
