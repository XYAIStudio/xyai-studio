/** Prepare a dependency-free electron-builder project so release packaging never scans the workspace pnpm graph. */

import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const edition = process.argv[2]
if (edition !== 'full' && edition !== 'core') throw new Error('Usage: prepare-release-project.ts <full|core>')

const desktopRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(desktopRoot, '..', '..')
const projectRoot = resolve(desktopRoot, '..', '..', '..', 'xyai-studio-release-staging', edition)
const output = resolve(desktopRoot, 'dist', 'release-build', edition)
const version = '0.3.0'

const extraResources = edition === 'full'
  ? [
      { from: resolve(desktopRoot, 'resources'), to: 'desktop-resources' },
      { from: resolve(desktopRoot, 'resources', 'llama-cpp'), to: 'llama-cpp' },
      { from: resolve(desktopRoot, 'runtime-host', 'package.json'), to: 'host/package.json' },
      { from: resolve(desktopRoot, 'runtime-host', 'node_modules'), to: 'host/node_modules' },
      { from: resolve(repositoryRoot, 'xyos-dist'), to: 'dist' },
      { from: resolve(repositoryRoot, 'xyos-backend'), to: 'xyos-backend', filter: ['**/*', '!.env', '!runtime-workspace/**', '!data/**', '!uploads/**'] },
      { from: resolve(repositoryRoot, 'xyos-backend', 'node_modules'), to: 'xyos-backend/node_modules' },
    ]
  : [
      { from: resolve(desktopRoot, 'resources'), to: 'desktop-resources', filter: ['**/*', '!llama-cpp/**'] },
      { from: resolve(desktopRoot, 'runtime-host', 'package.json'), to: 'host/package.json' },
      { from: resolve(desktopRoot, 'runtime-host', 'node_modules'), to: 'host/node_modules' },
      { from: resolve(repositoryRoot, 'xyos-dist'), to: 'dist' },
    ]

const configuration = {
  appId: 'cn.cnxyai.xyosstudio',
  productName: 'XYAI Studio',
  electronVersion: '43.4.0',
  electronDist: resolve(desktopRoot, 'node_modules', 'electron', 'dist'),
  afterPack: resolve(desktopRoot, 'scripts', 'verify-packaged-runtime.ts'),
  asar: true,
  files: ['lib/**', 'package.json'],
  directories: { output },
  artifactName: `XYAI-Studio-${version}-${edition}-win-\${arch}.\${ext}`,
  extraResources,
  win: { icon: resolve(desktopRoot, 'build', 'icon.png'), target: ['nsis'] },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false },
}

await rm(projectRoot, { recursive: true, force: true })
await mkdir(projectRoot, { recursive: true })
await cp(resolve(desktopRoot, 'lib'), resolve(projectRoot, 'lib'), { recursive: true })
await writeFile(resolve(projectRoot, 'package.json'), `${JSON.stringify({ name: `xyai-studio-${edition}-release`, version, private: true, main: 'lib/main.cjs', build: configuration }, null, 2)}\n`, 'utf8')
console.log(projectRoot)
