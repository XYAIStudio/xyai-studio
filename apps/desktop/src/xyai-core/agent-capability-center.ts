/** 本机智能体「插件能力与技能」识别中心（Electron 主进程）。
 * 职责：只做「识别与清单」，不执行第三方插件代码、不读密钥。技能“安装”= 把技能目录复制到目标
 * 软件 skills 目录（随后由对应软件技能工作区扫描）；目标目录白名单由本模块计算，禁止越界写入。 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, sep } from 'node:path'
import os from 'node:os'

export interface AgentRootInfo { readonly id: string; readonly label: string; readonly kind: 'skills' | 'plugins' | 'both'; readonly path: string }
export interface SkillInstallState { readonly rootId: string; readonly label: string; readonly installed: boolean; readonly managed: boolean; readonly dirName: string; readonly destination: string }
export interface CapabilitySkill {
  readonly agentId: string; readonly sourceLabel: string; readonly dir: string; readonly path: string
  readonly id: string; readonly displayName: string; readonly description: string; readonly descriptionZh: string
  readonly version?: string; readonly installState: SkillInstallState[]
}
export interface CapabilityPlugin {
  readonly agentId: string; readonly sourceLabel: string; readonly kind: string; readonly path?: string
  readonly id: string; readonly displayName: string; readonly version?: string; readonly summary?: string
  /** 是否已复制进本应用 plugins/imported。 */
  readonly imported: boolean
  /** 本应用导入副本路径（若已导入）。 */
  readonly importDestination?: string
  /** 是否由本页装入（含 .xyai-installed.json），可安全移除。 */
  readonly managed: boolean
}
export interface BuiltinCapability { readonly category: string; readonly id: string; readonly name: string; readonly zhName: string; readonly zhDesc: string }
export interface AgentCatalog {
  readonly scannedAt: string; readonly notes: string[]
  readonly skillRoots: AgentRootInfo[]; readonly skills: CapabilitySkill[]
  readonly pluginRoots: AgentRootInfo[]; readonly plugins: CapabilityPlugin[]
  readonly builtins: BuiltinCapability[]; readonly installTargets: AgentRootInfo[]
  /** 本应用可导入插件的目标根（plugins/imported）。 */
  readonly pluginImportRoot: string
}
export interface ScanOptions { readonly dshHome: string; readonly homeDir?: string }

export interface InstallOutcome { readonly ok: boolean; readonly message: string; readonly rootId: string; readonly dirName: string; readonly destination: string }

const HOME = os.homedir()
const DSH_AGENT_ID = 'xyai-dsh'
const AGENT_META: ReadonlyArray<{ id: string; label: string; skillRel?: string; pluginRels?: ReadonlyArray<string>; targetable: boolean }> = [
  { id: DSH_AGENT_ID, label: 'XYAI Studio / DSH（本应用）', skillRel: 'skills', pluginRels: ['plugins/imported'], targetable: true },
  { id: 'codex', label: 'Codex CLI', skillRel: 'skills', pluginRels: ['plugins/cache', 'plugins'], targetable: true },
  { id: 'claude', label: 'Claude Code', skillRel: 'skills', pluginRels: ['plugins', 'plugins/cache', 'plugins/marketplaces'], targetable: true },
  { id: 'workbuddy', label: 'WorkBuddy（腾讯 CodeBuddy）', skillRel: 'skills', pluginRels: ['plugins/data', 'plugins/cache', 'plugins'], targetable: true },
  { id: 'shared', label: '共享技能（本机 .agents）', skillRel: 'skills', pluginRels: [], targetable: false },
]
const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', 'cache', 'Cache', 'dist', 'build', 'tmp', 'temp', 'backups', '__pycache__', 'locale', 'assets', 'static'])
const IGNORED_JSON_RE = /(^|[-_.])(lock|tsconfig|eslint|prettier|jest|vitest|playwright|vercel|netlify|commitlint|stylelint)[^.]*\.json$/i

/** 种子中文备注：仅当 SKILL.md 本身没有中文说明时使用，避免臆造。 */
const ZH_SKILL_HINTS: Record<string, string> = {
  'seedance-cinematic': '电影级视频提示词生成（Seedance 2.0）',
  'seedance-3d-cgi': '三维 CGI/渲染视频提示词生成',
  'seedance-cartoon': '卡通与动画风格视频提示词生成',
  'seedance-comic-to-video': '漫画/分镜转动画视频',
  'seedance-fight-scenes': '打斗与动作场面视频提示词生成',
  'seedance-motion-design-ad': '软件/科技公司动态设计广告视频',
  'seedance-ecommerce-ad': '电商产品广告视频提示词生成',
  'seedance-anime-action': '动漫风动作视频提示词生成',
  'seedance-product-360': '产品 360° 转盘展示视频',
  'seedance-music-video': '音乐视频与节拍同步视觉生成',
  'seedance-social-hook': '短视频平台爆款开场钩子生成',
  'seedance-brand-story': '品牌故事与企业叙事视频',
  'seedance-fashion-lookbook': '时尚造型书/模特展示视频',
  'seedance-food-beverage': '食品饮料类视频提示词生成',
  'seedance-real-estate': '地产/建筑/室内空间展示视频',
  'video-use': '对话式视频剪辑、转写、字幕与再创作',
  'github': '使用 gh CLI 管理 GitHub Issue/PR/CI',
  'agentmail': 'AI 智能体专属邮箱（收发邮件）',
  'ima-skills': '腾讯 ima 笔记与知识库读写检索',
  'mcp-builder': '构建自定义 MCP 服务器',
  'browser-use': '浏览器自动化操作能力',
}

function hasCjk(value: string): boolean { return /[\u3400-\u9fff\uf900-\ufaff]/.test(value) }

function stripQuotes(value: string): string {
  let out = value.trim()
  if (out.length >= 2 && ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'")))) out = out.slice(1, -1)
  return out.trim()
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory() } catch { return false }
}

/** 解析 SKILL.md 前导 YAML（name/description/description_zh/display_name/version）。 */
function parseSkillFrontMatter(text: string): Record<string, string> {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (match === null || match[1] === undefined) return {}
  const body = match[1]
  const lines = body.split(/\r?\n/)
  const result: Record<string, string> = {}
  let pending: string | undefined
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const kv = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/)
    if (kv !== null) {
      const key = kv[1]
      if (key !== undefined) {
        const value = (kv[2] ?? '').trim()
        if (value === '>-' || value === '>' || value === '|-' || value === '|') {
          const parts: string[] = []
          i += 1
          while (i < lines.length && (lines[i] ?? '').startsWith(' ') && !/^[A-Za-z0-9_.-]+:\s*/.test(lines[i] ?? '')) {
            parts.push((lines[i] ?? '').trim())
            i += 1
          }
          result[key] = parts.join(value.startsWith('|') ? '\n' : ' ').trim()
          continue
        }
        pending = key
        result[key] = stripQuotes(value)
      }
      i += 1
    } else if (pending !== undefined && (line.startsWith(' ') || line === '')) {
      const previous = result[pending] ?? ''
      result[pending] = (previous === '' ? '' : previous + ' ') + line.trim()
      i += 1
    } else { i += 1 }
  }
  return result
}

/** 目录名 → 前端技能 id 的补充中文备注（避免对英文技能全无注释）。 */
function zhHint(id: string): string {
  if (id.startsWith('lark-')) return '飞书/Lark 办公自动化能力'
  if (id.startsWith('seedance-')) return ZH_SKILL_HINTS[id] ?? 'Seedance 2.0 视频生成技能'
  if (id.startsWith('tencent-') || id.startsWith('wechat')) return '腾讯系/微信生态能力技能'
  if (id.startsWith('linkfox-')) return 'LinkFox 跨境/电商运营技能'
  return ZH_SKILL_HINTS[id] ?? ''
}

function safeName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^[.-]+|[.-]+$/g, '') || 'skill'
}

function readJsonObject(file: string): Record<string, unknown> | undefined {
  try {
    if (statSync(file).size > 512 * 1024) return undefined
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    return undefined
  } catch { return undefined }
}

function textOf(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }

function skillDisplayName(front: Record<string, string>, dir: string): string {
  const display = front['display_name'] ?? front['displayName'] ?? front['name'] ?? ''
  if (display !== '') return display
  return dir.replace(/^\d+-/i, '').replace(/[-_]/g, ' ')
}

/** 扫描单个 skills 根目录（只取一层直接子目录，均要求含 SKILL.md）。 */
function scanSkillsDir(skillsDir: string, agentId: string, sourceLabel: string, targets: ReadonlyArray<{ rootId: string; label: string; path: string }>): CapabilitySkill[] {
  const output: CapabilitySkill[] = []
  let names: string[]
  try { names = readdirSync(skillsDir) } catch { return output }
  const dirs = names.filter((name) => !name.startsWith('.') && !IGNORED_DIRS.has(name) && isDirectory(join(skillsDir, name))).sort((a, b) => a.localeCompare(b))
  for (const entryName of dirs) {
    const skillDirPath = join(skillsDir, entryName)
    const skillFile = join(skillDirPath, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    let front: Record<string, string> = {}
    try { front = parseSkillFrontMatter(readFileSync(skillFile, 'utf8').slice(0, 64 * 1024)) } catch { front = {} }
    const id = front['name'] !== undefined && front['name'] !== '' ? front['name'] : entryName
    const displayName = skillDisplayName(front, entryName)
    const rawDescription = front['description_zh'] ?? front['description'] ?? front['summary'] ?? ''
    const description = rawDescription === '' ? (front['description_en'] ?? '') : rawDescription
    const descriptionZh = hasCjk(description) ? description : (zhHint(id) !== '' ? zhHint(id) : '')
    const version = front['version'] !== undefined && front['version'] !== '' ? front['version'] : undefined
    const installState: SkillInstallState[] = targets.map((target) => {
      const destination = join(target.path, entryName)
      return {
        rootId: target.rootId, label: target.label, installed: existsSync(destination),
        managed: existsSync(join(destination, '.xyai-installed.json')),
        dirName: entryName, destination,
      }
    })
    const item: CapabilitySkill = {
      agentId, sourceLabel, dir: entryName, path: skillDirPath, id, displayName,
      description: description.slice(0, 600), descriptionZh: descriptionZh.slice(0, 300),
      installState, ...(version === undefined ? {} : { version }),
    }
    output.push(item)
  }
  return output
}

function collectPluginJson(root: string, maxDepth: number, cap: number): string[] {
  const found: string[] = []
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  while (stack.length > 0 && found.length < cap) {
    const current = stack.pop()
    if (current === undefined) continue
    let names: string[]
    try { names = readdirSync(current.dir) } catch { continue }
    for (const name of names) {
      if (found.length >= cap) break
      if (name === '.' || name === '..') continue
      const full = join(current.dir, name)
      if (isDirectory(full)) {
        if (current.depth < maxDepth && !IGNORED_DIRS.has(name)) stack.push({ dir: full, depth: current.depth + 1 })
      } else if (name.toLowerCase().endsWith('.json') && !IGNORED_JSON_RE.test(name) && !name.includes('package-lock')) {
        found.push(full)
      }
    }
  }
  return found
}
function pluginVersion(entryName: string): string | undefined {
  const match = entryName.match(/(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.]+)?)/)
  return match === null ? undefined : match[1]
}

const BUILTIN_CATEGORY_PLUGIN = 'DSH 端侧插件（随应用出厂装配）'
const BUILTIN_CATEGORY_CONNECTOR = '连接器（技能工作区 · 可选连接）'
const BUILTIN_CATEGORY_MODULE = 'XYAI Studio 核心模块（本应用自带）'

const BUILTIN_DEFS: ReadonlyArray<{ category: string; id: string; name: string; zhName: string; zhDesc: string }> = [
  { category: BUILTIN_CATEGORY_PLUGIN, id: 'xyai-industry-agent', name: 'dsh-plugin-desktop', zhName: '端侧行业智能体客户端', zhDesc: '把本机知识、模型、技能与能力编排成可验收的行业智能体，随应用出厂自动装配，无需手工安装。' },
  { category: BUILTIN_CATEGORY_PLUGIN, id: 'xyai-skill-workspace', name: 'skill-workspace', zhName: '技能工作区与连接器中心', zhDesc: '读写本机 DSH 技能目录，登记/解除 ima、微信、企业微信、腾讯会议、金山文档等连接器与其凭据。' },
  { category: BUILTIN_CATEGORY_PLUGIN, id: 'xyai-local-gguf', name: 'local-gguf', zhName: '本地 GGUF 小模型运行器', zhDesc: '在用户电脑上直接运行量化小模型，不依赖云端算力，用于本机知识问答与文档解析。' },
  { category: BUILTIN_CATEGORY_PLUGIN, id: 'xyai-ollama-provider', name: 'ollama-provider', zhName: 'Ollama 本地模型服务接入', zhDesc: '自动探测并接入用户已安装的 Ollama 运行时与模型列表，供模型广场与知识问答选用。' },
  { category: BUILTIN_CATEGORY_PLUGIN, id: 'xyai-directory-picker', name: 'directory-picker', zhName: '桌面原生目录选择器', zhDesc: '替换上游窗口选择框，用本机文件夹对话框选择工作区与知识库挂接目录。' },
  { category: BUILTIN_CATEGORY_CONNECTOR, id: 'connector-ima', name: 'ima', zhName: 'ima 知识库连接器', zhDesc: '读取/检索用户授权的 ima 云知识库与笔记，支持把本地文件导入 ima，无需下载到本地解析。' },
  { category: BUILTIN_CATEGORY_CONNECTOR, id: 'connector-wechat', name: 'wechat', zhName: '微信（公众号/开放平台）连接器', zhDesc: '连接微信开放平台能力（按官方接口边界使用）。' },
  { category: BUILTIN_CATEGORY_CONNECTOR, id: 'connector-wecom', name: 'wecom', zhName: '企业微信连接器', zhDesc: '接入企业微信会话与通讯能力（按官方接口边界使用）。' },
  { category: BUILTIN_CATEGORY_CONNECTOR, id: 'connector-tencent-meeting', name: 'tencent-meeting', zhName: '腾讯会议连接器', zhDesc: '接入腾讯会议录制/会议资料等能力（按官方接口边界使用）。' },
  { category: BUILTIN_CATEGORY_CONNECTOR, id: 'connector-kdocs', name: 'kdocs', zhName: '金山文档连接器', zhDesc: '接入金山文档（WPS 文档能力）读写（按官方接口边界使用）。' },
  { category: BUILTIN_CATEGORY_CONNECTOR, id: 'connector-tencent-docs', name: 'tencent-docs', zhName: '腾讯文档连接器', zhDesc: '接入腾讯文档在线协作能力（按官方接口边界使用）。' },
  { category: BUILTIN_CATEGORY_CONNECTOR, id: 'connector-miaoda', name: 'miaoda', zhName: '秒哒应用搭建连接器', zhDesc: '接入秒哒（Miaoda）低代码应用搭建能力（按官方接口边界使用）。' },
  { category: BUILTIN_CATEGORY_CONNECTOR, id: 'connector-camscanner', name: 'camscanner', zhName: '扫描全能王连接器', zhDesc: '接入扫描全能王文档识别能力（按官方接口边界使用）。' },
  { category: BUILTIN_CATEGORY_MODULE, id: 'module-knowledge', name: 'knowledge', zhName: '本地知识库（挂接+静默解析）', zhDesc: '把任意文件夹/整盘挂接为知识库，扫描并静默解析可读文档，失败可见可重试，全流程在本机完成。' },
  { category: BUILTIN_CATEGORY_MODULE, id: 'module-imacloud', name: 'ima-cloud', zhName: 'ima 云知识库挂接', zhDesc: '输入授权参数挂接 ima 云知识库，显示其文件列表，不需本地模型重新解析。' },
  { category: BUILTIN_CATEGORY_MODULE, id: 'module-kb-chat', name: 'kb-chat', zhName: '对话 @知识库 源引', zhDesc: '在工作台对话中输入 @ 选择已挂接知识库，检索就绪语料并带溯源脚标进行流式回答。' },
  { category: BUILTIN_CATEGORY_MODULE, id: 'module-model-marketplace', name: 'model-marketplace', zhName: '模型广场（本地优先）', zhDesc: '按本机硬件推荐小模型，检测 Ollama/GGUF 运行时，支持下载、基准测试与本地推理路由。' },
  { category: BUILTIN_CATEGORY_MODULE, id: 'module-production', name: 'production', zhName: '七大 AI 生产线', zhDesc: '知识→数据→模型→能力→智能体→系统→部署的资产链与质量门，产出可追溯、可验收。' },
  { category: BUILTIN_CATEGORY_MODULE, id: 'module-mcp-review', name: 'mcp-review', zhName: 'MCP 服务审查登记', zhDesc: '登记第三方 MCP 服务先进入审查清单，不在本页面执行命令或读取密钥。' },
  { category: BUILTIN_CATEGORY_MODULE, id: 'module-credential-vault', name: 'credential-vault', zhName: '凭证保险库（系统级加密）', zhDesc: '连接器与本地服务的令牌用系统加密保存于桌面主进程，渲染层与日志不下发明文。' },
  { category: BUILTIN_CATEGORY_MODULE, id: 'module-account', name: 'account', zhName: '账号与本地业务空间', zhDesc: 'XYOS 本地业务空间账号体系，开发空间与业务空间共用身份。' },
]

function manifestPriority(name: string): number {
  if (/plugin|app|mcp|manifest|extension|market/i.test(name)) return 2
  if (/settings|config|options|info|readme/i.test(name)) return 1
  return 0
}

/** 聚合键：去掉末尾“版本号”段，让同插件多版本合并成一张卡片。 */
function pluginGroupKey(pluginPath: string): string {
  const segments = pluginPath.split(sep).filter((part) => part !== '')
  const last = segments[segments.length - 1] ?? ''
  if (/^v?\d+\.\d+/.test(last)) return segments.slice(0, -1).join('/')
  return segments.join('/')
}

function pluginImportRootOf(dshHome: string): string {
  return join(dshHome, 'plugins', 'imported')
}

function markImported(plugin: Omit<CapabilityPlugin, 'imported' | 'importDestination' | 'managed'>, importRoot: string): CapabilityPlugin {
  const dirName = safeName(plugin.id)
  const destination = join(importRoot, dirName)
  const managed = existsSync(join(destination, '.xyai-installed.json'))
  const imported = existsSync(destination)
  return {
    ...plugin,
    imported,
    managed,
    ...(imported ? { importDestination: destination } : {}),
  }
}

/** 优先识别 Codex `.codex-plugin/plugin.json` 包；其余回退到通用 JSON 清单扫描。 */
function scanExternalPlugins(root: string, agentId: string, sourceLabel: string, importRoot: string): CapabilityPlugin[] {
  const grouped = new Map<string, CapabilityPlugin>()
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  while (stack.length > 0 && grouped.size < 160) {
    const current = stack.pop()
    if (current === undefined) continue
    let names: string[]
    try { names = readdirSync(current.dir) } catch { continue }
    const codexManifest = join(current.dir, '.codex-plugin', 'plugin.json')
    if (existsSync(codexManifest)) {
      const obj = readJsonObject(codexManifest)
      const interfaceObj = (typeof obj?.['interface'] === 'object' && obj['interface'] !== null && !Array.isArray(obj['interface']))
        ? obj['interface'] as Record<string, unknown>
        : undefined
      const pluginIdRaw = textOf(obj?.['name'] ?? obj?.['id'] ?? '')
      const displayName = textOf(interfaceObj?.['displayName'] ?? obj?.['name'] ?? '') || basename(dirname(current.dir))
      const summary = textOf(interfaceObj?.['shortDescription'] ?? interfaceObj?.['longDescription'] ?? obj?.['description'] ?? '')
      const version = textOf(obj?.['version']) || pluginVersion(basename(current.dir)) || undefined
      const pluginId = safeName(pluginIdRaw !== '' ? pluginIdRaw : displayName)
      const key = pluginGroupKey(current.dir)
      const next = markImported({
        agentId, sourceLabel, kind: 'codex-plugin', path: current.dir, id: pluginId,
        displayName: displayName !== '' ? displayName : pluginId,
        ...(version === undefined ? {} : { version }),
        ...(summary === '' ? {} : { summary: summary.slice(0, 300) }),
      }, importRoot)
      const existing = grouped.get(key)
      if (existing === undefined || (next.version !== undefined && (existing.version === undefined || next.version.length >= existing.version.length))) {
        grouped.set(key, next)
      }
      continue
    }
    for (const name of names) {
      if (name === '.' || name === '..') continue
      const full = join(current.dir, name)
      if (isDirectory(full)) {
        if (current.depth < 4 && !IGNORED_DIRS.has(name) && name !== 'node_modules') stack.push({ dir: full, depth: current.depth + 1 })
      }
    }
  }

  if (grouped.size === 0) {
    const files = collectPluginJson(root, 3, 500)
    const byDir = new Map<string, { file: string; priority: number }>()
    for (const file of files) {
      const dir = dirname(file)
      const name = basename(file)
      const priority = manifestPriority(name)
      const existing = byDir.get(dir)
      if (existing === undefined || priority > existing.priority || (priority === existing.priority && file.length < existing.file.length)) {
        byDir.set(dir, { file, priority })
      }
    }
    for (const { file } of byDir.values()) {
      const dir = dirname(file)
      const key = pluginGroupKey(dir)
      const obj = readJsonObject(file)
      const pluginIdRaw = textOf(obj?.['id'] ?? obj?.['pluginName'] ?? obj?.['name'] ?? '')
      const groupDirName = (key.split('/').pop() ?? dir).replace(/[-_]+/g, ' ')
      const pluginId = safeName(pluginIdRaw !== '' ? pluginIdRaw : dirname(dir) === dir ? dir : key.split('/').pop() ?? dir)
      const entryName = basename(file).replace(/\.json$/i, '')
      const version = textOf(obj?.['version']) || pluginVersion(entryName) || undefined
      const summaryRaw = textOf(obj?.['description'] ?? obj?.['summary'] ?? obj?.['title'] ?? '')
      const existingItem = grouped.get(key)
      const prefer = (existingItem === undefined || manifestPriority(entryName) > manifestPriority(existingItem.kind))
      if (existingItem !== undefined && !prefer && existingItem.version !== undefined && (version === undefined || version.length <= existingItem.version.length)) continue
      grouped.set(key, markImported({
        agentId, sourceLabel, kind: entryName, path: dir, id: pluginId,
        displayName: pluginIdRaw !== '' ? pluginIdRaw : (existingItem !== undefined && existingItem.displayName !== '' && !existingItem.displayName.endsWith('.json') ? existingItem.displayName : groupDirName),
        ...(version === undefined ? {} : { version }),
        ...(summaryRaw === '' ? {} : { summary: summaryRaw.slice(0, 300) }),
      }, importRoot))
    }
  }

  // 本应用已导入但来源扫描未覆盖的副本
  if (agentId === DSH_AGENT_ID && existsSync(importRoot)) {
    let names: string[] = []
    try { names = readdirSync(importRoot) } catch { names = [] }
    for (const name of names) {
      const destination = join(importRoot, name)
      if (!isDirectory(destination)) continue
      const managed = existsSync(join(destination, '.xyai-installed.json'))
      const marker = managed ? readJsonObject(join(destination, '.xyai-installed.json')) : undefined
      const id = safeName(name)
      if ([...grouped.values()].some((item) => item.id === id || item.importDestination === destination)) continue
      grouped.set(destination, {
        agentId, sourceLabel, kind: 'imported', path: destination, id,
        displayName: textOf(marker?.['displayName']) || name.replace(/[-_]+/g, ' '),
        summary: '已导入到本应用的插件副本',
        imported: true, managed, importDestination: destination,
      })
    }
  }

  return Array.from(grouped.values()).slice(0, 160)
}
export function scanAgentCatalog(options: ScanOptions): AgentCatalog {
  const dshHome = options.dshHome
  const home = options.homeDir ?? HOME
  const importRoot = pluginImportRootOf(dshHome)
  const targets: Array<{ rootId: string; label: string; path: string }> = []
  const agentHome = (meta: { id: string }): string => (meta.id === DSH_AGENT_ID ? dshHome : join(home, meta.id === 'shared' ? '.agents' : '.' + meta.id))
  const skillDirOf = (meta: { id: string; skillRel?: string }): string | undefined => {
    if (meta.skillRel === undefined) return undefined
    return join(agentHome(meta), meta.skillRel)
  }
  for (const meta of AGENT_META) {
    if (!meta.targetable) continue
    const dir = skillDirOf(meta)
    if (dir !== undefined) targets.push({ rootId: meta.id, label: meta.label, path: dir })
  }
  const skillRoots: AgentRootInfo[] = []
  const skills: CapabilitySkill[] = []
  const pluginRoots: AgentRootInfo[] = []
  const plugins: CapabilityPlugin[] = []
  const notes: string[] = []
  const seenPluginRoots = new Set<string>()
  for (const meta of AGENT_META) {
    const dir = skillDirOf(meta)
    if (dir !== undefined && existsSync(dir)) {
      skillRoots.push({ id: meta.id, label: meta.label, kind: 'skills', path: dir })
      skills.push(...scanSkillsDir(dir, meta.id, meta.label, targets))
    }
    for (const rel of meta.pluginRels ?? []) {
      const pluginDir = join(agentHome(meta), rel)
      if (pluginDir === '' || !existsSync(pluginDir) || seenPluginRoots.has(pluginDir)) continue
      seenPluginRoots.add(pluginDir)
      pluginRoots.push({ id: meta.id + '-plugins-' + rel.replace(/[\\/]/g, '-'), label: meta.label, kind: 'plugins', path: pluginDir })
      plugins.push(...scanExternalPlugins(pluginDir, meta.id, meta.label, importRoot))
    }
  }
  if (!existsSync(join(dshHome, 'skills'))) {
    notes.push('XYAI/DSH 技能目录尚为空：在本页把技能“安装到本应用”后即会创建并由 DSH 技能工作区扫描。')
  }
  // 去重：同 id+来源优先保留有版本/摘要的条目
  const deduped = new Map<string, CapabilityPlugin>()
  for (const plugin of plugins) {
    const key = plugin.agentId + '::' + plugin.id
    const existing = deduped.get(key)
    if (existing === undefined) { deduped.set(key, plugin); continue }
    const score = (item: CapabilityPlugin): number => (item.summary ? 2 : 0) + (item.version ? 1 : 0) + (item.kind === 'codex-plugin' ? 3 : 0)
    if (score(plugin) >= score(existing)) deduped.set(key, plugin)
  }
  return {
    scannedAt: new Date().toISOString(), notes, skillRoots, skills, pluginRoots,
    plugins: Array.from(deduped.values()),
    builtins: BUILTIN_DEFS.map((item) => ({ ...item })),
    installTargets: targets.map((target) => ({ id: target.rootId, label: target.label, kind: 'skills', path: target.path })),
    pluginImportRoot: importRoot,
  }
}

export function installTargetsFor(catalog: AgentCatalog): ReadonlyArray<{ rootId: string; label: string; path: string }> {
  return catalog.installTargets.map((target) => ({ rootId: target.id, label: target.label, path: target.path }))
}

/** 把技能目录整体复制进目标软件技能根（目标根必须来自白名单）。 */
export function installSkillFiles(catalog: AgentCatalog, sourceSkillPath: string, targetRootId: string): InstallOutcome {
  const skill = catalog.skills.find((item) => item.path === sourceSkillPath)
  if (skill === undefined) return { ok: false, message: '技能来源不在已识别清单中，已取消。', rootId: targetRootId, dirName: '', destination: '' }
  const target = catalog.installTargets.find((item) => item.id === targetRootId)
  if (target === undefined) return { ok: false, message: '安装目标不可用。', rootId: targetRootId, dirName: '', destination: '' }
  const dirName = safeName(skill.dir)
  const destination = join(target.path, dirName)
  if (skill.path === destination) return { ok: true, message: '该技能本就位于此目录，无需复制。', rootId: targetRootId, dirName, destination }
  try {
    if (existsSync(destination)) return { ok: true, message: '目标目录已有同名技能（未覆盖，可先移除）。', rootId: targetRootId, dirName, destination }
    mkdirSync(target.path, { recursive: true })
    cpSync(skill.path, destination, { recursive: true, dereference: true })
    writeFileSync(join(destination, '.xyai-installed.json'), JSON.stringify({ tool: 'xyai-agent-capability-center', source: skill.path, dirName, installedAt: new Date().toISOString() }, null, 2), 'utf8')
    return { ok: true, message: '已安装到目标技能目录，重启目标软件后即会生效。', rootId: targetRootId, dirName, destination }
  } catch (error) {
    return { ok: false, message: '安装失败：' + (error instanceof Error ? error.message : String(error)), rootId: targetRootId, dirName, destination }
  }
}

/** 把已识别插件复制进本应用 plugins/imported（只读副本，不执行第三方代码）。 */
export function installPluginFiles(catalog: AgentCatalog, sourcePluginPath: string): InstallOutcome {
  const plugin = catalog.plugins.find((item) => item.path === sourcePluginPath)
  if (plugin === undefined || plugin.path === undefined) {
    return { ok: false, message: '插件来源不在已识别清单中，已取消。', rootId: DSH_AGENT_ID, dirName: '', destination: '' }
  }
  const dirName = safeName(plugin.id)
  const destination = join(catalog.pluginImportRoot, dirName)
  if (plugin.path === destination) return { ok: true, message: '该插件已在本应用导入目录中。', rootId: DSH_AGENT_ID, dirName, destination }
  try {
    if (existsSync(destination)) return { ok: true, message: '本应用已有同名导入副本（未覆盖，可先移除）。', rootId: DSH_AGENT_ID, dirName, destination }
    mkdirSync(catalog.pluginImportRoot, { recursive: true })
    cpSync(plugin.path, destination, { recursive: true, dereference: true })
    writeFileSync(join(destination, '.xyai-installed.json'), JSON.stringify({
      tool: 'xyai-agent-capability-center', kind: 'plugin', source: plugin.path, displayName: plugin.displayName,
      dirName, installedAt: new Date().toISOString(),
    }, null, 2), 'utf8')
    return { ok: true, message: '已导入到本应用插件目录（副本，不自动执行）。', rootId: DSH_AGENT_ID, dirName, destination }
  } catch (error) {
    return { ok: false, message: '导入失败：' + (error instanceof Error ? error.message : String(error)), rootId: DSH_AGENT_ID, dirName, destination }
  }
}

/** 从用户选择的本机目录导入技能（要求含 SKILL.md）。 */
export function importSkillDirectory(catalog: AgentCatalog, sourceDir: string, targetRootId = DSH_AGENT_ID): InstallOutcome {
  const skillFile = join(sourceDir, 'SKILL.md')
  if (!existsSync(skillFile)) return { ok: false, message: '所选目录缺少 SKILL.md，不是可导入的技能包。', rootId: targetRootId, dirName: '', destination: '' }
  const target = catalog.installTargets.find((item) => item.id === targetRootId)
  if (target === undefined) return { ok: false, message: '安装目标不可用。', rootId: targetRootId, dirName: '', destination: '' }
  const dirName = safeName(basename(sourceDir))
  const destination = join(target.path, dirName)
  try {
    if (existsSync(destination)) return { ok: false, message: '目标已有同名技能目录，请先改名或移除后再导入。', rootId: targetRootId, dirName, destination }
    mkdirSync(target.path, { recursive: true })
    cpSync(sourceDir, destination, { recursive: true, dereference: true })
    writeFileSync(join(destination, '.xyai-installed.json'), JSON.stringify({ tool: 'xyai-agent-capability-center', source: sourceDir, dirName, importedAt: new Date().toISOString() }, null, 2), 'utf8')
    return { ok: true, message: '已导入技能到目标目录。', rootId: targetRootId, dirName, destination }
  } catch (error) {
    return { ok: false, message: '导入失败：' + (error instanceof Error ? error.message : String(error)), rootId: targetRootId, dirName, destination }
  }
}

/** 从用户选择的本机目录导入插件副本到本应用。 */
export function importPluginDirectory(catalog: AgentCatalog, sourceDir: string): InstallOutcome {
  if (!isDirectory(sourceDir)) return { ok: false, message: '请选择一个插件目录。', rootId: DSH_AGENT_ID, dirName: '', destination: '' }
  const dirName = safeName(basename(sourceDir))
  const destination = join(catalog.pluginImportRoot, dirName)
  try {
    if (existsSync(destination)) return { ok: false, message: '本应用已有同名导入副本，请先移除后再导入。', rootId: DSH_AGENT_ID, dirName, destination }
    mkdirSync(catalog.pluginImportRoot, { recursive: true })
    cpSync(sourceDir, destination, { recursive: true, dereference: true })
    writeFileSync(join(destination, '.xyai-installed.json'), JSON.stringify({
      tool: 'xyai-agent-capability-center', kind: 'plugin', source: sourceDir, displayName: dirName,
      dirName, importedAt: new Date().toISOString(),
    }, null, 2), 'utf8')
    return { ok: true, message: '已导入插件副本到本应用。', rootId: DSH_AGENT_ID, dirName, destination }
  } catch (error) {
    return { ok: false, message: '导入失败：' + (error instanceof Error ? error.message : String(error)), rootId: DSH_AGENT_ID, dirName, destination }
  }
}

/** 删除指定技能目录（仅限白名单目标根下的直接子目录，绝不删除根目录）。 */
export function removeSkillFiles(catalog: AgentCatalog, targetRootId: string, dirName: string): InstallOutcome {
  const target = catalog.installTargets.find((item) => item.id === targetRootId)
  if (target === undefined) return { ok: false, message: '安装目标不可用。', rootId: targetRootId, dirName, destination: '' }
  const safeDir = safeName(dirName)
  if (safeDir === '' || safeDir === '.' || safeDir === '..' || safeDir === 'skills') {
    return { ok: false, message: '拒绝删除技能根目录。', rootId: targetRootId, dirName, destination: '' }
  }
  const destination = join(target.path, safeDir)
  if (!destination.startsWith(target.path + sep)) return { ok: false, message: '路径越界，已取消。', rootId: targetRootId, dirName, destination }
  if (!existsSync(destination)) return { ok: true, message: '目录不存在（视为已移除）。', rootId: targetRootId, dirName, destination }
  if (!existsSync(join(destination, '.xyai-installed.json'))) {
    return { ok: false, message: '该目录不是由本页装入的副本，为避免误删软件自带技能，已取消。', rootId: targetRootId, dirName, destination }
  }
  try {
    rmSync(destination, { recursive: true, force: true })
    return { ok: true, message: '已移除。', rootId: targetRootId, dirName, destination }
  } catch (error) {
    return { ok: false, message: '移除失败：' + (error instanceof Error ? error.message : String(error)), rootId: targetRootId, dirName, destination }
  }
}

/** 移除本应用 plugins/imported 下由本页装入的插件副本。 */
export function removePluginFiles(catalog: AgentCatalog, dirName: string): InstallOutcome {
  const safeDir = safeName(dirName)
  if (safeDir === '' || safeDir === '.' || safeDir === '..' || safeDir === 'imported' || safeDir === 'plugins') {
    return { ok: false, message: '拒绝删除插件根目录。', rootId: DSH_AGENT_ID, dirName, destination: '' }
  }
  const destination = join(catalog.pluginImportRoot, safeDir)
  if (!destination.startsWith(catalog.pluginImportRoot + sep)) {
    return { ok: false, message: '路径越界，已取消。', rootId: DSH_AGENT_ID, dirName, destination }
  }
  if (!existsSync(destination)) return { ok: true, message: '目录不存在（视为已移除）。', rootId: DSH_AGENT_ID, dirName, destination }
  if (!existsSync(join(destination, '.xyai-installed.json'))) {
    return { ok: false, message: '该目录不是由本页导入的副本，已取消。', rootId: DSH_AGENT_ID, dirName, destination }
  }
  try {
    rmSync(destination, { recursive: true, force: true })
    return { ok: true, message: '已移除本应用中的插件副本。', rootId: DSH_AGENT_ID, dirName, destination }
  } catch (error) {
    return { ok: false, message: '移除失败：' + (error instanceof Error ? error.message : String(error)), rootId: DSH_AGENT_ID, dirName, destination }
  }
}

/** 可安全“打开目录”的路径集合（仅限已识别技能目录与插件目录）。 */
export function collectOpenablePaths(catalog: AgentCatalog): Set<string> {
  const set = new Set<string>()
  for (const skill of catalog.skills) set.add(skill.path)
  for (const plugin of catalog.plugins) if (plugin.path !== undefined) set.add(plugin.path)
  for (const root of catalog.skillRoots) set.add(root.path)
  for (const root of catalog.pluginRoots) set.add(root.path)
  set.add(catalog.pluginImportRoot)
  return set
}
