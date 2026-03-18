import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { buildFallbackPoems, buildPoemAssetPath } from '../lib/poems'
import type { PoetGraph, PoetPoemEntry } from '../types'

const poemCache = new Map<string, PoetPoemEntry[]>()
const DEFAULT_VISIBLE_COUNT = 10

type RelationFilter = 'featured' | 'gift' | 'mention'

type SidebarProps = {
  graph: PoetGraph
  onClose: () => void
  onPoemModalChange?: (isOpen: boolean) => void
  selectedId: string
}

export function Sidebar({ graph, onClose, onPoemModalChange, selectedId }: SidebarProps) {
  const poet = graph.poets.find((item) => item.id === selectedId) ?? graph.poets[0] ?? null
  const poetId = poet?.id
  const cachedPoems = poetId ? (poemCache.get(poetId) ?? null) : null
  const [remotePoems, setRemotePoems] = useState<PoetPoemEntry[] | null>(cachedPoems)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    cachedPoems ? 'ready' : 'loading',
  )
  const [activeFilter, setActiveFilter] = useState<RelationFilter>('featured')
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_COUNT)
  const [expandedPoem, setExpandedPoem] = useState<PoetPoemEntry | null>(null)
  const [isUnrolled, setIsUnrolled] = useState(false)

  useEffect(() => {
    if (!poetId) {
      return () => undefined
    }

    let cancelled = false

    if (cachedPoems) {
      return () => {
        cancelled = true
      }
    }

    fetch(buildPoemAssetPath(poetId))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load poems for ${poetId}`)
        }

        const payload = (await response.json()) as PoetPoemEntry[]

        if (cancelled) {
          return
        }

        poemCache.set(poetId, payload)
        setRemotePoems(payload)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [cachedPoems, poetId])

  useEffect(() => {
    if (!expandedPoem) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedPoem(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expandedPoem])

  useEffect(() => {
    onPoemModalChange?.(expandedPoem !== null)
  }, [expandedPoem, onPoemModalChange])

  useEffect(() => {
    return () => {
      onPoemModalChange?.(false)
    }
  }, [onPoemModalChange])

  const relations = useMemo(
    () => (poetId ? remotePoems ?? buildFallbackPoems(graph, poetId) : []),
    [graph, poetId, remotePoems],
  )
  const summary = useMemo(() => buildRelationSummary(relations), [relations])
  const filteredRelations = useMemo(() => {
    switch (activeFilter) {
      case 'gift':
        return relations.filter((relation) => relation.type === 'gift')
      case 'mention':
        return relations.filter((relation) => relation.type === 'mention')
      case 'featured':
      default:
        return relations.slice(0, 18)
    }
  }, [activeFilter, relations])
  const visibleRelations = filteredRelations.slice(0, visibleCount)
  const canLoadMore = visibleCount < filteredRelations.length
  const expandedPoemLines = useMemo(
    () => (expandedPoem ? getPoemBodyLines(expandedPoem) : []),
    [expandedPoem],
  )
  const expandedPoemColumns = useMemo(
    () => buildPoemColumns(expandedPoemLines),
    [expandedPoemLines],
  )
  const expandedPoemColumnHeight = useMemo(
    () => Math.max(...expandedPoemColumns.map((line) => line.length), 1),
    [expandedPoemColumns],
  )
  const shouldOfferUnroll = expandedPoemColumns.length > 7
  const counterpartHint = describeCounterpartIdentity(summary.topCounterpart)

  if (!poet) {
    return null
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <div className="sidebar-topbar" style={{ '--stagger': 0 } as CSSProperties}>
          <p className="panel-label">焦点诗人</p>
          <button aria-label="关闭详情" className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="sidebar-header" style={{ '--stagger': 1 } as CSSProperties}>
          <div>
            <h2>{poet.name}</h2>
            <p className="muted">
              {poet.dynasty} · {poet.notableWork}
            </p>
          </div>
          <span className="depth-tag">星深 {Math.round(poet.depth * 100)}</span>
        </div>

        <p className="spotlight" style={{ '--stagger': 2 } as CSSProperties}>
          {poet.spotlight}
        </p>

        <div className="meta-grid" style={{ '--stagger': 3 } as CSSProperties}>
          {poet.tags.map((tag, index) => (
            <span className="meta-pill" key={tag} style={{ '--item-index': index } as CSSProperties}>
              {tag}
            </span>
          ))}
        </div>

        <div className="summary-grid" style={{ '--stagger': 4 } as CSSProperties}>
          <article className="summary-card" style={{ '--item-index': 0 } as CSSProperties}>
            <span>重点往来</span>
            <strong>{summary.strongCount} 首</strong>
            <small>这位诗人与他人关联最紧的诗作数量</small>
          </article>
          <article className="summary-card" style={{ '--item-index': 1 } as CSSProperties}>
            <span>往来最多的人</span>
            <strong>{summary.topCounterpart}</strong>
            <small>共出现 {summary.topCounterpartCount} 首相关诗作</small>
          </article>
          <article className="summary-card" style={{ '--item-index': 2 } as CSSProperties}>
            <span>诗作分布</span>
            <strong>
              赠诗 {summary.giftCount} 首 / 提及 {summary.mentionCount} 首
            </strong>
            <small>这些都是当前诗人与他人的相关诗作统计</small>
          </article>
        </div>
        <p className="summary-caption" style={{ '--stagger': 4 } as CSSProperties}>
          这里的数字只统计当前选中诗人在图谱里的相关诗作，不是他的生平年表，也不是全部存世作品。
          {counterpartHint ? ` ${counterpartHint}` : ''}
        </p>

        <section className="sidebar-section" style={{ '--stagger': 5 } as CSSProperties}>
          <div className="section-title">
            <h3>关联诗作</h3>
            <span>{relations.length} 首</span>
          </div>
          {status === 'loading' ? <p className="sidebar-hint">正在加载该诗人的关联诗作…</p> : null}
          {status === 'error' ? <p className="sidebar-hint">诗作文件加载失败，已回退到图谱内嵌摘要。</p> : null}
          <div className="filter-row">
            {[
              { id: 'featured', label: '精选' },
              { id: 'gift', label: '赠诗' },
              { id: 'mention', label: '提及' },
            ].map((filter) => (
              <button
                className={`filter-pill ${activeFilter === filter.id ? 'is-active' : ''}`}
                key={filter.id}
                onClick={() => {
                  setActiveFilter(filter.id as RelationFilter)
                  setExpandedPoem(null)
                  setVisibleCount(DEFAULT_VISIBLE_COUNT)
                }}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="relation-list">
            {visibleRelations.map((relation, index) => {
              return (
                <article
                  className="relation-card"
                  key={relation.relationId}
                  style={{ '--item-index': index } as CSSProperties}
                >
                  <button
                    className="relation-card-button"
                    onClick={() => {
                      setIsUnrolled(false)
                      setExpandedPoem(relation)
                    }}
                    type="button"
                  >
                    <div className="relation-header">
                      <span className={`relation-type ${relation.type}`}>{relation.typeLabel}</span>
                      <strong>{relation.poemTitle}</strong>
                    </div>
                    <div className="relation-strength">
                      <span>{relation.type === 'gift' ? '赠答诗作' : '诗中提及'}</span>
                      {index < 3 && activeFilter === 'featured' ? <span>优先阅读</span> : null}
                      <span>点击展开全文</span>
                    </div>
                    <p className="relation-target">
                      {relation.direction === 'outgoing' ? '写给' : '来自'}
                      {relation.counterpartName}
                    </p>
                    <blockquote>{relation.excerpt}</blockquote>
                    <p className="relation-note">{buildPoemBackdrop(relation, poet.name)}</p>
                  </button>
                </article>
              )
            })}
          </div>
          {canLoadMore ? (
            <button
              className="load-more-button"
              onClick={() => setVisibleCount((count) => count + DEFAULT_VISIBLE_COUNT)}
              style={{ '--stagger': 6 } as CSSProperties}
              type="button"
            >
              继续展开 {Math.min(DEFAULT_VISIBLE_COUNT, filteredRelations.length - visibleCount)} 首
            </button>
          ) : null}
        </section>
      </div>
      {expandedPoem ? (
        <div
          aria-hidden={false}
          className="poem-modal-backdrop"
          onClick={() => setExpandedPoem(null)}
        >
          <article
            aria-label={expandedPoem.poemTitle}
            className={`poem-modal ${isUnrolled ? 'is-unrolled' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="poem-modal-topbar">
              <button
                aria-label="关闭诗词全文"
                className="close-button"
                onClick={() => setExpandedPoem(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="poem-modal-body">
              <div
                className={`poem-scroll poem-calligraphy-sheet ${isUnrolled ? 'is-unrolled' : 'is-collapsed'}`}
                key={expandedPoem.relationId}
              >
                {shouldOfferUnroll ? (
                  <button
                    className={`poem-unroll-button ${isUnrolled ? 'is-active' : ''}`}
                    onClick={() => setIsUnrolled((value) => !value)}
                    type="button"
                  >
                    <span>{isUnrolled ? '合卷' : '展卷'}</span>
                  </button>
                ) : null}
                <div className="poem-scroll-columns">
                  {expandedPoemColumns.map((line, lineIndex) => (
                    <p
                      className="poem-line"
                      key={`${expandedPoem.relationId}-${lineIndex}`}
                      style={
                        {
                          '--line-cells': expandedPoemColumnHeight,
                        } as CSSProperties
                      }
                    >
                      {line.map((glyph, glyphIndex) => (
                        <span
                          className={`poem-glyph ${isSpacerGlyph(glyph) ? 'is-spacer' : ''}`}
                          key={`${expandedPoem.relationId}-${lineIndex}-${glyphIndex}`}
                          style={
                            {
                              '--glyph-delay': `${lineIndex * 140 + glyphIndex * 72}ms`,
                            } as CSSProperties
                          }
                        >
                          {glyph}
                        </span>
                      ))}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </aside>
  )
}

function getPoemBodyLines(poem: PoetPoemEntry) {
  const fullText = poem.fullText?.split('\n').flatMap(splitDisplayLine).filter(Boolean)

  if (fullText && fullText.length > 0) {
    return fullText
  }

  return splitDisplayLine(poem.excerpt)
}

function buildRelationSummary(relations: PoetPoemEntry[]) {
  const strongCount = relations.filter((relation) => relation.intensity >= 0.9).length
  const giftCount = relations.filter((relation) => relation.type === 'gift').length
  const mentionCount = relations.length - giftCount
  const counterpartCounts = new Map<string, number>()

  for (const relation of relations) {
    counterpartCounts.set(
      relation.counterpartName,
      (counterpartCounts.get(relation.counterpartName) ?? 0) + 1,
    )
  }

  const [topCounterpart = '暂无', topCounterpartCount = 0] =
    [...counterpartCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? []

  return {
    giftCount,
    mentionCount,
    strongCount,
    topCounterpart,
    topCounterpartCount,
  }
}

function splitDisplayLine(line: string) {
  const normalized = normalizePoemLine(line)

  if (!normalized) {
    return []
  }

  const parts = normalized
    .split(/[，。！？；：、】【]/g)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length > 1) {
    return parts
  }

  const displayLine = stripDisplayPunctuation(normalized)

  if (!displayLine) {
    return []
  }

  if (displayLine.length <= 14) {
    return [displayLine]
  }

  return chunkPoemLine(displayLine, 10)
}

function splitDisplayGlyphs(line: string) {
  return Array.from(stripDisplayPunctuation(line).replace(/\s+/g, '').trim()).filter(Boolean)
}

function isSpacerGlyph(glyph: string) {
  return glyph === '　'
}

function normalizePoemLine(line: string) {
  return line.replace(/\s+/g, '').trim()
}

function stripDisplayPunctuation(line: string) {
  return line.replace(/[，。！？；：、】【]/g, '')
}

function chunkPoemLine(line: string, chunkSize: number) {
  const glyphs = Array.from(line)
  const chunks = []

  for (let index = 0; index < glyphs.length; index += chunkSize) {
    chunks.push(glyphs.slice(index, index + chunkSize).join(''))
  }

  return chunks
}

function buildPoemColumns(lines: string[]) {
  const columns = lines.map((line) => splitDisplayGlyphs(line))
  const maxLength = Math.max(...columns.map((line) => line.length), 1)

  return columns.map((line) => [...line, ...Array.from({ length: maxLength - line.length }, () => '　')])
}

function buildPoemBackdrop(poem: PoetPoemEntry, poetName: string) {
  const speaker = poem.direction === 'outgoing' ? poetName : poem.counterpartName
  const addressee = poem.direction === 'outgoing' ? poem.counterpartName : poetName
  const scene = describePoemScene(poem.poemTitle)
  const counterpartIdentity = describeCounterpartIdentity(poem.counterpartName)
  const speakerLabel = formatCounterpartReference(speaker)
  const addresseeLabel = formatCounterpartReference(addressee)
  const readingHint = buildReadingHint(poem.poemTitle, poem.type)

  if (poem.type === 'gift') {
    return `《${poem.poemTitle}》可以看作一条从 ${speakerLabel} 指向 ${addresseeLabel} 的高强度通信，它发生在${scene}。${readingHint}${counterpartIdentity ? ` ${counterpartIdentity}` : ''}`
  }

  return `《${poem.poemTitle}》属于 ${speakerLabel} 与 ${addresseeLabel} 之间的间接信号，它更像是在${scene}里提到对方、回应对方，或借对方展开当时的情绪场。${readingHint}${counterpartIdentity ? ` ${counterpartIdentity}` : ''}`
}

function describePoemScene(title: string) {
  if (/送|别|饯/.test(title)) {
    return '离场时刻'
  }

  if (/寄/.test(title)) {
    return '远距通信阶段'
  }

  if (/酬|和|答|次韵|奉和|复用韵/.test(title)) {
    return '双向回声阶段'
  }

  if (/怀|忆|思|念/.test(title)) {
    return '记忆回放阶段'
  }

  if (/哭|挽|哀/.test(title)) {
    return '低频悼念阶段'
  }

  if (/题|咏/.test(title)) {
    return '场景取样阶段'
  }

  if (/同|陪|过|访|会|宴|饮|游|登/.test(title)) {
    return '共处现场'
  }

  if (/归|还|发|行/.test(title)) {
    return '迁移途中'
  }

  return '关系建立的现场'
}

function buildReadingHint(title: string, type: PoetPoemEntry['type']) {
  if (/送|别|饯/.test(title)) {
    return '先锁定谁离开、谁留下，再看情绪峰值落在哪些景物上。'
  }

  if (/酬|和|答|次韵|奉和|复用韵/.test(title)) {
    return '先看它在回应谁，再看哪些句子是在接住对方的话头。'
  }

  if (/寄/.test(title)) {
    return '先看发送对象，再看思念和处境是如何被逐层展开的。'
  }

  if (/怀|忆|思|念/.test(title)) {
    return '留意回忆对象，以及景物是怎样替情绪发声的。'
  }

  if (type === 'mention') {
    return '留意对方出现在哪一句，关系信号通常藏在叙事转折或景物联想里。'
  }

  return '先看题目给出的场景，再看人物关系如何落到具体诗句里。'
}

function formatCounterpartReference(name: string) {
  return classifyCounterpart(name) === 'person' ? name : `“${name}”`
}

function describeCounterpartIdentity(name: string) {
  switch (classifyCounterpart(name)) {
    case 'title':
      return `这里的“${name}”更像诗句里的称谓，暂时还不能稳定映射到实名人物。`
    case 'office':
      return `这里的“${name}”更接近身份标签，不是可直接确认的实名。`
    case 'unknown':
      return `原诗没有留下更明确的人名，所以这里只能沿用文本里的称呼。`
    case 'person':
    default:
      return ''
  }
}

function classifyCounterpart(name: string) {
  if (!name || /不详|未详|无名氏/.test(name)) {
    return 'unknown'
  }

  if (/太守|使君|刺史|侍郎|郎中|主簿|县令|学士|少府|司马|尚书|御史|知州|太史/.test(name)) {
    return 'office'
  }

  if (/少年|老农|渔父|樵夫|山人|道人|居士|僧|上人|处士|故人|友人|主人|宾客|云水|天然/.test(name)) {
    return 'title'
  }

  return 'person'
}
