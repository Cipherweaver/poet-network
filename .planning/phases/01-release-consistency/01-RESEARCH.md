# Phase 1: Release Consistency - Research

**Researched:** 2026-03-17
**Scope:** 发布一致性、数据产物收敛、加载鲁棒性、测试缺口

## Key Findings

### 1. 发布结果目前依赖本地环境

- `package.json` 的 `build` 先执行 `npm run build:data`
- `pipeline/build-data.mjs` 会根据本地是否存在 `pipeline/source/chinese-poetry` 自动在真实数据与 sample 数据之间切换
- `pipeline/source/chinese-poetry/` 被 `.gitignore` 排除，因此远端构建环境默认无法保证得到与本机相同的数据规模

### 2. 运行时与生成链存在重复产物

- 运行时只通过 `fetch('/graph.json')` 和 `fetch('/poems/...')` 使用 `public` 目录资产
- 流水线额外生成 `src/data/poetGraph.ts`，但仓库当前没有地方引用该模块
- 重复产物会增加构建复杂度，并让“哪份数据才是发布真相”变得含糊

### 3. 加载与键盘行为有脆弱耦合

- `App` 在 `Escape` 逻辑中使用 `document.querySelector('.poem-modal-backdrop')` 判断全文弹层是否打开
- `Sidebar` 自己维护全文弹层状态，没有显式把这个状态上抛到 `App`
- 这类 DOM 查询对类名、结构和未来重构都比较敏感

### 4. 自动化测试集中在纯函数，缺少组件回归保护

- `graph` 和 `poems` 辅助函数已有 Vitest 测试
- `App` / `Sidebar` / 关键 UI 行为没有组件级测试
- 如果 Phase 1 要修复加载与键盘行为，需要同时补测试，否则回归风险高

## Recommendation

1. 把 `public/graph.json` 与 `public/poems/*.json` 视为发布合同，构建阶段默认只打包前端，不隐式重建数据
2. 将 `build-data` 改为显式维护者命令，只生成运行时会消费的 JSON 产物
3. 用显式 React 状态替换 DOM 查询的弹层判断，并建立组件级测试覆盖关键加载与交互路径

---
*Phase: 01-release-consistency*
*Research gathered from current repository state*
