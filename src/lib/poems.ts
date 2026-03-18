import type { PoetGraph, PoetPoemEntry } from '../types'

export function buildPoemAssetPath(poetId: string): string {
  return `/poems/${encodeURIComponent(poetId)}.json`
}

export function buildFallbackPoems(graph: PoetGraph, poetId: string): PoetPoemEntry[] {
  const poetName = graph.poets.find((poet) => poet.id === poetId)?.name ?? poetId

  return graph.relations
    .filter((relation) => relation.source === poetId || relation.target === poetId)
    .sort((left, right) => right.intensity - left.intensity)
    .map((relation) => {
      const outgoing = relation.source === poetId
      const counterpartId = outgoing ? relation.target : relation.source
      const counterpartName =
        graph.poets.find((poet) => poet.id === counterpartId)?.name ?? counterpartId

      return {
        counterpartId,
        counterpartName,
        direction: outgoing ? ('outgoing' as const) : ('incoming' as const),
        excerpt: relation.excerpt,
        fullText: relation.fullText,
        intensity: relation.intensity,
        note: relation.note,
        poemTitle: relation.poemTitle,
        relationId: relation.id,
        type: relation.type,
        typeLabel: relation.typeLabel,
      }
    })
    .map((entry) => ({
      ...entry,
      note:
        entry.note ||
        `${poetName}${entry.direction === 'outgoing' ? '写给' : '收到'}${entry.counterpartName}的一首关联诗作。`,
    }))
}
