/** Assemble upload-ready Windows release assets from verified electron-builder output. */

import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const desktopRoot = resolve(import.meta.dirname, '..')
const version = '0.3.0'
const platform = 'win-x64'
const releaseRoot = resolve(desktopRoot, 'release', version, platform)
const coreRoot = resolve(desktopRoot, 'dist', 'release-build', 'core')

type ReleaseAsset = {
  readonly id: string
  readonly file: string
  readonly sha256: string
  readonly bytes: number
  readonly requiredFor: string
  readonly installTarget?: string
  readonly note: string
}

async function digest(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

async function addAsset(id: string, file: string, requiredFor: string, note: string, installTarget?: string): Promise<ReleaseAsset> {
  const source = resolve(file)
  const target = resolve(releaseRoot, file.split(/[\\/]/).at(-1)!)
  await cp(source, target)
  return {
    id,
    file: target.split(/[\\/]/).at(-1)!,
    sha256: await digest(target),
    bytes: (await stat(target)).size,
    requiredFor,
    ...(installTarget === undefined ? {} : { installTarget }),
    note,
  }
}

function archive(target: string, parent: string, directory: string): void {
  execFileSync('tar', ['-a', '-c', '-f', target, '-C', parent, directory], { stdio: 'inherit' })
}

async function main(): Promise<void> {
  const fullInstaller = resolve(desktopRoot, 'dist', 'XYAI Studio Setup 0.3.0.exe')
  const coreInstaller = resolve(coreRoot, `XYAI-Studio-${version}-core-win-x64.exe`)
  const fullResources = resolve(desktopRoot, 'dist', 'win-unpacked', 'resources')
  const componentStaging = resolve(releaseRoot, '.component-staging')

  await rm(releaseRoot, { recursive: true, force: true })
  await mkdir(componentStaging, { recursive: true })
  await cp(resolve(fullResources, 'xyos-backend'), resolve(componentStaging, 'xyos-backend'), { recursive: true })
  await cp(resolve(fullResources, 'llama-cpp'), resolve(componentStaging, 'llama-cpp'), { recursive: true })

  const xyosArchive = resolve(releaseRoot, `XYAI-Studio-${version}-xyos-local-runtime-${platform}.zip`)
  const inferenceArchive = resolve(releaseRoot, `XYAI-Studio-${version}-local-inference-${platform}.zip`)
  archive(xyosArchive, componentStaging, 'xyos-backend')
  archive(inferenceArchive, componentStaging, 'llama-cpp')
  await rm(componentStaging, { recursive: true, force: true })

  const assets: ReleaseAsset[] = [
    await addAsset('full-offline', fullInstaller, '离线完整体验', '含 XYOS 本地服务和本地推理运行时；适合内网、U盘交付。'),
    await addAsset('core', coreInstaller, '快速开始', '仅含核心开发空间；可在后续版本的设置页安装可选本机组件。'),
    {
      id: 'xyos-local-runtime', file: xyosArchive.split(/[\\/]/).at(-1)!, sha256: await digest(xyosArchive), bytes: (await stat(xyosArchive)).size,
      requiredFor: '本地化 XYOS', installTarget: 'userData/components/xyos-backend',
      note: '提供本机业务空间、账户服务和智能体安装所需的 XYOS 后端。',
    },
    {
      id: 'local-inference', file: inferenceArchive.split(/[\\/]/).at(-1)!, sha256: await digest(inferenceArchive), bytes: (await stat(inferenceArchive)).size,
      requiredFor: '本地 GGUF 推理', installTarget: 'userData/components/llama-cpp',
      note: '提供 llama.cpp 本地推理运行时，不含任何模型文件。',
    },
  ]
  const manifest = {
    schemaVersion: 1,
    product: 'XYAI Studio',
    version,
    platform,
    publishedAt: new Date().toISOString(),
    downloadBase: './',
    verification: '下载完成后必须验证 sha256；请在 OSS 启用 HTTPS。',
    assets,
  }
  await writeFile(resolve(releaseRoot, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(resolve(releaseRoot, 'SHA256SUMS.txt'), `${[...assets, { file: 'release-manifest.json', sha256: await digest(resolve(releaseRoot, 'release-manifest.json')) }].map(asset => `${asset.sha256} *${asset.file}`).join('\n')}\n`, 'utf8')
  console.log(`Release assets assembled at ${releaseRoot}`)
}

void main()
