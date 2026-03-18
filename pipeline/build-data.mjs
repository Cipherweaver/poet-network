import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as OpenCC from 'opencc-js'
import {
  buildPoetGraph,
  buildPoetPoemCollections,
  loadPoemsFromDirectory,
} from './lib/build-graph.mjs'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const realDataInput = path.join(cwd, 'pipeline/source/chinese-poetry')
const defaultInput = existsSync(realDataInput)
  ? realDataInput
  : path.join(cwd, 'pipeline/source/sample')
const defaultMaxPoets = existsSync(realDataInput) ? 80 : 24
const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' })
const supplementalCatalogSources = [
  {
    dynasty: '唐',
    filePath: path.join(cwd, 'pipeline/source/chinese-poetry/全唐诗/authors.tang.json'),
  },
  {
    dynasty: '宋',
    filePath: path.join(cwd, 'pipeline/source/chinese-poetry/全唐诗/authors.song.json'),
  },
]

function parseArgs(argv) {
  const args = {
    aliases: path.join(cwd, 'pipeline/source/aliases.json'),
    catalog: path.join(cwd, 'pipeline/source/poets.json'),
    input: defaultInput,
    jsonOutput: path.join(cwd, 'public/graph.json'),
    limit: Number.POSITIVE_INFINITY,
    maxPoets: defaultMaxPoets,
    poemsOutputDir: path.join(cwd, 'public/poems'),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const next = argv[index + 1]

    if (current === '--input' && next) {
      args.input = path.resolve(next)
      index += 1
    } else if (current === '--json-output' && next) {
      args.jsonOutput = path.resolve(next)
      index += 1
    } else if (current === '--poems-output-dir' && next) {
      args.poemsOutputDir = path.resolve(next)
      index += 1
    } else if (current === '--aliases' && next) {
      args.aliases = path.resolve(next)
      index += 1
    } else if (current === '--catalog' && next) {
      args.catalog = path.resolve(next)
      index += 1
    } else if (current === '--limit' && next) {
      args.limit = Number(next)
      index += 1
    } else if (current === '--max-poets' && next) {
      args.maxPoets = Number(next)
      index += 1
    }
  }

  return args
}

async function loadAliases(filePath) {
  try {
    const contents = await fs.readFile(filePath, 'utf8')
    return JSON.parse(contents)
  } catch {
    return {}
  }
}

function simplifyText(value) {
  return typeof value === 'string' ? toSimplified(value) : value
}

function isConcreteCatalogName(name) {
  return (
    !!name &&
    !/无名氏|不详|未详/u.test(name) &&
    !/^(?:太守|使君|刺史|侍郎|郎中|主簿|县令|学士|少府|尚书|御史|知州|太史|大夫|将军|都统|节度使)$/u.test(name) &&
    !/(?:皇帝|皇后|太后|后主|娘娘|宫人|美人)$/u.test(name) &&
    !/^(?:少年|老农|渔父|樵夫|山人|道人|居士|上人|处士|故人|友人|主人|宾客|天然|云水|乐章|歌辞)$/u.test(name)
  )
}

async function loadSupplementalCatalog() {
  const entries = []

  for (const source of supplementalCatalogSources) {
    if (!existsSync(source.filePath)) {
      continue
    }

    try {
      const contents = await fs.readFile(source.filePath, 'utf8')
      const rows = JSON.parse(contents)

      if (!Array.isArray(rows)) {
        continue
      }

      for (const row of rows) {
        const name = simplifyText(row?.name ?? '').trim()

        if (!isConcreteCatalogName(name)) {
          continue
        }

        entries.push({
          dynasty: source.dynasty,
          name,
          notableWork: '',
          tags: [],
        })
      }
    } catch {
      continue
    }
  }

  return entries
}

async function loadCatalog(filePath) {
  const catalogByName = new Map()

  try {
    const contents = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(contents)

    if (Array.isArray(parsed)) {
      for (const poet of parsed) {
        const name = simplifyText(poet?.name ?? '').trim()

        if (!isConcreteCatalogName(name)) {
          continue
        }

        catalogByName.set(name, {
          ...poet,
          dynasty: simplifyText(poet?.dynasty ?? ''),
          name,
          notableWork: simplifyText(poet?.notableWork ?? ''),
          tags: Array.isArray(poet?.tags) ? poet.tags.map((tag) => simplifyText(tag)) : [],
        })
      }
    }
  } catch {
    // Fall back to supplemental catalog sources below.
  }

  for (const poet of await loadSupplementalCatalog()) {
    if (!catalogByName.has(poet.name)) {
      catalogByName.set(poet.name, poet)
    }
  }

  return [...catalogByName.values()]
}

function simplifyGraphForDisplay(graph) {
  return {
    poets: graph.poets.map((poet) => ({
      ...poet,
      dynasty: simplifyText(poet.dynasty),
      name: simplifyText(poet.name),
      notableWork: simplifyText(poet.notableWork),
      spotlight: simplifyText(poet.spotlight),
      tags: poet.tags.map((tag) => simplifyText(tag)),
    })),
    relations: graph.relations.map((relation) => ({
      ...relation,
      excerpt: simplifyText(relation.excerpt),
      fullText: simplifyText(relation.fullText),
      note: simplifyText(relation.note),
      poemTitle: simplifyText(relation.poemTitle),
      typeLabel: simplifyText(relation.typeLabel),
    })),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const aliases = await loadAliases(args.aliases)
  const knownPoets = await loadCatalog(args.catalog)
  const poems = await loadPoemsFromDirectory(args.input, args.limit)
  const rawGraph = buildPoetGraph(poems, { aliases, knownPoets, maxPoets: args.maxPoets })
  const graph = simplifyGraphForDisplay(rawGraph)
  const poetPoems = buildPoetPoemCollections(graph)

  await fs.mkdir(path.dirname(args.jsonOutput), { recursive: true })
  await fs.rm(args.poemsOutputDir, { force: true, recursive: true })
  await fs.mkdir(args.poemsOutputDir, { recursive: true })
  await fs.writeFile(args.jsonOutput, `${JSON.stringify(graph, null, 2)}\n`, 'utf8')
  await Promise.all(
    Object.entries(poetPoems).map(([poetId, entries]) =>
      fs.writeFile(
        path.join(args.poemsOutputDir, `${poetId}.json`),
        `${JSON.stringify(entries, null, 2)}\n`,
        'utf8',
      ),
    ),
  )

  console.info(
    `Generated ${graph.poets.length} poets and ${graph.relations.length} relations from ${poems.length} poems.`,
  )
  console.info(`Input: ${path.relative(cwd, args.input)}`)
  console.info(`JSON: ${path.relative(cwd, args.jsonOutput)}`)
  console.info(`Poems: ${path.relative(cwd, args.poemsOutputDir)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
