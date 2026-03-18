import type {
  BackgroundStar,
  CanvasPoint,
  CanvasSize,
  PoetGraph,
  PoetNode,
  PoetRelation,
  ProjectedPoet,
  ViewportState,
} from '../types'

const PAN_LIMIT = 420
const SCENE_SPREAD_X = 0.42
const SCENE_SPREAD_Y = 0.39

export function clampPan(pan: CanvasPoint): CanvasPoint {
  return {
    x: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, pan.x)),
    y: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, pan.y)),
  }
}

export function getConnectedPoetIds(
  relations: readonly PoetRelation[],
  poetId: string,
): Set<string> {
  const ids = new Set<string>()

  for (const relation of relations) {
    if (relation.source === poetId) {
      ids.add(relation.target)
    }

    if (relation.target === poetId) {
      ids.add(relation.source)
    }
  }

  return ids
}

export function getPoetRelations(graph: PoetGraph, poetId: string): PoetRelation[] {
  return graph.relations
    .filter((relation) => relation.source === poetId || relation.target === poetId)
    .sort((left, right) => right.intensity - left.intensity)
}

export function resolveVisiblePoets(
  poets: readonly PoetNode[],
  query: string,
): PoetNode[] {
  const normalized = query.trim().toLowerCase()

  if (!normalized) {
    return [...poets].sort((left, right) => right.fame - left.fame)
  }

  return poets
    .map((poet) => ({
      poet,
      rank: resolvePoetSearchRank(poet, normalized),
    }))
    .filter((item): item is { poet: PoetNode; rank: number } => item.rank !== null)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank
      }

      return right.poet.fame - left.poet.fame
    })
    .map((item) => item.poet)
}

function resolvePoetSearchRank(poet: PoetNode, query: string) {
  const normalizedName = poet.name.trim().toLowerCase()

  if (normalizedName === query) {
    return 0
  }

  if (normalizedName.startsWith(query)) {
    return 1
  }

  if (normalizedName.includes(query)) {
    return 2
  }

  const searchable = [poet.dynasty, poet.notableWork, ...poet.tags].join(' ').toLowerCase()

  if (searchable.includes(query)) {
    return 3
  }

  return null
}

export function projectPoet(
  poet: PoetNode,
  viewport: ViewportState,
  size: CanvasSize,
): ProjectedPoet {
  const spreadX = size.width * SCENE_SPREAD_X
  const spreadY = size.height * SCENE_SPREAD_Y
  const parallax = 0.55 + poet.depth * 0.7

  return {
    opacity: Math.min(1, 0.4 + poet.depth * 0.35 + poet.fame * 0.3),
    poet,
    radius: 3.5 + poet.fame * 7 + poet.depth * 3.4,
    x: size.width / 2 + poet.position.x * spreadX + viewport.pan.x * parallax,
    y: size.height / 2 + poet.position.y * spreadY + viewport.pan.y * parallax,
  }
}

export function findPoetAtPoint(
  graph: PoetGraph,
  viewport: ViewportState,
  size: CanvasSize,
  point: CanvasPoint,
): PoetNode | undefined {
  return findProjectedPoetAtPoint(
    graph.poets.map((poet) => projectPoet(poet, viewport, size)),
    point,
  )
}

export function findProjectedPoetAtPoint(
  projected: readonly ProjectedPoet[],
  point: CanvasPoint,
  hitPadding = 8,
): PoetNode | undefined {
  let bestMatch: ProjectedPoet | undefined

  for (const poet of projected) {
    const distance = Math.hypot(point.x - poet.x, point.y - poet.y)

    if (distance > poet.radius + hitPadding) {
      continue
    }

    if (
      !bestMatch ||
      poet.poet.depth > bestMatch.poet.depth ||
      (poet.poet.depth === bestMatch.poet.depth && poet.radius > bestMatch.radius)
    ) {
      bestMatch = poet
    }
  }

  return bestMatch?.poet
}

export function focusPanForPoet(poet: PoetNode, size: CanvasSize): CanvasPoint {
  const spreadX = size.width * SCENE_SPREAD_X
  const spreadY = size.height * SCENE_SPREAD_Y
  const parallax = 0.55 + poet.depth * 0.7

  return clampPan({
    x: (-poet.position.x * spreadX) / parallax,
    y: (-poet.position.y * spreadY) / parallax,
  })
}

export function createBackgroundStars(count: number): BackgroundStar[] {
  const stars: BackgroundStar[] = []
  let seed = 42

  for (let index = 0; index < count; index += 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    const random = seed / 4294967296
    seed = (seed * 1664525 + 1013904223) % 4294967296
    const randomY = seed / 4294967296
    seed = (seed * 1664525 + 1013904223) % 4294967296
    const depth = 0.35 + (seed / 4294967296) * 0.9

    stars.push({
      depth,
      phase: index * 0.9,
      radius: 0.8 + depth * 1.7,
      x: random,
      y: randomY,
    })
  }

  return stars
}
