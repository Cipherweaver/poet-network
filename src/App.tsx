import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { Sidebar } from './components/Sidebar'
import { PoetScene } from './components/PoetScene'
import { getConnectedPoetIds, resolveVisiblePoets } from './lib/graph'
import type { PoetGraph } from './types'

function App() {
  const [graph, setGraph] = useState<PoetGraph | null>(null)
  const [graphStatus, setGraphStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [poemModalOpen, setPoemModalOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  const selectedPoet = useMemo(
    () => graph?.poets.find((poet) => poet.id === selectedId) ?? null,
    [graph, selectedId],
  )
  const dynastyLabel = useMemo(
    () =>
      graph
        ? [...new Set(graph.poets.map((poet) => normalizeDynastyLabel(poet.dynasty)))].join(' · ')
        : '古典诗词',
    [graph],
  )

  const connectedIds = useMemo(
    () =>
      graph && selectedId ? getConnectedPoetIds(graph.relations, selectedId) : new Set<string>(),
    [graph, selectedId],
  )
  const searchResults = useMemo(
    () =>
      graph && searchQuery.trim()
        ? resolveVisiblePoets(graph.poets, searchQuery).slice(0, 6)
        : [],
    [graph, searchQuery],
  )

  const activeName = hoveredId
    ? graph?.poets.find((poet) => poet.id === hoveredId)?.name
    : selectedPoet?.name
  const shouldShowSearchResults =
    isSearchFocused && graphStatus === 'ready' && searchQuery.trim().length > 0

  useEffect(() => {
    let cancelled = false

    fetch('/graph.json')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to load graph data.')
        }

        const payload = (await response.json()) as PoetGraph

        if (cancelled) {
          return
        }

        setGraph(payload)
        setGraphStatus('ready')
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        setGraphStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !poemModalOpen) {
        setPoemModalOpen(false)
        setSelectedId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [poemModalOpen])

  function handleSelect(poetId: string) {
    setPoemModalOpen(false)
    setHoveredId(null)
    setSelectedId(poetId)
  }

  function handleSearchSelect(poetId: string) {
    const poet = graph?.poets.find((item) => item.id === poetId) ?? null

    setPoemModalOpen(false)
    setHoveredId(null)
    setSelectedId(poetId)
    setSearchQuery(poet?.name ?? '')
    setIsSearchFocused(false)
  }

  return (
    <main className={`app-shell ${selectedId ? 'has-selection' : ''} ${graphStatus === 'ready' ? 'is-ready' : ''}`}>
      {graph ? (
        <PoetScene
          graph={graph}
          hoveredId={hoveredId}
          onHover={setHoveredId}
          onClear={() => {
            setPoemModalOpen(false)
            setSelectedId(null)
          }}
          onSelect={handleSelect}
          selectedId={selectedId}
        />
      ) : (
        <section className="scene scene-loading" />
      )}

      <header className={`hud intro-card ${selectedPoet ? 'is-compact' : ''}`}>
        {selectedPoet ? (
          <>
            <p className="eyebrow">聚焦节点</p>
            <div className="intro-compact-row">
              <strong className="intro-focus-name">{selectedPoet.name}</strong>
              <span className="intro-focus-tag">
                {normalizeDynastyLabel(selectedPoet.dynasty)} · {connectedIds.size} 条关联
              </span>
            </div>
            <p className="intro-focus-note">{selectedPoet.notableWork}</p>
          </>
        ) : (
          <>
            <p className="eyebrow">{dynastyLabel} 关系光谱球</p>
            <p className="intro-copy">
              {graphStatus === 'error'
                ? '图谱数据加载失败，请刷新后重试。'
                : '把这颗发光球体当成一枚正在运转的人物关系引擎。悬停是预览，点击是锁定，人物与诗作会沿着光链展开。'}
            </p>
            <p className="intro-hint">
              {graphStatus === 'loading'
                ? '正在同步实名诗人网络…'
                : '左/右键拖动球体，滚轮缩放，点击光点锁定人物，按 `Esc` 退回全景。'}
            </p>
          </>
        )}
        <p className={`intro-hint ${selectedPoet ? 'is-compact' : ''}`}>
          {selectedPoet ? '拖动球体继续巡航，或继续搜索其他作者并切换侧栏。' : '输入作者名后可直接锁定光点并展开人物详情。'}
        </p>
      </header>

      <section className="hud search-dock">
        <div className="intro-search">
          <div className="intro-search-header">
            <span className="intro-search-title">搜索作者</span>
            <span className="intro-search-caption">
              {graphStatus === 'ready' ? '输入姓名后直接定位到光点' : '图谱载入后可搜索'}
            </span>
          </div>
          <form
            className="intro-search-form"
            onSubmit={(event) => {
              event.preventDefault()

              if (searchResults[0]) {
                handleSearchSelect(searchResults[0].id)
              }
            }}
          >
            <input
              aria-label="搜索作者名"
              autoComplete="off"
              className="intro-search-input"
              disabled={graphStatus !== 'ready'}
              onBlur={() => setIsSearchFocused(false)}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setIsSearchFocused(true)
              }}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  setIsSearchFocused(false)
                  setSearchQuery('')
                }
              }}
              placeholder="输入作者名，例如 李白"
              type="search"
              value={searchQuery}
            />
            <button
              className="intro-search-submit"
              disabled={graphStatus !== 'ready' || searchResults.length === 0}
              type="submit"
            >
              定位
            </button>
          </form>
          {shouldShowSearchResults ? (
            <div className="intro-search-results">
              {searchResults.length > 0 ? (
                searchResults.map((poet) => (
                  <button
                    className="intro-search-result"
                    key={poet.id}
                    onClick={() => handleSearchSelect(poet.id)}
                    onMouseDown={(event) => event.preventDefault()}
                    type="button"
                  >
                    <strong>{poet.name}</strong>
                    <span>
                      {normalizeDynastyLabel(poet.dynasty)} · {poet.notableWork}
                    </span>
                  </button>
                ))
              ) : (
                <p className="intro-search-empty">没有找到对应作者，试试更完整的人名。</p>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section className={`hud hover-chip ${activeName ? 'is-visible' : ''}`}>
        <div className="hover-chip-inner">
          <span className="hover-kicker">{hoveredId ? '悬停节点' : '当前聚焦'}</span>
          <strong>{activeName ?? '未选中'}</strong>
          <small>{selectedId ? `${connectedIds.size} 条邻接关系已点亮` : '点击光点展开人物细节'}</small>
        </div>
      </section>

      {selectedPoet ? (
        <Sidebar
          graph={graph!}
          key={selectedPoet.id}
          onClose={() => {
            setPoemModalOpen(false)
            setSelectedId(null)
          }}
          onPoemModalChange={setPoemModalOpen}
          selectedId={selectedPoet.id}
        />
      ) : null}
    </main>
  )
}

export default App

function normalizeDynastyLabel(value: string) {
  const normalized = value.trim()
  const lower = normalized.toLowerCase()

  switch (lower) {
    case 'tang':
      return '唐'
    case 'song':
      return '宋'
    case 'yuan':
      return '元'
    case 'han':
      return '汉'
    case 'qing':
      return '清'
    case 'xianqin':
      return '先秦'
    default:
      return normalized || '未详'
  }
}
