/** Freework 模型市场：根据用户电脑配置推荐国内外大模型，提供最快下载节点链接，一键下载部署到本地。 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { detectGpu, type GpuInfo } from './ollama-detect.ts'

/** 模型来源（国内/国外）。 */
export type ModelOrigin = 'domestic' | 'international'

/** 模型格式。 */
export type ModelFormat = 'ollama' | 'gguf' | 'safetensors'

/** 下载节点。 */
export interface DownloadNode {
  /** 节点名称（如 'HF-Mirror'、'ModelScope'）。 */
  readonly name: string
  /** 节点 URL。 */
  readonly url: string
  /** 节点类型（国内/国外）。 */
  readonly type: 'domestic' | 'international'
  /** 预估下载速度（MB/s）。 */
  readonly estimatedSpeed?: number
}

/** 模型下载链接。 */
export interface ModelDownloadLink {
  /** 下载节点。 */
  readonly node: DownloadNode
  /** 直接下载 URL。 */
  readonly downloadUrl: string
  /** 文件大小（字节）。 */
  readonly fileSize?: number
  /** 文件名。 */
  readonly fileName: string
}

/** 市场模型条目。 */
export interface MarketplaceModel {
  /** 模型 ID（如 'qwen3.6:35b-a3b'）。 */
  readonly id: string
  /** 用户可见名称。 */
  readonly displayName: string
  /** 模型来源（国内/国外）。 */
  readonly origin: ModelOrigin
  /** 模型格式。 */
  readonly format: ModelFormat
  /** 模型参数量（如 '35B'）。 */
  readonly parameters: string
  /** 是否为 MoE 架构。 */
  readonly isMoe: boolean
  /** 预估显存占用（MiB）。 */
  readonly estimatedVramMiB: number
  /** 预估内存占用（MiB）。 */
  readonly estimatedRamMiB: number
  /** 是否需要 CPU offload。 */
  readonly needsCpuOffload: boolean
  /** 推荐等级（'best' | 'good' | 'fast'）。 */
  readonly tier: 'best' | 'good' | 'fast'
  /** 推荐理由。 */
  readonly reason: string
  /** 在行业智能体生产流程中的推荐用途。 */
  readonly useCases?: readonly string[]
  /** 权重许可证提示；下载前仍应展示上游原文。 */
  readonly license?: string
  /** 适用显存范围（MiB）。 */
  readonly minVramMiB: number
  /** 量化格式（如 'Q4_K_M'、'Q5_K_XL'）。 */
  readonly quantization?: string
  /** 下载链接列表。 */
  readonly downloadLinks: ModelDownloadLink[]
  /** Ollama 拉取命令（如果支持 Ollama）。 */
  readonly ollamaPullCommand?: string
  /** 在当前硬件上的保守生成速度区间；部署后以实测为准。 */
  readonly estimatedTokensPerSecond?: string
  /** 无 Ollama 时由 XYAI 内置下载器直接部署的固定 GGUF。 */
  readonly nativeDownload?: {
    readonly repository: string
    readonly fileName: string
    readonly expectedSizeMiB: number
  }
  /** 是否已安装。 */
  readonly installed?: boolean
}

/** 国内下载节点。 */
const DOMESTIC_NODES: readonly DownloadNode[] = [
  {
    name: 'HF-Mirror',
    url: 'https://hf-mirror.com',
    type: 'domestic',
    estimatedSpeed: 50,
  },
  {
    name: 'ModelScope（魔搭）',
    url: 'https://modelscope.cn',
    type: 'domestic',
    estimatedSpeed: 40,
  },
  {
    name: 'OpenI 启智',
    url: 'https://openi.org.cn',
    type: 'domestic',
    estimatedSpeed: 30,
  },
  {
    name: 'Gitee AI',
    url: 'https://ai.gitee.com',
    type: 'domestic',
    estimatedSpeed: 35,
  },
]

/** 国外下载节点。 */
const INTERNATIONAL_NODES: readonly DownloadNode[] = [
  {
    name: 'HuggingFace',
    url: 'https://huggingface.co',
    type: 'international',
    estimatedSpeed: 10,
  },
  {
    name: 'Ollama Library',
    url: 'https://ollama.com',
    type: 'international',
    estimatedSpeed: 15,
  },
]

/** 根据用户电脑配置获取推荐模型列表。 */
export async function getRecommendedModels(gpuOverride?: GpuInfo | null): Promise<MarketplaceModel[]> {
  const gpu = gpuOverride === undefined ? await detectGpu() : gpuOverride ?? undefined
  const vramMiB = gpu?.vramMiB ?? 0

  const models: MarketplaceModel[] = []

  // 8GB 显存档：速度优先，避免默认推荐 7B/8B 或 CPU offload。
  if (vramMiB >= 8000 && vramMiB < 12000) {
    models.push(
      createModel({
        id: 'qwen3:1.7b',
        displayName: 'Qwen3 1.7B（中文极速首选）',
        origin: 'domestic',
        format: 'ollama',
        parameters: '1.7B',
        isMoe: false,
        estimatedVramMiB: 1800,
        estimatedRamMiB: 2800,
        needsCpuOffload: false,
        tier: 'best',
        reason: '约 1.1GB Q4 权重，可完整驻留显存；比当前 8B 更适合高频中文任务和工具调用',
        useCases: ['会话摘要', '知识预处理', '任务路由', '轻量 Agent'],
        license: 'Apache-2.0',
        minVramMiB: 2000,
        quantization: 'Q4_K_M',
        ollamaPullCommand: 'ollama pull qwen3:1.7b',
        estimatedTokensPerSecond: '25–45 token/s',
        nativeDownload: {
          repository: 'unsloth/Qwen3-1.7B-GGUF',
          fileName: 'Qwen3-1.7B-Q4_K_M.gguf',
          expectedSizeMiB: 1137,
        },
      }),
      createModel({
        id: 'qwen2.5-coder:3b',
        displayName: 'Qwen2.5-Coder 3B（本地编码）',
        origin: 'domestic',
        format: 'ollama',
        parameters: '3B',
        isMoe: false,
        estimatedVramMiB: 2600,
        estimatedRamMiB: 3800,
        needsCpuOffload: false,
        tier: 'good',
        reason: '约 1.9GB Q4 权重，全显存运行；代码生成质量与响应速度更均衡',
        useCases: ['插件开发', 'MCP 开发', 'Skills 生产', '代码审查'],
        license: 'Apache-2.0',
        minVramMiB: 3000,
        quantization: 'Q4_K_M',
        ollamaPullCommand: 'ollama pull qwen2.5-coder:3b',
        estimatedTokensPerSecond: '18–32 token/s',
        nativeDownload: {
          repository: 'unsloth/Qwen2.5-Coder-3B-Instruct-GGUF',
          fileName: 'Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf',
          expectedSizeMiB: 1976,
        },
      }),
      createModel({
        id: 'gemma3:1b',
        displayName: 'Gemma 3 1B（通用极速）',
        origin: 'international',
        format: 'gguf',
        parameters: '1B',
        isMoe: false,
        estimatedVramMiB: 1300,
        estimatedRamMiB: 2200,
        needsCpuOffload: false,
        tier: 'fast',
        reason: '约 806MB Q4 权重，启动快、占用低，适合摘要、分类和批处理',
        useCases: ['批量摘要', '文本分类', '信息抽取', '规则整理'],
        license: 'Gemma Terms',
        minVramMiB: 1500,
        quantization: 'Q4_K_M',
        ollamaPullCommand: 'ollama pull gemma3:1b',
        estimatedTokensPerSecond: '35–60 token/s',
        nativeDownload: {
          repository: 'ggml-org/gemma-3-1b-it-GGUF',
          fileName: 'gemma-3-1b-it-Q4_K_M.gguf',
          expectedSizeMiB: 806,
        },
      }),
      createModel({
        id: 'gemma3:270m',
        displayName: 'Gemma 3 270M（超轻任务）',
        origin: 'international',
        format: 'gguf',
        parameters: '270M',
        isMoe: false,
        estimatedVramMiB: 600,
        estimatedRamMiB: 1200,
        needsCpuOffload: false,
        tier: 'fast',
        reason: '约 241MB Q4 权重，只适合分类、路由、规则抽取等窄任务，不替代主模型',
        useCases: ['意图分类', '任务路由', '标签生成', '规则抽取'],
        license: 'Gemma Terms',
        minVramMiB: 0,
        quantization: 'Q4_K_M',
        ollamaPullCommand: 'ollama pull gemma3:270m',
        estimatedTokensPerSecond: '70+ token/s',
        nativeDownload: {
          repository: 'unsloth/gemma-3-270m-it-GGUF',
          fileName: 'gemma-3-270m-it-Q4_K_M.gguf',
          expectedSizeMiB: 241,
        },
      }),
      createModel({
        id: 'qwen3:4b',
        displayName: 'Qwen3 4B（质量优先）',
        origin: 'domestic',
        format: 'ollama',
        parameters: '4B',
        isMoe: false,
        estimatedVramMiB: 3400,
        estimatedRamMiB: 5000,
        needsCpuOffload: false,
        tier: 'good',
        reason: '比 1.7B 质量更高，但速度较慢；需要更强推理质量时再部署',
        useCases: ['行业知识整理', '训练数据合成', 'Agent 编排'],
        license: 'Apache-2.0',
        minVramMiB: 4000,
        quantization: 'Q4_K_M',
        ollamaPullCommand: 'ollama pull qwen3:4b',
        estimatedTokensPerSecond: '12–22 token/s',
      }),
    )
  }

  // 12GB 显存档
  if (vramMiB >= 12000 && vramMiB < 16000) {
    models.push(
      createModel({
        id: 'qwen3-coder:30b-a3b',
        displayName: 'Qwen3-Coder 30B-A3B (MoE)',
        origin: 'domestic',
        format: 'ollama',
        parameters: '30B (3B active)',
        isMoe: true,
        estimatedVramMiB: 10000,
        estimatedRamMiB: 8000,
        needsCpuOffload: false,
        tier: 'best',
        reason: '12GB 档最佳编码模型',
        minVramMiB: 12000,
        quantization: 'Q4_K_M',
        ollamaPullCommand: 'ollama pull qwen3-coder:30b-a3b',
      }),
    )
  }

  // 16GB 显存档
  if (vramMiB >= 16000 && vramMiB < 24000) {
    models.push(
      createModel({
        id: 'qwen3.5:35b-a3b',
        displayName: 'Qwen3.5 35B-A3B (MoE)',
        origin: 'domestic',
        format: 'ollama',
        parameters: '35B (3B active)',
        isMoe: true,
        estimatedVramMiB: 14000,
        estimatedRamMiB: 10000,
        needsCpuOffload: false,
        tier: 'best',
        reason: '16GB 档最佳选择',
        minVramMiB: 16000,
        quantization: 'Q4_K_XL',
        ollamaPullCommand: 'ollama pull qwen3.5:35b-a3b',
      }),
    )
  }

  // 24GB+ 显存档
  if (vramMiB >= 24000) {
    models.push(
      createModel({
        id: 'qwen3.6:27b',
        displayName: 'Qwen3.6 27B',
        origin: 'domestic',
        format: 'ollama',
        parameters: '27B',
        isMoe: false,
        estimatedVramMiB: 18000,
        estimatedRamMiB: 16000,
        needsCpuOffload: false,
        tier: 'best',
        reason: '24GB 档最佳本地编码模型',
        minVramMiB: 24000,
        quantization: 'Q4_K_XL',
        ollamaPullCommand: 'ollama pull qwen3.6:27b',
      }),
    )
  }

  // 无 GPU 或低显存：CPU 推理模型
  if (vramMiB < 8000) {
    models.push(
      createModel({
        id: 'qwen3:4b',
        displayName: 'Qwen3 4B (CPU)',
        origin: 'domestic',
        format: 'ollama',
        parameters: '4B',
        isMoe: false,
        estimatedVramMiB: 0,
        estimatedRamMiB: 3000,
        needsCpuOffload: false,
        tier: 'fast',
        reason: '低配置推荐，CPU 推理',
        useCases: ['行业知识整理', '轻量 Agent', '训练样本生成'],
        license: 'Apache-2.0',
        minVramMiB: 0,
        quantization: 'Q4_K_M',
        ollamaPullCommand: 'ollama pull qwen3:4b',
      }),
      createModel({
        id: 'gemma3:4b',
        displayName: 'Gemma 3 4B (CPU)',
        origin: 'international',
        format: 'ollama',
        parameters: '4B',
        isMoe: false,
        estimatedVramMiB: 0,
        estimatedRamMiB: 3000,
        needsCpuOffload: false,
        tier: 'fast',
        reason: 'Google 出品，轻量多语言',
        useCases: ['摘要', '分类', '多语言资料整理'],
        license: 'Gemma Terms',
        minVramMiB: 0,
        quantization: 'Q4_K_M',
        ollamaPullCommand: 'ollama pull gemma3:4b',
      }),
      createModel({
        id: 'qwen3:1.7b',
        displayName: 'Qwen3 1.7B（极速生产）',
        origin: 'domestic',
        format: 'ollama',
        parameters: '1.7B',
        isMoe: false,
        estimatedVramMiB: 1400,
        estimatedRamMiB: 2600,
        needsCpuOffload: false,
        tier: 'fast',
        reason: '低资源中文首选，适合常驻执行知识预处理和工作流辅助任务',
        useCases: ['知识预处理', '会话摘要', '任务路由', '规则提取'],
        license: 'Apache-2.0',
        minVramMiB: 0,
        quantization: 'Q6_K',
        ollamaPullCommand: 'ollama pull qwen3:1.7b',
      }),
    )
  }

  // OmniInfer-LLM currently validates the Qwen2.5-VL family on-device. Keep
  // the desktop recommendation conservative: the 3B Q4 model fits mainstream
  // 6–8 GB GPUs, while Ollama owns its paired vision assets and version check.
  if (vramMiB >= 6000) {
    models.splice(Math.min(2, models.length), 0, createModel({
      id: 'qwen2.5vl:3b',
      displayName: 'Qwen2.5-VL 3B（端侧视觉理解）',
      origin: 'domestic',
      format: 'ollama',
      parameters: '3.75B',
      isMoe: false,
      estimatedVramMiB: 5200,
      estimatedRamMiB: 6500,
      needsCpuOffload: false,
      tier: 'good',
      reason: '约 3.2GB Q4_K_M，适合 6–8GB GPU；OmniInfer-LLM 已验证 Qwen2.5-VL 系列。通过 Ollama 0.7+ 部署可避免主模型与视觉组件错配。',
      useCases: ['扫描件理解', '图表解析', '界面截图分析', '视觉 Agent 验证'],
      license: 'Apache-2.0',
      minVramMiB: 6000,
      quantization: 'Q4_K_M',
      ollamaPullCommand: 'ollama pull qwen2.5vl:3b',
      estimatedTokensPerSecond: '10–20 token/s（文本；图片取决于分辨率）',
    }))
  }

  return models
}

/** 创建模型条目（自动生成下载链接）。 */
function createModel(params: Omit<MarketplaceModel, 'downloadLinks'>): MarketplaceModel {
  const links: ModelDownloadLink[] = []

  // Ollama 格式：生成国内/国外下载链接
  if (params.format === 'ollama') {
    // 国内节点
    for (const node of DOMESTIC_NODES) {
      links.push({
        node,
        downloadUrl: `${node.url}/ollama/library/${params.id.split(':')[0]}`,
        fileName: `${params.id.replace(':', '-')}.gguf`,
      })
    }
    // 国外节点
    for (const node of INTERNATIONAL_NODES) {
      links.push({
        node,
        downloadUrl: `${node.url}/library/${params.id.split(':')[0]}`,
        fileName: `${params.id.replace(':', '-')}.gguf`,
      })
    }
  }

  return {
    ...params,
    downloadLinks: links,
  }
}

/** 获取系统总内存（MiB）。 */
export function getTotalRamMiB(): number {
  try {
    const os = require('os')
    return Math.floor(os.totalmem() / 1024 / 1024)
  } catch {
    return 8192 // 默认 8GB
  }
}

/** 获取模型的推荐下载节点（根据地理位置自动选择）。 */
export function getRecommendedNode(model: MarketplaceModel): ModelDownloadLink | undefined {
  // 优先国内节点
  const domesticLink = model.downloadLinks.find(link => link.node.type === 'domestic')
  if (domesticLink !== undefined) return domesticLink

  // 回退到国外节点
  return model.downloadLinks[0]
}

/** 生成 Ollama 拉取命令（带镜像加速）。 */
export function generateOllamaPullCommand(model: MarketplaceModel, useMirror: boolean = true): string {
  if (model.ollamaPullCommand === undefined) {
    return `# 该模型不支持 Ollama 直接拉取，请手动下载 GGUF 文件`
  }

  if (useMirror) {
    // 使用国内镜像加速
    return `# 使用国内镜像加速下载
OLLAMA_HOST=https://ollama-mirror.com ${model.ollamaPullCommand}

# 或者直接下载（如果镜像不可用）
${model.ollamaPullCommand}`
  }

  return model.ollamaPullCommand
}

/** 生成 HF-Mirror 下载命令。 */
export function generateHfMirrorDownloadCommand(model: MarketplaceModel): string {
  const modelName = model.id.split(':')[0]
  return `# 使用 HF-Mirror 下载 GGUF 文件
HF_ENDPOINT=https://hf-mirror.com huggingface-cli download TheBloke/${modelName}-GGUF --local-dir ./models/${modelName}

# 或者使用 wget 直接下载
wget https://hf-mirror.com/TheBloke/${modelName}-GGUF/resolve/main/${modelName}.${model.quantization ?? 'Q4_K_M'}.gguf -O ./models/${modelName}/${modelName}.${model.quantization ?? 'Q4_K_M'}.gguf`
}

/** 生成 ModelScope 下载命令。 */
export function generateModelScopeDownloadCommand(model: MarketplaceModel): string {
  const modelName = model.id.split(':')[0]
  return `# 使用 ModelScope 下载
modelscope download --model TheBloke/${modelName}-GGUF --local_dir ./models/${modelName}

# 或者使用 git clone
git clone https://modelscope.cn/TheBloke/${modelName}-GGUF.git ./models/${modelName}`
}

/** 常见的本地模型目录。 */
const COMMON_MODEL_DIRS = [
  'E:\\models',
  'C:\\models',
  process.env.XYAI_MODEL_DIR ?? join(process.env.USERPROFILE ?? '', '.dsh', 'xyai', 'models'),
  join(process.env.USERPROFILE ?? '', 'models'),
  join(process.env.USERPROFILE ?? '', '.ollama', 'models'),
  join(process.env.LOCALAPPDATA ?? '', 'lm-studio', 'models'),
]

/** 本地检测到的 GGUF 文件。 */
export interface LocalGgufModel {
  /** 文件完整路径。 */
  readonly filePath: string
  /** 文件名。 */
  readonly fileName: string
  /** 文件大小（字节）。 */
  readonly fileSize: number
  /** 推测的模型名称。 */
  readonly inferredName: string
  /** 推测的量化格式。 */
  readonly inferredQuantization: string | undefined
  /** 同目录自动关联的多模态投影文件；它不是可独立调用的聊天模型。 */
  readonly projectorPath?: string
  /** 多模态投影文件大小（字节）。 */
  readonly projectorSize?: number
}

/** 扫描本地常见目录，检测已下载的 GGUF 文件。 */
export function scanLocalGgufModels(customDirs?: readonly string[]): LocalGgufModel[] {
  const dirs = [...COMMON_MODEL_DIRS, ...(customDirs ?? [])]
  const models: LocalGgufModel[] = []
  const seen = new Set<string>()

  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    try {
      scanDirectory(dir, models, seen, 0)
    } catch { /* 忽略无权限目录 */ }
  }

  return models
}

/** 递归扫描目录（最大深度 3）。 */
function scanDirectory(
  dir: string,
  models: LocalGgufModel[],
  seen: Set<string>,
  depth: number,
): void {
  if (depth > 3) return

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        scanDirectory(fullPath, models, seen, depth + 1)
      } else if (isCallableGguf(entry.name) && !seen.has(fullPath)) {
        seen.add(fullPath)
        try {
          const stat = statSync(fullPath)
          const projector = findMultimodalProjector(dirname(fullPath))
          models.push({
            filePath: fullPath,
            fileName: entry.name,
            fileSize: stat.size,
            inferredName: inferModelName(entry.name),
            inferredQuantization: inferQuantization(entry.name),
            ...(projector === undefined ? {} : {
              projectorPath: projector.filePath,
              projectorSize: projector.fileSize,
            }),
          })
        } catch { /* 忽略 stat 错误 */ }
      }
    }
  } catch { /* 忽略 readdir 错误 */ }
}

/** Locate a vision projector beside its main GGUF, preferring the highest-fidelity sidecar. */
function findMultimodalProjector(dir: string): { filePath: string; fileSize: number } | undefined {
  try {
    const candidates = readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^mmproj(?:[-_.].*)?\.gguf$/i.test(entry.name))
      .map(entry => {
        const filePath = join(dir, entry.name)
        return { filePath, fileSize: statSync(filePath).size, name: entry.name.toLowerCase() }
      })
      .sort((left, right) => {
        const leftF16 = /(?:^|[-_.])f16(?:[-_.]|\.gguf$)/i.test(left.name) ? 1 : 0
        const rightF16 = /(?:^|[-_.])f16(?:[-_.]|\.gguf$)/i.test(right.name) ? 1 : 0
        return rightF16 - leftF16 || right.fileSize - left.fileSize || left.name.localeCompare(right.name)
      })
    return candidates[0]
  } catch {
    return undefined
  }
}

/** Projection/adapter GGUF files (commonly `mmproj-*`) cannot answer chat requests alone. */
export function isCallableGguf(fileName: string): boolean {
  const normalized = fileName.toLowerCase()
  return normalized.endsWith('.gguf')
    && !normalized.startsWith('mmproj-')
    && !normalized.includes('.mmproj.')
}

/** 从文件名推断模型名称。 */
function inferModelName(fileName: string): string {
  // 移除 .gguf 后缀
  let name = fileName.replace(/\.gguf$/i, '')

  // 移除量化后缀（如 Q4_K_M、f16）
  name = name.replace(/[-_]?(Q\d+_\w+|f16|fp16|bf16|int8|int4)$/i, '')

  // Qwen's decimal generation marker is commonly written with a dash in GGUF
  // filenames (`qwen3-5-*`). Preserve the public model name instead of showing
  // it as three unrelated numbers in the conversation selector.
  name = name.replace(/^qwen3[-_]5(?=[-_]|$)/i, 'Qwen3.5')

  // 移除 mmproj- 前缀
  name = name.replace(/^mmproj[-_]?/i, '')

  // 清理分隔符
  name = name.replace(/[-_]+/g, ' ').trim()

  return name || fileName
}

/** 从文件名推断量化格式。 */
function inferQuantization(fileName: string): string | undefined {
  const match = fileName.match(/(Q\d+_\w+|f16|fp16|bf16|int8|int4)/i)
  return match?.[1]?.toUpperCase()
}

/** 生成 Ollama Modelfile（用于导入本地 GGUF）。 */
export function generateOllamaModelfile(ggufPath: string, _modelName: string): string {
  return `FROM "${ggufPath}"

# 模型参数
PARAMETER num_ctx 4096
PARAMETER temperature 0.7
`
}

/** 生成 Ollama 导入命令。 */
export function generateOllamaImportCommand(ggufPath: string, _modelName: string): string {
  const modelfile = generateOllamaModelfile(ggufPath, _modelName)
  return `# 创建 Modelfile
cat > Modelfile << 'EOF'
${modelfile}
EOF

# 导入到 Ollama
ollama create ${_modelName} -f Modelfile

# 测试运行
ollama run ${_modelName} "Hello"`
}
