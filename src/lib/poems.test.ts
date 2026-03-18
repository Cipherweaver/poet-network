import { describe, expect, it } from 'vitest'
import { fixtureGraph } from '../test/fixtureGraph'
import { buildFallbackPoems, buildPoemAssetPath } from './poems'

describe('poem helpers', () => {
  it('builds URL-safe poem asset paths', () => {
    expect(buildPoemAssetPath('白居易')).toBe('/poems/%E7%99%BD%E5%B1%85%E6%98%93.json')
  })

  it('builds fallback poem entries from graph relations', () => {
    const poems = buildFallbackPoems(fixtureGraph, '白居易')

    expect(poems).toHaveLength(2)
    expect(poems[0]).toMatchObject({
      counterpartName: '元稹',
      intensity: 0.97,
    })
  })

  it('fills in a default note when relation note is missing', () => {
    const poems = buildFallbackPoems(
      {
        ...fixtureGraph,
        relations: [
          {
            ...fixtureGraph.relations[0],
            note: '',
            source: '白居易',
            target: '元稹',
          },
        ],
      },
      '白居易',
    )

    expect(poems[0]?.note).toContain('白居易写给元稹的一首关联诗作。')
  })
})
