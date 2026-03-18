import { describe, expect, it } from 'vitest'
import { fixtureGraph } from '../test/fixtureGraph'
import type { PoetNode } from '../types'
import {
  clampPan,
  createBackgroundStars,
  findPoetAtPoint,
  findProjectedPoetAtPoint,
  focusPanForPoet,
  getConnectedPoetIds,
  getPoetRelations,
  projectPoet,
  resolveVisiblePoets,
} from './graph'

describe('graph helpers', () => {
  it('returns both incoming and outgoing neighbours for a poet', () => {
    const connected = getConnectedPoetIds(fixtureGraph.relations, '李白')

    expect(Array.from(connected).sort()).toEqual(['孟浩然', '杜甫', '王昌龄'])
  })

  it('returns selected poet relations sorted by intensity', () => {
    const relations = getPoetRelations(fixtureGraph, '白居易')

    expect(relations[0]?.poemTitle).toBe('酬乐天频梦微之')
    expect(relations[1]?.poemTitle).toBe('梦微之')
  })

  it('matches poets by name and tags', () => {
    expect(resolveVisiblePoets(fixtureGraph.poets, '元白').map((poet) => poet.id).sort()).toEqual([
      '元稹',
      '白居易',
    ])
  })

  it('prioritizes exact and prefix name matches over metadata matches', () => {
    const poets: PoetNode[] = [
      {
        ...fixtureGraph.poets[2]!,
        fame: 0.98,
        id: 'meta-match',
        name: '杜甫',
        tags: ['李杜'],
      },
      fixtureGraph.poets[0]!,
      {
        ...fixtureGraph.poets[1]!,
        fame: 0.58,
        id: '李商隐',
        name: '李商隐',
        tags: ['晚唐'],
      },
    ]
    const result = resolveVisiblePoets(poets, '李')

    expect(result[0]?.id).toBe('李白')
    expect(result[1]?.id).toBe('李商隐')
    expect(result[2]?.id).toBe('meta-match')
  })

  it('sorts poets by fame when query is empty', () => {
    const result = resolveVisiblePoets(fixtureGraph.poets, '   ')

    expect(result[0]?.id).toBe('李白')
    expect(result.at(-1)?.id).toBe('裴迪')
  })

  it('clamps pan values within scene bounds', () => {
    expect(clampPan({ x: 999, y: -999 })).toEqual({ x: 420, y: -420 })
  })

  it('projects a poet into canvas coordinates', () => {
    const projected = projectPoet(fixtureGraph.poets[0], { pan: { x: 20, y: -15 } }, { width: 1000, height: 700 })

    expect(projected.radius).toBeGreaterThan(10)
    expect(projected.x).toBeGreaterThan(0)
    expect(projected.y).toBeGreaterThan(0)
  })

  it('computes a focus pan that recenters the selected poet', () => {
    const pan = focusPanForPoet(fixtureGraph.poets[0], { width: 1200, height: 800 })

    expect(Math.abs(pan.x)).toBeGreaterThan(0)
    expect(Math.abs(pan.y)).toBeLessThanOrEqual(260)
  })

  it('detects poets under a pointer hit area', () => {
    const size = { width: 1200, height: 800 }
    const pan = focusPanForPoet(fixtureGraph.poets[0], size)
    const hit = findPoetAtPoint(fixtureGraph, { pan }, size, {
      x: size.width / 2,
      y: size.height / 2,
    })

    expect(hit?.id).toBe('李白')
  })

  it('returns undefined when pointer is away from every poet', () => {
    const miss = findPoetAtPoint(fixtureGraph, { pan: { x: 0, y: 0 } }, { width: 600, height: 400 }, { x: 1, y: 1 })

    expect(miss).toBeUndefined()
  })

  it('prefers the front-most projected poet when hit areas overlap', () => {
    const hit = findProjectedPoetAtPoint(
      [
        {
          opacity: 1,
          poet: { ...fixtureGraph.poets[0], depth: 0.35 },
          radius: 16,
          x: 320,
          y: 240,
        },
        {
          opacity: 1,
          poet: { ...fixtureGraph.poets[1], depth: 0.82 },
          radius: 12,
          x: 323,
          y: 243,
        },
      ],
      { x: 324, y: 242 },
    )

    expect(hit?.id).toBe(fixtureGraph.poets[1]?.id)
  })

  it('supports wider hit padding for small points', () => {
    const hit = findProjectedPoetAtPoint(
      [
        {
          opacity: 1,
          poet: { ...fixtureGraph.poets[0], depth: 0.6 },
          radius: 6,
          x: 240,
          y: 120,
        },
      ],
      { x: 252, y: 120 },
      8,
    )

    expect(hit?.id).toBe(fixtureGraph.poets[0]?.id)
  })

  it('creates deterministic background stars', () => {
    const stars = createBackgroundStars(3)

    expect(stars).toHaveLength(3)
    expect(stars[0]).toMatchObject({
      phase: 0,
    })
    expect(stars[1]?.x).not.toBe(stars[0]?.x)
  })
})
