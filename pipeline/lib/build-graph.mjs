import { promises as fs } from 'node:fs'
import path from 'node:path'

const GIFT_TITLE_PATTERN = /赠|贈|寄|酬|和|答|送|别|遙有此寄|遥有此寄/u
const TITLE_TARGET_PATTERN = /(?:赠|贈|寄|酬|和|答|送|别|怀|懷|忆|憶|梦|夢|哭|题|題|访|訪)([\p{Script=Han}]{1,8})/gu
const MAX_MENTION_MATCHES = 4
const DYNASTY_PATH_PATTERNS = [
  ['五代诗词', '五代'],
  ['元曲', '元'],
  ['全唐诗', '唐'],
  ['御定全唐詩', '唐'],
  ['全宋诗', '宋'],
  ['宋词', '宋'],
  ['楚辞', '先秦'],
  ['诗经', '先秦'],
  ['曹操诗集', '汉'],
  ['纳兰性德', '清'],
  ['song', '宋'],
  ['tang', '唐'],
]

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/gu, '').trim()
}

function normalizeDynastyLabel(value) {
  const normalized = normalizeText(value)
  const lower = normalized.toLowerCase()
  const aliases = new Map([
    ['tang', '唐'],
    ['song', '宋'],
    ['yuan', '元'],
    ['han', '汉'],
    ['qing', '清'],
    ['xianqin', '先秦'],
    ['五代', '五代'],
    ['先秦', '先秦'],
    ['唐', '唐'],
    ['宋', '宋'],
    ['元', '元'],
    ['汉', '汉'],
    ['清', '清'],
  ])

  return aliases.get(lower) ?? aliases.get(normalized) ?? (normalized || '未详')
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function hashString(value) {
  let hash = 0

  for (const char of value) {
    hash = (hash * 31 + char.codePointAt(0)) % 2147483647
  }

  return hash
}

function slugifyName(name) {
  return normalizeText(name)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

function inferDynasty(filePath, poem) {
  if (poem.dynasty) {
    return normalizeDynastyLabel(poem.dynasty)
  }

  const normalizedPath = filePath.toLowerCase()

  for (const [pattern, dynasty] of DYNASTY_PATH_PATTERNS) {
    if (normalizedPath.includes(pattern.toLowerCase())) {
      return dynasty
    }
  }

  return normalizeDynastyLabel('未详')
}

function resolveTitle(row) {
  return normalizeText(row.title || row.rhythmic || row.name || '')
}

function resolveParagraphs(row) {
  if (Array.isArray(row.paragraphs)) {
    return row.paragraphs.map((paragraph) => normalizeText(paragraph)).filter(Boolean)
  }

  if (Array.isArray(row.content)) {
    return row.content.map((paragraph) => normalizeText(paragraph)).filter(Boolean)
  }

  return []
}

function relationTypeForTitle(title) {
  return GIFT_TITLE_PATTERN.test(title) ? 'gift' : 'mention'
}

function relationLabel(type) {
  return type === 'gift' ? '赠诗' : '提及'
}

function relationNote(source, target, title, type) {
  if (type === 'gift') {
    return `${source}在《${title}》里把信息直接发向${target}，这是一条强度更高的直连关系。`
  }

  return `${source}在《${title}》里提到${target}，形成一条可追踪的间接连接。`
}

function poemExcerpt(paragraphs) {
  const excerpt = normalizeText(paragraphs.find(Boolean) ?? '')
  return excerpt.slice(0, 18)
}

function poemFullText(paragraphs) {
  return paragraphs.map((paragraph) => normalizeText(paragraph)).filter(Boolean).join('\n')
}

function knownTokensForAuthor(author, aliases) {
  return [author, ...(aliases[author] ?? [])]
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function buildAliasToAuthorMap(aliases) {
  const aliasToAuthor = new Map()

  for (const [author, rawAliases] of Object.entries(aliases)) {
    const canonicalAuthor = normalizeText(author)

    if (!canonicalAuthor || !Array.isArray(rawAliases)) {
      continue
    }

    for (const alias of rawAliases) {
      const normalizedAlias = normalizeText(alias)

      if (normalizedAlias && !aliasToAuthor.has(normalizedAlias)) {
        aliasToAuthor.set(normalizedAlias, canonicalAuthor)
      }
    }
  }

  return aliasToAuthor
}

function resolveCanonicalAuthorName(author, catalogByName, aliasToAuthor) {
  const normalizedAuthor = normalizeText(author)

  if (!normalizedAuthor) {
    return ''
  }

  if (catalogByName.has(normalizedAuthor)) {
    return normalizedAuthor
  }

  const aliasedAuthor = aliasToAuthor.get(normalizedAuthor)
  return aliasedAuthor && catalogByName.has(aliasedAuthor) ? aliasedAuthor : normalizedAuthor
}

function buildAuthorLookup(knownAuthors, aliases) {
  const tokenToAuthors = new Map()
  const tokenLengths = new Set()

  for (const author of knownAuthors) {
    for (const token of knownTokensForAuthor(author, aliases)) {
      if (token.length < 2) {
        continue
      }

      tokenLengths.add(token.length)
      const authors = tokenToAuthors.get(token) ?? new Set()
      authors.add(author)
      tokenToAuthors.set(token, authors)
    }
  }

  return {
    tokenLengths: [...tokenLengths].sort((left, right) => right - left),
    tokenToAuthors,
  }
}

function findAuthorsInText(text, lookup, excludeAuthor, maxMatches = MAX_MENTION_MATCHES) {
  const normalizedText = normalizeText(text)
  const matches = new Set()

  for (let index = 0; index < normalizedText.length; index += 1) {
    for (const length of lookup.tokenLengths) {
      const token = normalizedText.slice(index, index + length)
      const authors = lookup.tokenToAuthors.get(token)

      if (!authors) {
        continue
      }

      for (const author of authors) {
        if (author !== excludeAuthor) {
          matches.add(author)
        }
      }

      if (matches.size >= maxMatches) {
        return [...matches]
      }
    }
  }

  return [...matches]
}

function extractTargetsFromTitle(title, lookup, excludeAuthor) {
  const matches = new Set()

  for (const match of title.matchAll(TITLE_TARGET_PATTERN)) {
    const candidate = normalizeText(match[1])

    for (const author of findAuthorsInText(candidate, lookup, excludeAuthor, 2)) {
      matches.add(author)
    }
  }

  if (matches.size > 0) {
    return [...matches]
  }

  return findAuthorsInText(title, lookup, excludeAuthor, 2)
}

function resolveTargetAuthors(poem, lookup) {
  const titleMatches = extractTargetsFromTitle(poem.title, lookup, poem.author)
  const bodyMatches = findAuthorsInText(poem.paragraphs.join(''), lookup, poem.author)

  return [...new Set([...titleMatches, ...bodyMatches])]
}

function scoreRelation(poem, target, type, aliases) {
  const title = normalizeText(poem.title)
  const text = poem.paragraphs.map((paragraph) => normalizeText(paragraph)).join('')
  const tokens = knownTokensForAuthor(target, aliases)
  const titleHit = tokens.some((token) => title.includes(token))
  const textHit = tokens.some((token) => text.includes(token))
  const base = type === 'gift' ? 0.76 : 0.58

  return clamp(
    base + (titleHit ? 0.16 : 0) + (textHit ? 0.08 : 0) + Math.min(text.length / 240, 0.06),
    0.4,
    0.99,
  )
}

function ringCapacity(ringIndex) {
  return ringIndex === 0 ? 1 : 6 + (ringIndex - 1) * 5
}

function resolveRingPlacement(index) {
  let remaining = index
  let ringIndex = 0

  while (remaining >= ringCapacity(ringIndex)) {
    remaining -= ringCapacity(ringIndex)
    ringIndex += 1
  }

  return {
    ringIndex,
    slotCount: ringCapacity(ringIndex),
    slotIndex: remaining,
  }
}

function layoutPoetNodes(poets, poetStats, relationCounts) {
  const dynasties = [...new Set(poets.map((poet) => poet.dynasty))]
  const maxPoemCount = Math.max(...poets.map((poet) => poetStats.get(poet.id)?.poemCount ?? 1), 1)
  const maxDegree = Math.max(...poets.map((poet) => relationCounts.get(poet.id) ?? 1), 1)
  const dynastyCenters = new Map(
    dynasties.map((dynasty, index) => {
      if (dynasties.length === 1) {
        return [dynasty, { angle: -Math.PI / 2, x: 0, y: 0 }]
      }

      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / dynasties.length
      const radiusX = dynasties.length <= 3 ? 0.34 : 0.5
      const radiusY = dynasties.length <= 3 ? 0.22 : 0.36

      return [
        dynasty,
        {
          angle,
          x: Math.cos(angle) * radiusX,
          y: Math.sin(angle) * radiusY,
        },
      ]
    }),
  )
  const scoredPoets = poets.map((poet) => {
    const stats = poetStats.get(poet.id)
    const degree = relationCounts.get(poet.id) ?? 0
    const fame = clamp(
      0.34 +
        ((stats?.poemCount ?? 1) / maxPoemCount) * 0.42 +
        (degree / maxDegree) * 0.24,
      0.35,
      0.99,
    )
    const hash = hashString(poet.id)

    return {
      degree,
      fame,
      hash,
      poet,
    }
  })

  const dynastyBuckets = new Map(
    dynasties.map((dynasty) => [
      dynasty,
      scoredPoets
        .filter((entry) => entry.poet.dynasty === dynasty)
        .sort((left, right) => right.fame - left.fame || right.degree - left.degree),
    ]),
  )

  return dynasties
    .flatMap((dynasty) => {
      const cluster = dynastyCenters.get(dynasty) ?? { angle: -Math.PI / 2, x: 0, y: 0 }
      const entries = dynastyBuckets.get(dynasty) ?? []

      return entries.map((entry, groupIndex) => {
        const { degree, fame, hash, poet } = entry
        const placement = resolveRingPlacement(groupIndex)
        const jitterX = (((hash >> 3) % 13) - 6) / 140
        const jitterY = (((hash >> 7) % 13) - 6) / 140
        const ringRadius =
          placement.ringIndex === 0
            ? 0
            : 0.16 +
              placement.ringIndex * 0.13 +
              (1 - fame) * 0.04 +
              ((hash % 17) - 8) / 240
        const localAngle =
          placement.slotCount === 1
            ? cluster.angle
            : cluster.angle * 0.45 +
              (Math.PI * 2 * placement.slotIndex) / placement.slotCount +
              ((hash % 100) / 100) * 0.3

        return {
          ...poet,
          depth: clamp(
            0.42 + fame * 0.42 - placement.ringIndex * 0.035 + (((hash >> 11) % 13) - 6) / 120,
            0.32,
            0.95,
          ),
          fame: Number(fame.toFixed(2)),
          position: {
            x: Number(
              clamp(cluster.x + Math.cos(localAngle) * ringRadius * 1.08 + jitterX, -1.08, 1.08).toFixed(2),
            ),
            y: Number(
              clamp(cluster.y + Math.sin(localAngle) * ringRadius * 0.88 + jitterY, -0.92, 0.92).toFixed(2),
            ),
          },
        }
      })
    })
    .sort((left, right) => right.fame - left.fame)
}

async function listJsonFiles(inputDir) {
  const entries = await fs.readdir(inputDir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(inputDir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(fullPath)))
      continue
    }

    if (entry.isFile() && fullPath.endsWith('.json')) {
      files.push(fullPath)
    }
  }

  return files.sort()
}

export async function loadPoemsFromDirectory(inputDir, limit = Number.POSITIVE_INFINITY) {
  const jsonFiles = await listJsonFiles(inputDir)
  const poems = []

  for (const filePath of jsonFiles) {
    const contents = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(contents)
    const rows = Array.isArray(parsed) ? parsed : []

    for (const row of rows) {
      const author = normalizeText(row.author)
      const title = resolveTitle(row)
      const paragraphs = resolveParagraphs(row)

      if (!author || !title || paragraphs.length === 0) {
        continue
      }

      poems.push({
        author,
        dynasty: inferDynasty(filePath, row),
        paragraphs,
        title,
      })

      if (poems.length >= limit) {
        return poems
      }
    }
  }

  return poems
}

export function buildPoetGraph(poems, options = {}) {
  const aliases = options.aliases ?? {}
  const knownPoets = (options.knownPoets ?? []).map((poet) => ({
    ...poet,
    dynasty: normalizeDynastyLabel(poet.dynasty),
  }))
  const maxPoets = options.maxPoets ?? 24
  const catalogByName = new Map(knownPoets.map((poet) => [poet.name, poet]))
  const aliasToAuthor = buildAliasToAuthorMap(aliases)
  const normalizedPoems = poems
    .map((poem) => ({
      ...poem,
      author: resolveCanonicalAuthorName(poem.author, catalogByName, aliasToAuthor),
    }))
    .filter((poem) => poem.author)
  const usablePoems =
    catalogByName.size > 0
      ? normalizedPoems.filter((poem) => catalogByName.has(poem.author))
      : normalizedPoems
  const authorStats = new Map()

  for (const poem of usablePoems) {
    const existing = authorStats.get(poem.author) ?? {
      dynasty: normalizeDynastyLabel(poem.dynasty),
      poemCount: 0,
      sampleTitle: poem.title,
    }

    existing.poemCount += 1
    existing.dynasty =
      existing.dynasty === '未详' ? normalizeDynastyLabel(poem.dynasty) : existing.dynasty
    authorStats.set(poem.author, existing)
  }

  const knownAuthors =
    catalogByName.size > 0 ? [...catalogByName.keys()] : [...new Set(usablePoems.map((poem) => poem.author))]
  const authorNameById = new Map(knownAuthors.map((author) => [slugifyName(author), author]))
  const authorLookup = buildAuthorLookup(knownAuthors, aliases)
  const relationMap = new Map()

  for (const poem of usablePoems) {
    const type = relationTypeForTitle(poem.title)
    const targets = resolveTargetAuthors(poem, authorLookup)

    for (const target of targets) {
      const relationId = `${slugifyName(poem.author)}-${slugifyName(target)}-${slugifyName(poem.title)}`
      const intensity = scoreRelation(poem, target, type, aliases)
      const relation = {
        excerpt: poemExcerpt(poem.paragraphs),
        fullText: poemFullText(poem.paragraphs),
        id: relationId,
        intensity: Number(intensity.toFixed(2)),
        note: relationNote(poem.author, target, poem.title, type),
        poemTitle: poem.title,
        source: slugifyName(poem.author),
        target: slugifyName(target),
        type,
        typeLabel: relationLabel(type),
      }
      const existing = relationMap.get(relationId)

      if (!existing || existing.intensity < relation.intensity) {
        relationMap.set(relationId, relation)
      }
    }
  }

  const relations = [...relationMap.values()].sort((left, right) => right.intensity - left.intensity)
  const relationCounts = new Map()

  for (const relation of relations) {
    relationCounts.set(relation.source, (relationCounts.get(relation.source) ?? 0) + 1)
    relationCounts.set(relation.target, (relationCounts.get(relation.target) ?? 0) + 1)
  }

  const poetIds = [...new Set(relations.flatMap((relation) => [relation.source, relation.target]))]
  const sortedPoetIds = poetIds
    .sort((left, right) => {
      const leftName = authorNameById.get(left) ?? left
      const rightName = authorNameById.get(right) ?? right
      const leftScore =
        (relationCounts.get(left) ?? 0) * 3 + (authorStats.get(leftName)?.poemCount ?? 0)
      const rightScore =
        (relationCounts.get(right) ?? 0) * 3 + (authorStats.get(rightName)?.poemCount ?? 0)

      return rightScore - leftScore
    })
    .slice(0, maxPoets)

  const includedIds = new Set(sortedPoetIds)
  const filteredRelations = relations.filter(
    (relation) => includedIds.has(relation.source) && includedIds.has(relation.target),
  )

  const poets = layoutPoetNodes(
    sortedPoetIds.map((poetId) => {
      const author = authorNameById.get(poetId) ?? poetId
      const stats = authorStats.get(author)
      const catalog = catalogByName.get(author)
      const topRelation = filteredRelations.find(
        (relation) => relation.source === poetId || relation.target === poetId,
      )
      const degree = relationCounts.get(poetId) ?? 0

      return {
        dynasty: normalizeDynastyLabel(stats?.dynasty ?? catalog?.dynasty ?? '未详'),
        fame: 0,
        id: poetId,
        name: author,
        notableWork: catalog?.notableWork ?? stats?.sampleTitle ?? '佚作',
        position: { x: 0, y: 0 },
        spotlight: topRelation
          ? `${author}当前与${topRelation.source === poetId ? topRelation.target : topRelation.source}之间的关系信号最强。`
          : `${author}已经进入当前网络，后续可以继续补充更多可解析样本。`,
        tags:
          catalog?.tags ??
          [`${normalizeDynastyLabel(stats?.dynasty ?? catalog?.dynasty ?? '未详')}诗人`, `${stats?.poemCount ?? 0}首样本`, `${degree}条关系`],
      }
    }),
    new Map(
      sortedPoetIds.map((poetId) => {
        const author = authorNameById.get(poetId) ?? poetId
        const catalog = catalogByName.get(author)
        return [
          poetId,
          authorStats.get(author) ?? {
            dynasty: normalizeDynastyLabel(catalog?.dynasty ?? '未详'),
            poemCount: 0,
            sampleTitle: catalog?.notableWork ?? '佚作',
          },
        ]
      }),
    ),
    relationCounts,
  )

  return {
    poets,
    relations: filteredRelations,
  }
}

export function buildPoetPoemCollections(graph) {
  const poetNameById = new Map(graph.poets.map((poet) => [poet.id, poet.name]))
  const collections = new Map(graph.poets.map((poet) => [poet.id, []]))

  for (const relation of graph.relations) {
    const sourceEntries = collections.get(relation.source)
    const targetEntries = collections.get(relation.target)

    if (sourceEntries) {
      sourceEntries.push({
        counterpartId: relation.target,
        counterpartName: poetNameById.get(relation.target) ?? relation.target,
        direction: 'outgoing',
        excerpt: relation.excerpt,
        fullText: relation.fullText,
        intensity: relation.intensity,
        note: relation.note,
        poemTitle: relation.poemTitle,
        relationId: relation.id,
        type: relation.type,
        typeLabel: relation.typeLabel,
      })
    }

    if (targetEntries) {
      targetEntries.push({
        counterpartId: relation.source,
        counterpartName: poetNameById.get(relation.source) ?? relation.source,
        direction: 'incoming',
        excerpt: relation.excerpt,
        fullText: relation.fullText,
        intensity: relation.intensity,
        note: relation.note,
        poemTitle: relation.poemTitle,
        relationId: relation.id,
        type: relation.type,
        typeLabel: relation.typeLabel,
      })
    }
  }

  return Object.fromEntries(
    [...collections.entries()].map(([poetId, entries]) => [
      poetId,
      entries.sort((left, right) => right.intensity - left.intensity),
    ]),
  )
}
