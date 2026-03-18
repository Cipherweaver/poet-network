import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const targetDir = path.join(cwd, 'pipeline/source/chinese-poetry')
const repoUrl = 'https://github.com/chinese-poetry/chinese-poetry.git'
const sourcePaths = [
  '全唐诗',
  '御定全唐詩',
  '宋词',
  '元曲',
  '五代诗词',
  '楚辞',
  '诗经',
  '曹操诗集',
  '纳兰性德',
]

function runGit(args, workdir = cwd) {
  const result = spawnSync('git', args, {
    cwd: workdir,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`)
  }
}

function main() {
  if (!existsSync(targetDir)) {
    runGit(['clone', '--depth', '1', '--filter=blob:none', '--sparse', repoUrl, targetDir])
  }

  for (const lockPath of [
    path.join(targetDir, '.git/index.lock'),
    path.join(targetDir, '.git/info/sparse-checkout.lock'),
  ]) {
    if (existsSync(lockPath)) {
      rmSync(lockPath, { force: true })
    }
  }

  runGit(['-C', targetDir, 'sparse-checkout', 'init', '--cone'])
  runGit(['-C', targetDir, 'sparse-checkout', 'set', ...sourcePaths])
  runGit(['-C', targetDir, 'pull', '--ff-only'])

  console.info(`Ready: ${targetDir}`)
  console.info(`Sources: ${sourcePaths.join(', ')}`)
}

main()
