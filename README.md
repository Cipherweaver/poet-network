# 诗人交际网

一个以古诗词关系为核心的交互式星图。当前版本已经具备可重复运行的数据流水线：从 `pipeline/source` 原始诗歌样本生成前端图数据，再驱动星空主视图、赠诗/提及关系高亮、节点标签和侧边栏诗作展示。

## 开发

```bash
npm install
npm run dev
```

如果你修改了 `pipeline/source/sample`、`pipeline/source/aliases.json`、`pipeline/source/poets.json`，或者本地重新抓取了真实诗词数据，需要先显式刷新静态资产：

```bash
npm run build:data
```

然后把更新后的 `public/graph.json` 和 `public/poems/*.json` 一起提交。

## 真实数据

```bash
npm run fetch:poetry
npm run build:data -- --input ./pipeline/source/chinese-poetry --max-poets 80
```

说明：

- `pipeline/source/chinese-poetry/` 只是本地数据源缓存，不会进入仓库
- 发布版本实际使用的是仓库里的 `public/graph.json` 和 `public/poems/*.json`
- 如果你用真实数据重建图谱，需要把生成后的 `public` 资产提交到仓库

## 校验

```bash
npm run lint
npm run test
npm run build
```

## Vercel 发布

这个项目可以直接发布到 Vercel，当前仓库已经提供了 [vercel.json](./vercel.json)：

- 构建命令：`npm run build`
- 输出目录：`dist`

当前发布约定：

- `npm run build` 只做 TypeScript + Vite 构建，不会在 CI / Vercel 上隐式重跑数据流水线
- 如果图谱数据有变更，先在本地执行 `npm run build:data`
- 确认 `public/graph.json` 和 `public/poems/*.json` 已更新并提交后，再执行或依赖 `npm run build`

注意：

- 当前本机的 Git 根目录是 `C:\Users\14169`，不是这个项目目录
- 如果你想用 Vercel 的 Git 导入，建议把 `C:\Users\14169\poet-network` 单独作为一个 Git 仓库推到 GitHub
- 如果你直接在 Vercel 导入一个包含上级目录的大仓库，就需要在 Vercel 项目设置里把 `Root Directory` 设为 `poet-network`

最短发布路径：

1. 把 `poet-network` 单独推到 GitHub
2. 在 Vercel 里点击 `Add New... -> Project`
3. 选择这个 GitHub 仓库
4. 确认 `Build Command` 为 `npm run build`
5. 确认 `Output Directory` 为 `dist`
6. 点击 `Deploy`

## 当前实现

- `pipeline/build-data.mjs` 会把原始样本生成到 `public/graph.json` 和 `public/poems/*.json`
- `pipeline/fetch-chinese-poetry.mjs` 会稀疏拉取官方 `chinese-poetry` 仓库中的 `全唐诗` 和 `宋词`
- 当前流水线兼容 `author/title/paragraphs` 与 `author/rhythmic/paragraphs`
- 纯 Canvas 星空网络渲染，支持拖拽平移与景深式位移
- 节点名称常显，点击后高亮关联诗人与连线
- 右侧边栏展示当前诗人的关系诗作与说明
