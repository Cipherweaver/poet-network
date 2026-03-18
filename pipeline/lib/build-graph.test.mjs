import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildPoetGraph,
  buildPoetPoemCollections,
  loadPoemsFromDirectory,
} from './build-graph.mjs'

const sampleDir = fileURLToPath(new URL('../source/sample', import.meta.url))
const aliasFile = fileURLToPath(new URL('../source/aliases.json', import.meta.url))
const catalogFile = fileURLToPath(new URL('../source/poets.json', import.meta.url))

describe('pipeline graph builder', () => {
  it('loads normalized poems from a directory', async () => {
    const poems = await loadPoemsFromDirectory(sampleDir)

    expect(poems).toHaveLength(9)
    expect(poems.some((poem) => poem.author === '李白' && poem.dynasty === '唐')).toBe(true)
    expect(poems.some((poem) => poem.title === '水调歌头')).toBe(true)
  })

  it('infers dynasties from Chinese dataset directory names', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'poet-network-'))
    const tangDir = path.join(tempDir, '全唐诗')

    try {
      await mkdir(tangDir, { recursive: true })
      await writeFile(
        path.join(tangDir, 'sample.json'),
        JSON.stringify([{ author: '李白', paragraphs: ['君不见黄河之水天上来'], title: '将进酒' }]),
        'utf8',
      )

      const poems = await loadPoemsFromDirectory(tempDir)
      expect(poems[0]?.dynasty).toBe('唐')
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it('normalizes english dynasty labels from source data', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'poet-network-'))

    try {
      await writeFile(
        path.join(tempDir, 'sample.json'),
        JSON.stringify([{ author: '无名氏', dynasty: 'yuan', paragraphs: ['秋声入梦'], title: '秋夜' }]),
        'utf8',
      )

      const poems = await loadPoemsFromDirectory(tempDir)
      expect(poems[0]?.dynasty).toBe('元')
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it('builds a relation graph with alias resolution', async () => {
    const poems = await loadPoemsFromDirectory(sampleDir)
    const aliases = JSON.parse(await readFile(aliasFile, 'utf8'))
    const knownPoets = JSON.parse(await readFile(catalogFile, 'utf8'))
    const graph = buildPoetGraph(poems, { aliases, knownPoets, maxPoets: 16 })

    expect(graph.poets.some((poet) => poet.name === '白居易')).toBe(true)
    expect(graph.poets.some((poet) => poet.name === '王昌龄')).toBe(true)
    expect(graph.relations.some((relation) => relation.source === '白居易' && relation.target === '元稹')).toBe(true)
    expect(graph.relations.some((relation) => relation.source === '李白' && relation.target === '王昌龄')).toBe(true)
  })

  it('keeps only catalog-backed person names when a poet catalog is provided', () => {
    const graph = buildPoetGraph(
      [
        {
          author: '乐天',
          dynasty: '唐',
          paragraphs: ['与元稹夜话'],
          title: '寄微之',
        },
        {
          author: '少年',
          dynasty: '唐',
          paragraphs: ['思李白'],
          title: '忆李白',
        },
        {
          author: '郊庙朝会歌辞',
          dynasty: '唐',
          paragraphs: ['写给王昌龄'],
          title: '寄王昌龄',
        },
      ],
      {
        aliases: {
          元稹: ['微之'],
          白居易: ['乐天'],
        },
        knownPoets: [
          { dynasty: '唐', name: '白居易', notableWork: '长恨歌', tags: [] },
          { dynasty: '唐', name: '元稹', notableWork: '遣悲怀', tags: [] },
          { dynasty: '唐', name: '李白', notableWork: '将进酒', tags: [] },
          { dynasty: '唐', name: '王昌龄', notableWork: '出塞', tags: [] },
        ],
        maxPoets: 16,
      },
    )

    expect(graph.poets.map((poet) => poet.name).sort()).toEqual(['元稹', '白居易'])
    expect(graph.relations).toHaveLength(1)
    expect(graph.relations[0]).toMatchObject({
      source: '白居易',
      target: '元稹',
    })
  })

  it('builds per-poet poem collections for lazy loading', async () => {
    const poems = await loadPoemsFromDirectory(sampleDir)
    const aliases = JSON.parse(await readFile(aliasFile, 'utf8'))
    const knownPoets = JSON.parse(await readFile(catalogFile, 'utf8'))
    const graph = buildPoetGraph(poems, { aliases, knownPoets, maxPoets: 16 })
    const collections = buildPoetPoemCollections(graph)

    expect(collections['李白']).toHaveLength(4)
    expect(collections['王昌龄'].some((entry) => entry.counterpartName === '孟浩然')).toBe(true)
    expect(collections['白居易'][0]?.intensity).toBeGreaterThanOrEqual(collections['白居易'][1]?.intensity)
  })
})
