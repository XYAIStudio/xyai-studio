import { fileURLToPath } from "node:url";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { LlmAdapter } from "@deepseek-ai/dsh-llm";
import { execFileSync, execSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { cpus, homedir, totalmem } from "node:os";
import { appendFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
//#region src/ollama-detect.ts
/** Freework Ollama 检测：探测本机 Ollama 安装状态、版本、GPU 信息。 */
/** Local-only hardware profile used to rank downloadable GGUF models. */
async function detectHardware() {
	const processors = cpus();
	return {
		cpuModel: processors[0]?.model.trim() ?? "未知 CPU",
		cpuCores: processors.length,
		memoryGiB: Math.round(totalmem() / 1024 ** 3),
		gpu: await detectGpu()
	};
}
/** 检测 Ollama 安装状态。 */
async function detectOllama() {
	const endpoint = process.env.OLLAMA_HOST ?? "http://localhost:11434";
	const installPath = findOllamaBinary();
	let version;
	if (installPath !== void 0) try {
		version = execSync(`"${installPath}" --version`, {
			encoding: "utf8",
			timeout: 5e3
		}).trim();
		const match = version.match(/ollama version (\d+\.\d+\.\d+)/);
		if (match !== null) version = match[1];
	} catch {}
	let running = false;
	try {
		running = (await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3e3) })).ok;
		if (running) try {
			const versionResponse = await fetch(`${endpoint}/api/version`, { signal: AbortSignal.timeout(3e3) });
			if (versionResponse.ok) {
				const payload = await versionResponse.json();
				if (typeof payload.version === "string" && payload.version.trim() !== "") version = payload.version.trim();
			}
		} catch {}
	} catch {}
	return {
		installed: installPath !== void 0,
		running,
		version,
		endpoint,
		installPath
	};
}
/** 检测 GPU 信息。 */
async function detectGpu() {
	const nvidiaInfo = await detectNvidiaGpu();
	if (nvidiaInfo !== void 0) return nvidiaInfo;
}
/** 检测 NVIDIA GPU。 */
async function detectNvidiaGpu() {
	const candidates = process.platform === "win32" ? [
		join(process.env.WINDIR ?? "C:\\Windows", "System32", "nvidia-smi.exe"),
		join(process.env.PROGRAMFILES ?? "C:\\Program Files", "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"),
		"nvidia-smi.exe"
	] : ["nvidia-smi"];
	for (const executable of candidates) {
		if (executable.includes("\\") && !existsSync(executable)) continue;
		try {
			const lines = execFileSync(executable, ["--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu", "--format=csv,noheader,nounits"], {
				encoding: "utf8",
				timeout: 5e3,
				windowsHide: true
			}).trim().split(/\r?\n/u);
			if (lines.length === 0) continue;
			const firstLine = lines[0];
			if (firstLine === void 0) continue;
			const parts = firstLine.split(",").map((s) => s.trim());
			if (parts.length < 3 || parts[0] === void 0 || parts[1] === void 0 || parts[2] === void 0) continue;
			const vramMiB = Number.parseInt(parts[1], 10);
			const vramFreeMiB = Number.parseInt(parts[2], 10);
			if (!Number.isFinite(vramMiB) || !Number.isFinite(vramFreeMiB)) continue;
			return {
				name: parts[0],
				vramMiB,
				vramFreeMiB,
				...parts[3] === void 0 ? {} : { vramUsedMiB: Number.parseInt(parts[3], 10) },
				...parts[4] === void 0 ? {} : { utilizationPercent: Number.parseInt(parts[4], 10) },
				vendor: "nvidia"
			};
		} catch {}
	}
}
/** 查找 Ollama 二进制路径。 */
function findOllamaBinary() {
	if (process.platform === "win32") {
		const paths = [
			join(process.env.LOCALAPPDATA ?? "", "Programs", "Ollama", "ollama.exe"),
			join(process.env.PROGRAMFILES ?? "", "Ollama", "ollama.exe"),
			join(process.env["PROGRAMFILES(X86)"] ?? "", "Ollama", "ollama.exe")
		];
		for (const p of paths) if (existsSync(p)) return p;
	}
	try {
		return execSync("which ollama", {
			encoding: "utf8",
			timeout: 3e3
		}).trim();
	} catch {}
	if (process.platform === "darwin") {
		const homebrewPath = "/opt/homebrew/bin/ollama";
		if (existsSync(homebrewPath)) return homebrewPath;
	}
}
//#endregion
//#region src/model-marketplace.ts
/** Freework 模型市场：根据用户电脑配置推荐国内外大模型，提供最快下载节点链接，一键下载部署到本地。 */
/** 国内下载节点。 */
const DOMESTIC_NODES = [
	{
		name: "HF-Mirror",
		url: "https://hf-mirror.com",
		type: "domestic",
		estimatedSpeed: 50
	},
	{
		name: "ModelScope（魔搭）",
		url: "https://modelscope.cn",
		type: "domestic",
		estimatedSpeed: 40
	},
	{
		name: "OpenI 启智",
		url: "https://openi.org.cn",
		type: "domestic",
		estimatedSpeed: 30
	},
	{
		name: "Gitee AI",
		url: "https://ai.gitee.com",
		type: "domestic",
		estimatedSpeed: 35
	}
];
/** 国外下载节点。 */
const INTERNATIONAL_NODES = [{
	name: "HuggingFace",
	url: "https://huggingface.co",
	type: "international",
	estimatedSpeed: 10
}, {
	name: "Ollama Library",
	url: "https://ollama.com",
	type: "international",
	estimatedSpeed: 15
}];
/** 根据用户电脑配置获取推荐模型列表。 */
async function getRecommendedModels(gpuOverride) {
	const vramMiB = (gpuOverride === void 0 ? await detectGpu() : gpuOverride ?? void 0)?.vramMiB ?? 0;
	const models = [];
	if (vramMiB >= 8e3 && vramMiB < 12e3) models.push(createModel({
		id: "qwen3:1.7b",
		displayName: "Qwen3 1.7B（中文极速首选）",
		origin: "domestic",
		format: "ollama",
		parameters: "1.7B",
		isMoe: false,
		estimatedVramMiB: 1800,
		estimatedRamMiB: 2800,
		needsCpuOffload: false,
		tier: "best",
		reason: "约 1.1GB Q4 权重，可完整驻留显存；比当前 8B 更适合高频中文任务和工具调用",
		useCases: [
			"会话摘要",
			"知识预处理",
			"任务路由",
			"轻量 Agent"
		],
		license: "Apache-2.0",
		minVramMiB: 2e3,
		quantization: "Q4_K_M",
		ollamaPullCommand: "ollama pull qwen3:1.7b",
		estimatedTokensPerSecond: "25–45 token/s",
		nativeDownload: {
			repository: "unsloth/Qwen3-1.7B-GGUF",
			fileName: "Qwen3-1.7B-Q4_K_M.gguf",
			expectedSizeMiB: 1137
		}
	}), createModel({
		id: "qwen2.5-coder:3b",
		displayName: "Qwen2.5-Coder 3B（本地编码）",
		origin: "domestic",
		format: "ollama",
		parameters: "3B",
		isMoe: false,
		estimatedVramMiB: 2600,
		estimatedRamMiB: 3800,
		needsCpuOffload: false,
		tier: "good",
		reason: "约 1.9GB Q4 权重，全显存运行；代码生成质量与响应速度更均衡",
		useCases: [
			"插件开发",
			"MCP 开发",
			"Skills 生产",
			"代码审查"
		],
		license: "Apache-2.0",
		minVramMiB: 3e3,
		quantization: "Q4_K_M",
		ollamaPullCommand: "ollama pull qwen2.5-coder:3b",
		estimatedTokensPerSecond: "18–32 token/s",
		nativeDownload: {
			repository: "unsloth/Qwen2.5-Coder-3B-Instruct-GGUF",
			fileName: "Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf",
			expectedSizeMiB: 1976
		}
	}), createModel({
		id: "gemma3:1b",
		displayName: "Gemma 3 1B（通用极速）",
		origin: "international",
		format: "gguf",
		parameters: "1B",
		isMoe: false,
		estimatedVramMiB: 1300,
		estimatedRamMiB: 2200,
		needsCpuOffload: false,
		tier: "fast",
		reason: "约 806MB Q4 权重，启动快、占用低，适合摘要、分类和批处理",
		useCases: [
			"批量摘要",
			"文本分类",
			"信息抽取",
			"规则整理"
		],
		license: "Gemma Terms",
		minVramMiB: 1500,
		quantization: "Q4_K_M",
		ollamaPullCommand: "ollama pull gemma3:1b",
		estimatedTokensPerSecond: "35–60 token/s",
		nativeDownload: {
			repository: "ggml-org/gemma-3-1b-it-GGUF",
			fileName: "gemma-3-1b-it-Q4_K_M.gguf",
			expectedSizeMiB: 806
		}
	}), createModel({
		id: "gemma3:270m",
		displayName: "Gemma 3 270M（超轻任务）",
		origin: "international",
		format: "gguf",
		parameters: "270M",
		isMoe: false,
		estimatedVramMiB: 600,
		estimatedRamMiB: 1200,
		needsCpuOffload: false,
		tier: "fast",
		reason: "约 241MB Q4 权重，只适合分类、路由、规则抽取等窄任务，不替代主模型",
		useCases: [
			"意图分类",
			"任务路由",
			"标签生成",
			"规则抽取"
		],
		license: "Gemma Terms",
		minVramMiB: 0,
		quantization: "Q4_K_M",
		ollamaPullCommand: "ollama pull gemma3:270m",
		estimatedTokensPerSecond: "70+ token/s",
		nativeDownload: {
			repository: "unsloth/gemma-3-270m-it-GGUF",
			fileName: "gemma-3-270m-it-Q4_K_M.gguf",
			expectedSizeMiB: 241
		}
	}), createModel({
		id: "qwen3:4b",
		displayName: "Qwen3 4B（质量优先）",
		origin: "domestic",
		format: "ollama",
		parameters: "4B",
		isMoe: false,
		estimatedVramMiB: 3400,
		estimatedRamMiB: 5e3,
		needsCpuOffload: false,
		tier: "good",
		reason: "比 1.7B 质量更高，但速度较慢；需要更强推理质量时再部署",
		useCases: [
			"行业知识整理",
			"训练数据合成",
			"Agent 编排"
		],
		license: "Apache-2.0",
		minVramMiB: 4e3,
		quantization: "Q4_K_M",
		ollamaPullCommand: "ollama pull qwen3:4b",
		estimatedTokensPerSecond: "12–22 token/s"
	}));
	if (vramMiB >= 12e3 && vramMiB < 16e3) models.push(createModel({
		id: "qwen3-coder:30b-a3b",
		displayName: "Qwen3-Coder 30B-A3B (MoE)",
		origin: "domestic",
		format: "ollama",
		parameters: "30B (3B active)",
		isMoe: true,
		estimatedVramMiB: 1e4,
		estimatedRamMiB: 8e3,
		needsCpuOffload: false,
		tier: "best",
		reason: "12GB 档最佳编码模型",
		minVramMiB: 12e3,
		quantization: "Q4_K_M",
		ollamaPullCommand: "ollama pull qwen3-coder:30b-a3b"
	}));
	if (vramMiB >= 16e3 && vramMiB < 24e3) models.push(createModel({
		id: "qwen3.5:35b-a3b",
		displayName: "Qwen3.5 35B-A3B (MoE)",
		origin: "domestic",
		format: "ollama",
		parameters: "35B (3B active)",
		isMoe: true,
		estimatedVramMiB: 14e3,
		estimatedRamMiB: 1e4,
		needsCpuOffload: false,
		tier: "best",
		reason: "16GB 档最佳选择",
		minVramMiB: 16e3,
		quantization: "Q4_K_XL",
		ollamaPullCommand: "ollama pull qwen3.5:35b-a3b"
	}));
	if (vramMiB >= 24e3) models.push(createModel({
		id: "qwen3.6:27b",
		displayName: "Qwen3.6 27B",
		origin: "domestic",
		format: "ollama",
		parameters: "27B",
		isMoe: false,
		estimatedVramMiB: 18e3,
		estimatedRamMiB: 16e3,
		needsCpuOffload: false,
		tier: "best",
		reason: "24GB 档最佳本地编码模型",
		minVramMiB: 24e3,
		quantization: "Q4_K_XL",
		ollamaPullCommand: "ollama pull qwen3.6:27b"
	}));
	if (vramMiB < 8e3) models.push(createModel({
		id: "qwen3:4b",
		displayName: "Qwen3 4B (CPU)",
		origin: "domestic",
		format: "ollama",
		parameters: "4B",
		isMoe: false,
		estimatedVramMiB: 0,
		estimatedRamMiB: 3e3,
		needsCpuOffload: false,
		tier: "fast",
		reason: "低配置推荐，CPU 推理",
		useCases: [
			"行业知识整理",
			"轻量 Agent",
			"训练样本生成"
		],
		license: "Apache-2.0",
		minVramMiB: 0,
		quantization: "Q4_K_M",
		ollamaPullCommand: "ollama pull qwen3:4b"
	}), createModel({
		id: "gemma3:4b",
		displayName: "Gemma 3 4B (CPU)",
		origin: "international",
		format: "ollama",
		parameters: "4B",
		isMoe: false,
		estimatedVramMiB: 0,
		estimatedRamMiB: 3e3,
		needsCpuOffload: false,
		tier: "fast",
		reason: "Google 出品，轻量多语言",
		useCases: [
			"摘要",
			"分类",
			"多语言资料整理"
		],
		license: "Gemma Terms",
		minVramMiB: 0,
		quantization: "Q4_K_M",
		ollamaPullCommand: "ollama pull gemma3:4b"
	}), createModel({
		id: "qwen3:1.7b",
		displayName: "Qwen3 1.7B（极速生产）",
		origin: "domestic",
		format: "ollama",
		parameters: "1.7B",
		isMoe: false,
		estimatedVramMiB: 1400,
		estimatedRamMiB: 2600,
		needsCpuOffload: false,
		tier: "fast",
		reason: "低资源中文首选，适合常驻执行知识预处理和工作流辅助任务",
		useCases: [
			"知识预处理",
			"会话摘要",
			"任务路由",
			"规则提取"
		],
		license: "Apache-2.0",
		minVramMiB: 0,
		quantization: "Q6_K",
		ollamaPullCommand: "ollama pull qwen3:1.7b"
	}));
	if (vramMiB >= 6e3) models.splice(Math.min(2, models.length), 0, createModel({
		id: "qwen2.5vl:3b",
		displayName: "Qwen2.5-VL 3B（端侧视觉理解）",
		origin: "domestic",
		format: "ollama",
		parameters: "3.75B",
		isMoe: false,
		estimatedVramMiB: 5200,
		estimatedRamMiB: 6500,
		needsCpuOffload: false,
		tier: "good",
		reason: "约 3.2GB Q4_K_M，适合 6–8GB GPU；OmniInfer-LLM 已验证 Qwen2.5-VL 系列。通过 Ollama 0.7+ 部署可避免主模型与视觉组件错配。",
		useCases: [
			"扫描件理解",
			"图表解析",
			"界面截图分析",
			"视觉 Agent 验证"
		],
		license: "Apache-2.0",
		minVramMiB: 6e3,
		quantization: "Q4_K_M",
		ollamaPullCommand: "ollama pull qwen2.5vl:3b",
		estimatedTokensPerSecond: "10–20 token/s（文本；图片取决于分辨率）"
	}));
	return models;
}
/** 创建模型条目（自动生成下载链接）。 */
function createModel(params) {
	const links = [];
	if (params.format === "ollama") {
		for (const node of DOMESTIC_NODES) links.push({
			node,
			downloadUrl: `${node.url}/ollama/library/${params.id.split(":")[0]}`,
			fileName: `${params.id.replace(":", "-")}.gguf`
		});
		for (const node of INTERNATIONAL_NODES) links.push({
			node,
			downloadUrl: `${node.url}/library/${params.id.split(":")[0]}`,
			fileName: `${params.id.replace(":", "-")}.gguf`
		});
	}
	return {
		...params,
		downloadLinks: links
	};
}
/** 常见的本地模型目录。 */
const COMMON_MODEL_DIRS = [
	"E:\\models",
	"C:\\models",
	process.env.XYAI_MODEL_DIR ?? join(process.env.USERPROFILE ?? "", ".dsh", "xyai", "models"),
	join(process.env.USERPROFILE ?? "", "models"),
	join(process.env.USERPROFILE ?? "", ".ollama", "models"),
	join(process.env.LOCALAPPDATA ?? "", "lm-studio", "models")
];
/** 扫描本地常见目录，检测已下载的 GGUF 文件。 */
function scanLocalGgufModels(customDirs) {
	const dirs = [...COMMON_MODEL_DIRS, ...customDirs ?? []];
	const models = [];
	const seen = /* @__PURE__ */ new Set();
	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			scanDirectory(dir, models, seen, 0);
		} catch {}
	}
	return models;
}
/** 递归扫描目录（最大深度 3）。 */
function scanDirectory(dir, models, seen, depth) {
	if (depth > 3) return;
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) scanDirectory(fullPath, models, seen, depth + 1);
			else if (isCallableGguf(entry.name) && !seen.has(fullPath)) {
				seen.add(fullPath);
				try {
					const stat = statSync(fullPath);
					const projector = findMultimodalProjector(dirname(fullPath));
					models.push({
						filePath: fullPath,
						fileName: entry.name,
						fileSize: stat.size,
						inferredName: inferModelName(entry.name),
						inferredQuantization: inferQuantization(entry.name),
						...projector === void 0 ? {} : {
							projectorPath: projector.filePath,
							projectorSize: projector.fileSize
						}
					});
				} catch {}
			}
		}
	} catch {}
}
/** Locate a vision projector beside its main GGUF, preferring the highest-fidelity sidecar. */
function findMultimodalProjector(dir) {
	try {
		return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && /^mmproj(?:[-_.].*)?\.gguf$/i.test(entry.name)).map((entry) => {
			const filePath = join(dir, entry.name);
			return {
				filePath,
				fileSize: statSync(filePath).size,
				name: entry.name.toLowerCase()
			};
		}).sort((left, right) => {
			const leftF16 = /(?:^|[-_.])f16(?:[-_.]|\.gguf$)/i.test(left.name) ? 1 : 0;
			return (/(?:^|[-_.])f16(?:[-_.]|\.gguf$)/i.test(right.name) ? 1 : 0) - leftF16 || right.fileSize - left.fileSize || left.name.localeCompare(right.name);
		})[0];
	} catch {
		return;
	}
}
/** Projection/adapter GGUF files (commonly `mmproj-*`) cannot answer chat requests alone. */
function isCallableGguf(fileName) {
	const normalized = fileName.toLowerCase();
	return normalized.endsWith(".gguf") && !normalized.startsWith("mmproj-") && !normalized.includes(".mmproj.");
}
/** 从文件名推断模型名称。 */
function inferModelName(fileName) {
	let name = fileName.replace(/\.gguf$/i, "");
	name = name.replace(/[-_]?(Q\d+_\w+|f16|fp16|bf16|int8|int4)$/i, "");
	name = name.replace(/^qwen3[-_]5(?=[-_]|$)/i, "Qwen3.5");
	name = name.replace(/^mmproj[-_]?/i, "");
	name = name.replace(/[-_]+/g, " ").trim();
	return name || fileName;
}
/** 从文件名推断量化格式。 */
function inferQuantization(fileName) {
	return fileName.match(/(Q\d+_\w+|f16|fp16|bf16|int8|int4)/i)?.[1]?.toUpperCase();
}
//#endregion
//#region src/runtime-diagnostics.ts
/** 本机运行时结构化诊断记录；不包含凭据和提示词正文。 */
function defaultRuntimeDiagnosticsPath() {
	return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "xyai", "diagnostics", "runtime.jsonl");
}
const SECRET_KEY = /(api[_-]?key|authorization|credential|password|secret|token)/i;
const SECRET_VALUE = /(Bearer\s+[^\s]+|\bsk-[A-Za-z0-9_-]{12,}|\b(?:api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;]+)/gi;
/** Remove credential-shaped values before they reach disk or the clipboard report. */
function sanitizeRuntimeDiagnosticDetail(detail) {
	return Object.fromEntries(Object.entries(detail).map(([key, value]) => {
		if (SECRET_KEY.test(key) && typeof value === "string") return [key, "[REDACTED]"];
		return [key, typeof value === "string" ? value.replace(SECRET_VALUE, "[REDACTED]") : value];
	}));
}
/** Build a compact, credential-redacted support report without prompts or conversation content. */
function formatRuntimeDiagnosticReport(records, safeMode) {
	const lines = [
		"XYAI Studio 运行诊断（脱敏）",
		`生成时间：${(/* @__PURE__ */ new Date()).toISOString()}`,
		`安全模式：${safeMode ? "已启用（本地模型强制 CPU）" : "未启用"}`,
		`记录数量：${String(records.length)}`,
		""
	];
	for (const record of records) {
		lines.push(`[${record.time}] ${record.component}/${record.operation} ${record.status}`);
		lines.push(JSON.stringify(sanitizeRuntimeDiagnosticDetail(record.detail)));
	}
	return lines.join("\n");
}
var RuntimeDiagnostics = class {
	file;
	maxBytes;
	chain = Promise.resolve();
	constructor(file = defaultRuntimeDiagnosticsPath(), maxBytes = 5 * 1024 * 1024) {
		this.file = file;
		this.maxBytes = maxBytes;
	}
	record(input) {
		this.chain = this.chain.then(async () => {
			await mkdir(dirname(this.file), { recursive: true });
			if (await stat(this.file).then((value) => value.size).catch(() => 0) >= this.maxBytes) await rename(this.file, `${this.file}.${Date.now()}.old`).catch(() => void 0);
			const record = {
				schema: "xyai.runtime-diagnostic.v1",
				time: (/* @__PURE__ */ new Date()).toISOString(),
				...input,
				detail: sanitizeRuntimeDiagnosticDetail(input.detail)
			};
			await appendFile(this.file, `${JSON.stringify(record)}\n`, "utf8");
		});
		return this.chain;
	}
	async recent(limit = 100) {
		await this.chain;
		try {
			return (await readFile(this.file, "utf8")).split(/\r?\n/).filter(Boolean).slice(-Math.max(1, limit)).flatMap((line) => {
				try {
					const value = JSON.parse(line);
					return value.schema === "xyai.runtime-diagnostic.v1" ? [{
						...value,
						detail: sanitizeRuntimeDiagnosticDetail(value.detail)
					}] : [];
				} catch {
					return [];
				}
			});
		} catch {
			return [];
		}
	}
};
//#endregion
//#region src/local-context-handoff.ts
/**
* Produce the portable subset accepted by strict Gemma-style Jinja templates:
* no standalone system role and exact user/assistant alternation.
*/
function normalizeLocalChatMessages(messages) {
	const system = messages.filter((message) => message.role === "system" && message.content.trim() !== "").map((message) => message.content).join("\n\n");
	const body = messages.filter((message) => message.role !== "system" && message.content.trim() !== "");
	const normalized = [];
	for (const message of body) {
		const role = message.role === "assistant" ? "assistant" : "user";
		let content = message.content;
		if (normalized.length === 0) {
			if (role === "assistant") normalized.push({
				role: "user",
				content: system === "" ? "请继续当前任务。" : `【系统指令】\n${system}`
			});
			else if (system !== "") content = `【系统指令】\n${system}\n\n【用户消息】\n${content}`;
		}
		const previous = normalized.at(-1);
		if (previous?.role === role) normalized[normalized.length - 1] = {
			role,
			content: `${previous.content}\n\n${role === "user" ? "【补充输入】" : "【续】"}\n${content}`
		};
		else normalized.push({
			role,
			content
		});
	}
	if (normalized.length === 0) normalized.push({
		role: "user",
		content: system === "" ? "请继续当前任务。" : `【系统指令】\n${system}\n\n请继续当前任务。`
	});
	if (normalized.at(-1)?.role === "assistant") normalized.push({
		role: "user",
		content: "请基于以上进度继续完成当前任务。"
	});
	return normalized.length === messages.length && normalized.every((message, index) => message.role === messages[index]?.role && message.content === messages[index]?.content) ? messages : normalized;
}
/** Keep DSH skill discovery intact without feeding a micro model every long skill description. */
function compactLocalSkillCatalog(content) {
	if (!content.includes("<available_skills>")) return content;
	const names = [...content.matchAll(/^-\s+`([^`]+)`:/gmu)].map((match) => match[1]).filter((name) => name !== void 0);
	if (names.length === 0) return content;
	return `<system-reminder>DSH skill catalog (compact): ${names.join(", ")}. Use the skill tool only when the user explicitly names a skill or the task clearly requires one; load its instructions before acting.</system-reminder>`;
}
function adaptLocalGgufMessages(messages, profile) {
	if (!profile.compactSkillCatalog) return messages;
	return messages.map((message) => message.content.includes("<available_skills>") ? {
		...message,
		content: compactLocalSkillCatalog(message.content)
	} : message);
}
/** Stop a handed-off local model from repeating the same inspect tool forever. */
function shouldBreakLocalToolLoop(messages) {
	const recent = messages.slice(-16);
	const calls = [];
	for (const message of recent) {
		const pattern = /\[tool\s+([^\s(]+)\s*\(/giu;
		let match = pattern.exec(message.content);
		while (match !== null) {
			if (match[1] !== void 0) calls.push(match[1].toLocaleLowerCase());
			match = pattern.exec(message.content);
		}
	}
	if (calls.length < 3) return false;
	const counts = /* @__PURE__ */ new Map();
	for (const call of calls) counts.set(call, (counts.get(call) ?? 0) + 1);
	const repeated = [...counts.values()].some((count) => count >= 2);
	const latestUser = [...recent].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
	return repeated && /^(?:继续|接着|继续处理|continue|proceed)[。.!！]?$/iu.test(latestUser);
}
/** Whether the newest user turn asks to resume a response that just stopped. */
function isLocalContinuationRequest(text) {
	const value = text.trim();
	return /^(?:继续|接着|继续输出|继续回答|继续处理|continue|proceed)[。.!！]?$/iu.test(value) || /从上次被截断的位置继续/iu.test(value);
}
/** Clip the end of a previous answer without exceeding the continuation budget. */
function tailClip(text, tokenBudget) {
	if (estimateLocalTokens(text) <= tokenBudget) return text;
	let low = 0;
	let high = text.length;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (estimateLocalTokens(text.slice(-middle)) <= tokenBudget) low = middle;
		else high = middle - 1;
	}
	return `…（上一段前文省略）…\n${text.slice(-low)}`;
}
/**
* Turn a bare “continue” into a self-contained continuation capsule. This
* deliberately duplicates the exact assistant tail inside the newest user
* message so context compaction cannot retain only the word “继续” and lose
* the unfinished heading, list number or sentence boundary.
*/
function anchorLocalContinuation(messages, tailTokenBudget = 1600) {
	const latestUserIndex = messages.findLastIndex((message) => message.role !== "assistant" && message.content.trim() !== "");
	if (latestUserIndex < 0 || !isLocalContinuationRequest(messages[latestUserIndex].content)) return messages;
	let assistantIndex = latestUserIndex - 1;
	while (assistantIndex >= 0 && messages[assistantIndex]?.role !== "assistant") assistantIndex -= 1;
	const assistant = messages[assistantIndex];
	if (assistant === void 0 || assistant.content.trim() === "") return messages;
	const anchor = tailClip(assistant.content, tailTokenBudget);
	const replacement = {
		role: messages[latestUserIndex].role,
		content: `【XYAI 续写锚点】\n上一段回答的末尾如下（原样保留）：\n\n${anchor}\n\n【续写要求】\n紧接上述末尾继续；保持原有主题、编号、格式和语言；如末尾是未完成的标题或句子，先直接完成它。不得从头概括、重排章节或重复已输出内容。`
	};
	return messages.map((message, index) => index === latestUserIndex ? replacement : message);
}
/** Conservative tokenizer-independent estimate suitable for pre-flight budgeting. */
function estimateLocalTokens(text) {
	return Math.max(1, Math.ceil(Buffer.byteLength(text, "utf8") / 3));
}
function estimateLocalRequestTokens(messages, tools = []) {
	return 32 + messages.reduce((total, message) => total + 8 + estimateLocalTokens(message.content), 0) + (tools.length === 0 ? 0 : 16 + estimateLocalTokens(JSON.stringify(tools)));
}
function toolMetadata(tool) {
	if (tool === null || typeof tool !== "object") return {
		name: "",
		description: ""
	};
	const outer = tool;
	const value = outer.function !== null && typeof outer.function === "object" ? outer.function : outer;
	return {
		name: typeof value.name === "string" ? value.name : "",
		description: typeof value.description === "string" ? value.description : ""
	};
}
/**
* A cloud agent may expose hundreds of MCP schemas (hundreds of thousands of
* tokens). A small local model needs only the tools relevant to the current
* turn. Keep whole schemas so selected tools remain callable and deterministic.
*/
function selectLocalTools(tools, currentInput, tokenBudget, maximumTools = 24) {
	if (tools.length === 0 || tokenBudget <= 16) return {
		tools: [],
		omittedTools: tools.length,
		estimatedTokens: 0
	};
	const query = currentInput.toLocaleLowerCase();
	const actionIntent = /(?:检查|查看|读取|写入|修改|修复|搜索|查找|列出|运行|执行|调用|创建|删除|安装|下载|工作区|代码库|仓库|文件|代码|终端|命令|inspect|read|write|edit|fix|search|find|list|run|execute|workspace|repository|repo|file|code|terminal|command)/iu.test(query);
	if (/(?:什么|哪些|介绍|说说|解释|为何|为什么|怎么样|有何|能力|概念|区别|what|which|explain|describe|capabilit|difference)/iu.test(query) && !actionIntent) return {
		tools: [],
		omittedTools: tools.length,
		estimatedTokens: 0
	};
	const terms = [...new Set(query.match(/[\p{L}\p{N}_-]{2,}/gu) ?? [])];
	const essential = /(?:read|write|edit|patch|file|search|find|list|shell|bash|exec|command|terminal|todo|读|写|编辑|文件|搜索|查找|命令|终端)/iu;
	const localSearchIntent = /(?:本地|本机|电脑|工作区|项目|代码库|仓库|目录|文件|代码|local|computer|workspace|project|repository|repo|directory|file|code)/iu.test(query);
	const webSearchIntent = /(?:联网|网上|全网|互联网|网页|网站|新闻|最新|官网|web|online|internet|website|news|latest)/iu.test(query);
	const localTool = /(?:fs|file|grep|glob|read|write|edit|patch|shell|pwsh|bash|文件|目录|终端)/iu;
	const webTool = /(?:web|online|internet|browser|url|网页|联网)/iu;
	const ranked = tools.map((tool, index) => {
		const meta = toolMetadata(tool);
		const haystack = `${meta.name} ${meta.description}`.toLocaleLowerCase();
		let score = terms.reduce((total, term) => total + (haystack.includes(term) ? Math.min(20, term.length + 3) : 0), 0) + (actionIntent && essential.test(meta.name) ? 18 : 0);
		if (localSearchIntent) {
			if (localTool.test(haystack)) score += 40;
			if (webTool.test(haystack)) score -= 100;
		} else if (webSearchIntent && webTool.test(haystack)) score += 40;
		const cost = 16 + estimateLocalTokens(JSON.stringify(tool));
		return {
			tool,
			index,
			score,
			cost
		};
	}).sort((left, right) => right.score - left.score || left.cost - right.cost || left.index - right.index);
	const selected = [];
	let used = 0;
	for (const candidate of ranked) {
		if (candidate.score <= 0) continue;
		if (selected.length >= maximumTools || candidate.cost > tokenBudget - used) continue;
		selected.push(candidate);
		used += candidate.cost;
	}
	selected.sort((left, right) => left.index - right.index);
	return {
		tools: selected.map((item) => item.tool),
		omittedTools: tools.length - selected.length,
		estimatedTokens: used
	};
}
function clip(text, tokenBudget) {
	if (estimateLocalTokens(text) <= tokenBudget) return text;
	const sliceWithin = (source, budget, fromEnd = false) => {
		let low = 0;
		let high = source.length;
		while (low < high) {
			const middle = Math.ceil((low + high) / 2);
			if (estimateLocalTokens(fromEnd ? source.slice(-middle) : source.slice(0, middle)) <= budget) low = middle;
			else high = middle - 1;
		}
		return fromEnd ? source.slice(-low) : source.slice(0, low);
	};
	const marker = "\n…（交接时已压缩）…\n";
	const contentBudget = Math.max(32, tokenBudget - estimateLocalTokens(marker));
	return `${sliceWithin(text, Math.floor(contentBudget * .76))}${marker}${sliceWithin(text, Math.floor(contentBudget * .2), true)}`;
}
function handoffSummary(messages, tokenBudget) {
	const firstGoal = messages.find((message) => message.role === "user")?.content ?? "";
	/*
	* Small local models must receive an actual task handoff, not a lossy copy
	* of the transcript.  Keep only human constraints plus factual execution
	* state, remove tool dumps/code blocks, and cap each evidence item.  The
	* newest turns are preserved separately by prepareLocalContextHandoff.
	*/
	const evidence = messages.flatMap((message) => message.content.split(/\r?\n/u).map((line) => ({
		role: message.role,
		line: line.trim()
	}))).filter(({ role, line }) => line.length > 0 && line.length < 1800 && !/^\s*(?:```|\[tool\b|\{|\[)/iu.test(line) && (role === "user" ? /(?:必须|需要|要求|不要|优先|限制|目标|交接|待办|下一步|文件|路径|模型|上下文)/iu.test(line) : /(?:决定|已(?:经)?|完成|失败|错误|阻塞|待办|下一步|文件|路径|模型|上下文|install|error|failed|todo)/iu.test(line))).slice(-10).map(({ role, line }) => `- [${role === "user" ? "约束" : "状态"}] ${clip(line, 64)}`).join("\n");
	return clip(`【XYAI 自动模型交接包】
任务目标：${clip(firstGoal, 180)}

必要约束、状态与待办：
${evidence || "- 旧对话已压缩；仅依据最近消息继续当前任务。"}

交接规则：承接既有进度，不要从头重做；先使用最近消息，缺信息时仅检查当前工作区。不要复述历史、工具输出或无关资料。`, tokenBudget);
}
/**
* Fit conversation state into the target model while preserving system rules,
* the newest turns and a deterministic handoff summary of omitted history.
*/
function prepareLocalContextHandoff(messages, contextWindow, maxOutputTokens, tools = [], targetRatio = 1, maximumTools = 24) {
	const portableMessages = normalizeLocalChatMessages(messages);
	/* Keep a larger reserve than a cloud model: llama.cpp chat templates,
	 * tokenizer variation and tool framing otherwise produce late 400 errors. */
	const safetyTokens = Math.max(512, Math.floor(contextWindow * .1));
	const inputBudgetTokens = Math.max(512, Math.floor((contextWindow - maxOutputTokens - safetyTokens) * targetRatio));
	const selected = selectLocalTools(tools, [...portableMessages].reverse().find((message) => message.role === "user")?.content ?? "", Math.min(4e3, Math.max(256, Math.floor(inputBudgetTokens * .18))), maximumTools);
	const activeTools = selected.tools;
	const originalTokens = estimateLocalRequestTokens(portableMessages, activeTools);
	if (originalTokens <= inputBudgetTokens) return {
		messages: portableMessages,
		tools: activeTools,
		estimatedInputTokens: originalTokens,
		inputBudgetTokens,
		compacted: portableMessages !== messages || selected.omittedTools > 0,
		omittedMessages: 0,
		omittedTools: selected.omittedTools
	};
	const systems = portableMessages.filter((message) => message.role === "system");
	const conversation = portableMessages.filter((message) => message.role !== "system");
	const toolTokens = activeTools.length === 0 ? 0 : 16 + estimateLocalTokens(JSON.stringify(activeTools));
	const clippedSystems = systems.map((message) => ({
		...message,
		content: clip(message.content, Math.max(256, Math.floor((inputBudgetTokens - toolTokens) * .35 / Math.max(1, systems.length))))
	}));
	const fixedTokens = estimateLocalRequestTokens(clippedSystems, activeTools);
	const summaryBudget = Math.max(224, Math.min(720, Math.floor(inputBudgetTokens * .17)));
	let recentBudget = Math.max(256, inputBudgetTokens - fixedTokens - summaryBudget - 24);
	const recent = [];
	for (let index = conversation.length - 1; index >= 0; index--) {
		const message = conversation[index];
		const cost = 8 + estimateLocalTokens(message.content);
		if (recent.length > 0 && cost > recentBudget) break;
		recent.unshift(cost <= recentBudget ? message : {
			...message,
			content: clip(message.content, recentBudget - 8)
		});
		recentBudget -= Math.min(cost, recentBudget);
	}
	const omittedCount = Math.max(0, conversation.length - recent.length);
	const omitted = conversation.slice(0, omittedCount);
	const summary = omittedCount === 0 ? [] : [{
		role: "user",
		content: handoffSummary(omitted, summaryBudget)
	}];
	let fitted = [
		...clippedSystems,
		...summary,
		...recent
	];
	while (estimateLocalRequestTokens(normalizeLocalChatMessages(fitted), activeTools) > inputBudgetTokens && recent.length > 1) {
		recent.shift();
		fitted = [
			...clippedSystems,
			{
				role: "user",
				content: handoffSummary(conversation.slice(0, conversation.length - recent.length), Math.floor(summaryBudget * .7))
			},
			...recent
		];
	}
	fitted = [...normalizeLocalChatMessages(fitted)];
	if (estimateLocalRequestTokens(fitted, activeTools) > inputBudgetTokens) {
		const available = Math.max(128, inputBudgetTokens - estimateLocalRequestTokens([], activeTools) - 24);
		const newest = recent.at(-1) ?? conversation.at(-1);
		fitted = normalizeLocalChatMessages(newest === void 0 ? [{
			role: "user",
			content: "请继续当前任务。"
		}] : [{
			role: "user",
			content: `${handoffSummary(omitted, Math.min(summaryBudget, Math.floor(available * .38)))}\n\n【最近输入】\n${clip(newest.content, Math.floor(available * .58))}`
		}]);
	}
	return {
		messages: fitted,
		tools: activeTools,
		estimatedInputTokens: estimateLocalRequestTokens(fitted, activeTools),
		inputBudgetTokens,
		compacted: true,
		omittedMessages: omittedCount,
		omittedTools: selected.omittedTools
	};
}
//#endregion
//#region src/local-model-performance.ts
/** Durable local benchmark history used to tune later llama.cpp launches. */
function defaultLocalModelPerformancePath() {
	return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "xyai", "local-model-performance.json");
}
var LocalModelPerformanceStore = class {
	file;
	constructor(file = defaultLocalModelPerformancePath()) {
		this.file = file;
	}
	async get(filePath) {
		return (await this.list()).find((entry) => entry.filePath.toLowerCase() === filePath.toLowerCase());
	}
	async list() {
		try {
			const value = JSON.parse(await readFile(this.file, "utf8"));
			return value.schema === "xyai.local-performance.v1" && Array.isArray(value.entries) ? value.entries : [];
		} catch {
			return [];
		}
	}
	async record(entry) {
		const entries = [...(await this.list()).filter((item) => item.filePath.toLowerCase() !== entry.filePath.toLowerCase()), entry].slice(-100);
		await mkdir(dirname(this.file), { recursive: true });
		const temporary = `${this.file}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporary, `${JSON.stringify({
				schema: "xyai.local-performance.v1",
				entries
			}, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
			await rename(temporary, this.file);
		} catch (cause) {
			await unlink(temporary).catch(() => void 0);
			throw cause;
		}
	}
};
//#endregion
//#region src/local-gguf.ts
const name = "xyai-local-gguf";
const inject = ["llm"];
const XYAI_LOCAL_PROVIDER = "xyai-native";
const catalogListeners = /* @__PURE__ */ new Set();
/** Announce that a completed download changed the dynamic GGUF catalog. */
function notifyLocalGgufCatalogChanged() {
	for (const listener of catalogListeners) listener();
}
/** Small edge models should answer directly instead of exhausting their turn on hidden reasoning. */
function shouldDisableLocalThinking(model) {
	return model.fileSize <= 4 * 1024 ** 3;
}
/**
* Keep one local-model policy for every customer machine. Model bytes are a
* portable capability signal, unlike a display name that can be renamed by a
* user. Micro models remain useful for routing/extraction, while 1-4 GB
* models get a compact DSH turn and larger models retain the full agent turn.
*/
function localGgufProfile(model) {
	const modelMiB = (model.fileSize + (model.projectorSize ?? 0)) / 1024 ** 2;
	if (modelMiB <= 768) return {
		kind: "micro",
		maxOutputTokens: 192,
		maximumTools: 0,
		compactSkillCatalog: true
	};
	if (modelMiB <= 2048) return {
		kind: "small",
		maxOutputTokens: 512,
		maximumTools: 1,
		compactSkillCatalog: true
	};
	if (modelMiB <= 4096) return {
		kind: "agent-small",
		maxOutputTokens: 960,
		maximumTools: 4,
		compactSkillCatalog: true
	};
	return {
		kind: "standard",
		maxOutputTokens: 2048,
		maximumTools: 8,
		compactSkillCatalog: false
	};
}
/** 在启动独立 llama.cpp 进程前完成保守资源预算与参数分档。 */
function planLocalGgufLaunch(model, hardware, performance) {
	const fileMiB = (model.fileSize + (model.projectorSize ?? 0)) / 1024 ** 2;
	/* llama.cpp defaults to automatic reasoning when a model template advertises
	 * it.  For an edge model this can consume a whole short turn before any
	 * visible answer is emitted.  Keep DSH's normal prompt/tool pipeline, but
	 * make the local server itself return an answer directly. */
	const responseArgs = shouldDisableLocalThinking(model) ? [
		"--reasoning",
		"off",
		"--reasoning-budget",
		"0"
	] : [];
	const estimatedRequiredMiB = Math.ceil(fileMiB * 1.15 + 2048);
	const ramBudget = hardware.memoryGiB * 1024 * .75;
	const gpuBudget = (hardware.gpu?.vramFreeMiB ?? 0) * .85;
	const availableBudgetMiB = Math.floor(ramBudget + gpuBudget);
	if (estimatedRequiredMiB > availableBudgetMiB) throw new Error(`本地模型预计需要约 ${Math.ceil(estimatedRequiredMiB / 1024)} GB 内存/显存预算，当前安全可用预算约 ${Math.floor(availableBudgetMiB / 1024)} GB。请选择更小量化或关闭其他占用 GPU 的程序。`);
	const hasGpu = hardware.gpu !== void 0 && hardware.gpu.vramFreeMiB >= 1024;
	const mode = hasGpu && hardware.gpu.vramFreeMiB >= estimatedRequiredMiB ? "gpu" : hasGpu ? "hybrid" : "cpu";
	const tight = estimatedRequiredMiB > availableBudgetMiB * .8;
	const vramMiB = hardware.gpu?.vramMiB ?? 0;
	let contextSize = tight || vramMiB <= 9e3 ? 8192 : fileMiB <= 3072 ? 32768 : fileMiB <= 6144 ? 16384 : vramMiB >= 12e3 ? 16384 : 8192;
	if (performance !== void 0 && performance.mode === mode && performance.tokensPerSecond < 6) contextSize = Math.min(contextSize, 8192);
	const cpuThreads = Math.max(4, Math.floor(hardware.cpuCores / 2));
	return {
		mode,
		contextSize,
		estimatedRequiredMiB,
		availableBudgetMiB,
		responseArgs,
		args: mode === "cpu" ? [
			"--ctx-size",
			String(contextSize),
			"--parallel",
			"1",
			"--n-gpu-layers",
			"0",
			"--threads",
			String(cpuThreads),
			"--threads-batch",
			String(cpuThreads),
			"--batch-size",
			"512",
			"--ubatch-size",
			"128",
			"--cache-prompt",
			...responseArgs
		] : [
			"--ctx-size",
			String(contextSize),
			"--parallel",
			"1",
			"--n-gpu-layers",
			"auto",
			"--flash-attn",
			"on",
			"--cache-type-k",
			"q8_0",
			"--cache-type-v",
			"q8_0",
			"--batch-size",
			tight ? "512" : "1024",
			"--ubatch-size",
			tight ? "128" : "256",
			"--fit",
			"on",
			"--fit-target",
			"512",
			"--cache-prompt",
			...responseArgs
		]
	};
}
function planWithMode(primary, mode) {
	const contextSize = primary.contextSize;
	const args = mode === "cpu" ? [
		"--ctx-size",
		String(contextSize),
		"--parallel",
		"1",
		"--n-gpu-layers",
		"0",
		"--batch-size",
		"128",
		"--ubatch-size",
		"64",
		...primary.responseArgs
	] : mode === "hybrid" ? [
		"--ctx-size",
		String(contextSize),
		"--parallel",
		"1",
		"--n-gpu-layers",
		"20",
		"--flash-attn",
		"on",
		"--cache-type-k",
		"q8_0",
		"--cache-type-v",
		"q8_0",
		"--batch-size",
		"256",
		"--ubatch-size",
		"64",
		...primary.responseArgs
	] : primary.args;
	return {
		...primary,
		mode,
		contextSize,
		args
	};
}
/** 按风险从低延迟到高兼容排列；安全模式只允许 CPU 保底。 */
function localGgufFallbackPlans(primary, safeMode = false) {
	if (safeMode) return [planWithMode(primary, "cpu")];
	if (primary.mode === "gpu") return [
		primary,
		planWithMode(primary, "hybrid"),
		planWithMode(primary, "cpu")
	];
	if (primary.mode === "hybrid") return [primary, planWithMode(primary, "cpu")];
	return [primary];
}
function localGgufModelId(path) {
	return `gguf-${createHash("sha256").update(path.toLowerCase()).digest("hex").slice(0, 16)}`;
}
const XYAI_LOCAL_AUTO_MODEL = "xyai-auto";
/** Execution-side requirements for the Auto provider. DSH owns the session,
 * tool lifecycle and any agent orchestration; this adapter only selects a
 * registered local GGUF after DSH has handed it the normal request. */
function automaticLocalTask(messages) {
	const latest = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
	const coding = /\b(code|coding|typescript|javascript|python|java|rust|sql|bug|debug|api|mcp)\b|代码|编程|调试|报错|接口|插件|脚本/i.test(latest);
	const modelBenchmark = /(?:逐个|依次|分别)?\s*(?:测试|基准|性能测试).{0,36}(?:本地)?模型|(?:本地)?模型.{0,36}(?:测试|基准|性能测试)/i.test(latest);
	const webSearch = /(?:查查|查询|搜索|检索|找一下|查一下).{0,56}(?:公司|企业|科技|新闻|资料|信息|政策|网站|网页|官网)|(?:公司|企业|科技|新闻|资料|信息|政策).{0,24}(?:查询|搜索|检索|查查)/i.test(latest);
	const workspaceAction = /(?:读取|打开|运行|执行|安装|部署|修改|创建|删除|写入|编辑).{0,72}(?:文件|文件夹|目录|工作区|项目|知识库|网页|网站|链接)/i.test(latest);
	const knowledgeBaseAction = /(?:知识库|文档库).{0,48}(?:查询|检索|搜索|查找|读取|分析)|(?:查询|检索|搜索|查找|读取|分析).{0,48}(?:知识库|文档库)/i.test(latest);
	const intent = modelBenchmark ? "model-benchmark" : webSearch ? "web-research" : knowledgeBaseAction ? "knowledge-retrieval" : workspaceAction ? "workspace-operation" : coding ? "coding" : "conversation";
	const requiresTools = intent === "web-research" || intent === "knowledge-retrieval" || intent === "workspace-operation";
	return {
		latest,
		intent,
		coding,
		modelBenchmark,
		webSearch,
		workspaceAction,
		knowledgeBaseAction,
		requiresTools,
		quick: intent === "conversation" && latest.length <= 240
	};
}
/** Stable capability labels inferred from model family and size.  These are
 * deliberately conservative: downloaded files are never assumed capable of a
 * task merely because they are larger. */
function localModelRoutingTraits(entry) {
	const name = `${entry.inferredName} ${entry.fileName}`.toLowerCase();
	return {
		name,
		coding: /coder|code/.test(name),
		routerOnly: /gemma.*270m|270m/.test(name),
		generalChinese: /qwen/.test(name),
		lightweight: entry.fileSize <= 2200 * 1024 ** 2,
		quality: entry.fileSize >= 3e3 * 1024 ** 2
	};
}
/** Pick a real registered GGUF for an Auto session.  A score is deliberately
 * deterministic and hardware-aware: it cannot silently route an 8 GiB laptop
 * to a 12B/35B model that would spill to CPU and make an interactive turn hang. */
async function selectAutomaticLocalGguf(messages) {
	const catalog = scanLocalGgufModels().filter((entry) => entry.projectorPath === void 0);
	if (catalog.length === 0) throw new Error("自动模式未发现已注册的本地 GGUF 模型。请先在模型广场部署模型。");
	const [hardware, measurements] = await Promise.all([
		detectHardware(),
		new LocalModelPerformanceStore().list()
	]);
	const task = automaticLocalTask(messages);
	const ranked = [];
	for (const entry of catalog) {
		let plan;
		try {
			plan = planLocalGgufLaunch(entry, hardware, measurements.find((item) => item.filePath.toLowerCase() === entry.filePath.toLowerCase()));
		} catch {
			continue;
		}
		const traits = localModelRoutingTraits(entry);
		const name = traits.name;
		const sizeMiB = entry.fileSize / 1024 ** 2;
		const measured = measurements.find((item) => item.filePath.toLowerCase() === entry.filePath.toLowerCase());
		let score = plan.mode === "gpu" ? 500 : plan.mode === "hybrid" ? 80 : -180;
		score += Math.min(260, sizeMiB / 12);
		if (traits.routerOnly) score -= 900;
		if (traits.generalChinese) score += 120;
		if (task.intent === "coding") score += traits.coding ? 560 : -80;
		else if (traits.coding) score -= 250;
		if (task.requiresTools) score += Math.min(220, sizeMiB / 9);
		if (task.intent === "knowledge-retrieval" && traits.quality) score += 80;
		if (task.quick && traits.lightweight) score += 180 - sizeMiB / 20;
		if (sizeMiB > (hardware.gpu?.vramFreeMiB ?? 0) * .6) score -= 420;
		if (measured !== void 0) score += measured.tokensPerSecond < 4 ? -Math.min(360, (4 - measured.tokensPerSecond) * 100) : Math.min(120, (measured.tokensPerSecond - 4) * 8);
		ranked.push({ entry, plan, score, measured });
	}
	const winner = ranked.sort((left, right) => right.score - left.score)[0];
	if (winner === void 0) throw new Error("自动模式未找到符合当前内存/显存预算的本地模型。请关闭占用 GPU 的程序或部署更小的 GGUF 模型。");
	const reason = task.modelBenchmark ? "本地模型体检" : task.intent === "web-research" ? "联网检索" : task.intent === "knowledge-retrieval" ? "知识库检索" : task.intent === "workspace-operation" ? "工作区操作" : task.coding ? "代码/插件任务" : task.quick ? "快速问答" : "通用任务";
	return {
		entry: winner.entry,
		plan: winner.plan,
		reason,
		task,
		measured: winner.measured
	};
}
function serverExecutable() {
	const packaged = join(process.resourcesPath, "llama-cpp", "llama-server.exe");
	return existsSync(packaged) ? packaged : join(dirname(fileURLToPath(import.meta.url)), "..", "resources", "llama-cpp-b10618", "llama-server.exe");
}
/** Probe the bundled runtime without starting a model or changing the system. */
function inspectEmbeddedLlamaRuntime() {
	const executable = serverExecutable();
	if (!existsSync(executable)) return {
		available: false,
		executable,
		devices: []
	};
	try {
		return {
			available: true,
			executable,
			devices: execFileSync(executable, ["--list-devices"], {
				cwd: dirname(executable),
				encoding: "utf8",
				timeout: 5e3,
				windowsHide: true
			}).split(/\r?\n/u).map((line) => line.trim()).filter((line) => /^\S+:\s+/u.test(line))
		};
	} catch {
		return {
			available: true,
			executable,
			devices: []
		};
	}
}
function preferredGpuDevice(executable) {
	try {
		const output = execFileSync(executable, ["--list-devices"], {
			cwd: dirname(executable),
			encoding: "utf8",
			timeout: 5e3,
			windowsHide: true
		});
		return output.match(/^\s*(\S+):\s+.*NVIDIA/im)?.[1] ?? output.match(/^\s*(\S+):/m)?.[1];
	} catch {
		return;
	}
}
async function freePort() {
	return await new Promise((resolve, reject) => {
		const server = createServer().once("error", reject).listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			server.close((error) => error ? reject(error) : resolve(port));
		});
	});
}
function contentOf(message) {
	return message.content.map((block) => {
		if (block.type === "text" || block.type === "reasoning") return block.text;
		if (block.type === "tool-result") return block.content.map((item) => item.type === "text" ? item.text : "").join("\n");
		if (block.type === "tool-call") return `[tool ${block.name}(${block.arguments})]`;
		return "";
	}).filter(Boolean).join("\n");
}
async function* readSseJson(response) {
	if (response.body === null) return;
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let pending = "";
	while (true) {
		const result = await reader.read();
		pending += decoder.decode(result.value, { stream: !result.done });
		const lines = pending.split(/\r?\n/u);
		pending = result.done ? "" : lines.pop() ?? "";
		for (const line of lines) {
			if (!line.startsWith("data:")) continue;
			const data = line.slice(5).trim();
			if (data === "" || data === "[DONE]") continue;
			try {
				yield JSON.parse(data);
			} catch {}
		}
		if (result.done) break;
	}
}
var LocalGgufAdapter = class extends LlmAdapter {
	runtime;
	startup;
	diagnosticLog = new RuntimeDiagnostics();
	providerInfo(provider) {
		return {
			id: provider,
			name: "XYAI 本地模型"
		};
	}
	catalog() {
		return scanLocalGgufModels();
	}
	async listModels(provider) {
		return [{
			provider,
			id: XYAI_LOCAL_AUTO_MODEL,
			name: "自动（XYAI Auto）",
			description: "按任务、工具需求、实测速度和本机显存自动选择已部署的本地模型",
			inputModalities: ["text"]
		}, ...this.catalog().map((model) => ({
			provider,
			id: localGgufModelId(model.filePath),
			name: model.inferredName,
			description: `${model.inferredQuantization ?? "GGUF"} · ${(model.fileSize / 1024 ** 3).toFixed(1)} GB${model.projectorPath === void 0 ? "" : " · 已关联视觉投影"} · llama.cpp b10618`,
			inputModalities: ["text"]
		}))];
	}
	async resolveModel(provider, id) {
		if (id === "" || id === "UNKNOWN" || id === "unknown") throw new Error("本地模型选择已失效，XYAI 未收到有效 GGUF 模型 ID。请在模型列表的“XYAI 本地模型”中重新选择。");
		const info = (await this.listModels(provider)).find((model) => model.id === id);
		if (!info) throw new Error(`本地 GGUF 模型不存在或已移动：${id}`);
		if (id === XYAI_LOCAL_AUTO_MODEL) return {
			...info,
			context: { contextWindow: 8192 },
			defaultMaxTokens: 960
		};
		const entry = this.catalog().find((model) => localGgufModelId(model.filePath) === id);
		if (entry === void 0) throw new Error(`本地 GGUF 模型不存在或已移动：${id}`);
		const plan = planLocalGgufLaunch(entry, await detectHardware(), await new LocalModelPerformanceStore().get(entry.filePath));
		const profile = localGgufProfile(entry);
		return {
			...info,
			context: { contextWindow: plan.contextSize },
			defaultMaxTokens: Math.min(profile.maxOutputTokens, Math.floor(plan.contextSize / 4))
		};
	}
	stop() {
		this.runtime?.child.kill();
		this.runtime = void 0;
	}
	async start(id, signal) {
		if (id === "" || id === "UNKNOWN" || id === "unknown") throw new Error("本地模型无法启动：当前会话保存的是无效模型 ID。请重新选择已注册的 GGUF 模型。");
		const entry = this.catalog().find((model) => localGgufModelId(model.filePath) === id);
		if (!entry) throw new Error(`本地 GGUF 模型不存在或已移动：${id}`);
		const pending = this.startup;
		if (pending !== void 0) {
			if (pending.filePath === entry.filePath) return await pending.ready;
			await pending.ready.catch(() => void 0);
		}
		if (this.runtime?.filePath === entry.filePath && !this.runtime.child.killed) return this.runtime.port;
		const ready = this.startFresh(entry, signal);
		this.startup = { filePath: entry.filePath, ready };
		try {
			return await ready;
		} finally {
			if (this.startup?.ready === ready) this.startup = void 0;
		}
	}
	async startFresh(entry, signal) {
		this.stop();
		const executable = serverExecutable();
		if (!existsSync(executable)) throw new Error(`内置 llama.cpp 运行时缺失：${executable}`);
		const plans = localGgufFallbackPlans(planLocalGgufLaunch(entry, await detectHardware(), await new LocalModelPerformanceStore().get(entry.filePath)), process.env.XYAI_SAFE_MODE === "1");
		const failures = [];
		for (const [attempt, plan] of plans.entries()) try {
			return await this.launch(entry, executable, plan, attempt + 1, signal);
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			failures.push(message);
			if (/不支持模型架构/.test(message) || signal?.aborted) throw cause;
		}
		throw new Error(`本地模型全部启动方案均失败：${failures.join("；")}`);
	}
	async launch(entry, executable, plan, attempt, signal) {
		const port = await freePort();
		const device = plan.mode === "cpu" ? void 0 : preferredGpuDevice(executable);
		const child = spawn(executable, [
			"--model",
			entry.filePath,
			"--host",
			"127.0.0.1",
			"--port",
			String(port),
			...entry.projectorPath === void 0 ? [] : ["--mmproj", entry.projectorPath],
			...device === void 0 ? [] : ["--device", device],
			...plan.args,
			"--no-webui"
		], {
			cwd: dirname(executable),
			windowsHide: true,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		let diagnostics = "";
		child.stdout?.on("data", (chunk) => {
			diagnostics = `${diagnostics}${String(chunk)}`.slice(-8e3);
		});
		child.stderr?.on("data", (chunk) => {
			diagnostics = `${diagnostics}${String(chunk)}`.slice(-8e3);
		});
		this.runtime = {
			filePath: entry.filePath,
			fileName: entry.fileName,
			port,
			child,
			plan,
			profile: localGgufProfile(entry),
			disableThinking: shouldDisableLocalThinking(entry),
			loadedAt: 0
		};
		await this.diagnosticLog.record({
			component: "llama.cpp",
			operation: "model-load",
			status: "started",
			detail: {
				model: entry.fileName,
				attempt,
				mode: plan.mode,
				contextSize: plan.contextSize,
				device: device ?? "cpu",
				estimatedRequiredMiB: plan.estimatedRequiredMiB,
				availableBudgetMiB: plan.availableBudgetMiB
			}
		}).catch(() => void 0);
		const started = Date.now();
		const timeoutMs = plan.mode === "cpu" ? 18e4 : 12e4;
		while (Date.now() - started < timeoutMs) {
			if (signal?.aborted) {
				this.stop();
				throw new Error("用户已停止本地模型启动");
			}
			if (child.exitCode !== null) {
				this.runtime = void 0;
				const unknown = diagnostics.match(/unknown model architecture:\s*['"]?([^'"\s]+)/i)?.[1];
				const message = unknown ? `当前内置 llama.cpp 尚不支持模型架构 ${unknown}，模型文件未损坏。请在模型广场选择兼容模型。` : `启动失败（${plan.mode}，ctx=${plan.contextSize}）：${diagnostics.trim().split(/\r?\n/).slice(-4).join(" ") || `进程退出码 ${child.exitCode}`}`;
				await this.diagnosticLog.record({
					component: "llama.cpp",
					operation: "model-load",
					status: plan.mode === "cpu" ? "failed" : "degraded",
					detail: {
						model: entry.fileName,
						attempt,
						mode: plan.mode,
						exitCode: child.exitCode,
						message: message.slice(0, 3e3)
					}
				}).catch(() => void 0);
				throw new Error(message);
			}
			try {
				if ((await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1e3) })).ok) {
					if (this.runtime?.port === port) this.runtime.loadedAt = Date.now();
					await this.diagnosticLog.record({
						component: "llama.cpp",
						operation: "model-load",
						status: "succeeded",
						detail: {
							model: entry.fileName,
							attempt,
							mode: plan.mode,
							contextSize: plan.contextSize,
							durationMs: Date.now() - started
						}
					}).catch(() => void 0);
					return port;
				}
			} catch {}
			await new Promise((resolve) => setTimeout(resolve, 300));
		}
		this.stop();
		const message = `本地模型以 ${plan.mode} 模式加载超过 ${String(timeoutMs / 1e3)} 秒，已安全终止。`;
		await this.diagnosticLog.record({
			component: "llama.cpp",
			operation: "model-load",
			status: plan.mode === "cpu" ? "failed" : "degraded",
			detail: {
				model: entry.fileName,
				attempt,
				mode: plan.mode,
				message
			}
		}).catch(() => void 0);
		throw new Error(message);
	}
	async *stream(options) {
		const rawMessages = options.messages.map((message) => ({
			role: message.role,
			content: contentOf(message)
		}));
		const automatic = options.model === XYAI_LOCAL_AUTO_MODEL ? await selectAutomaticLocalGguf(rawMessages) : void 0;
		const activeModelId = automatic === void 0 ? options.model : localGgufModelId(automatic.entry.filePath);
		let port = await this.start(activeModelId, options.signal);
		const generationStartedAt = Date.now();
		let firstVisibleOutputAt = 0;
		let visibleCharacters = 0;
		const recordChatPerformance = async (inputTokens, outputTokens) => {
			const runtime = this.runtime;
			if (runtime === void 0) return;
			const generationDurationMs = Math.max(1, Date.now() - generationStartedAt);
			const measuredOutputTokens = Math.max(1, outputTokens || Math.round(visibleCharacters / 2));
			const tokensPerSecond = Math.round(measuredOutputTokens * 1e3 / generationDurationMs * 10) / 10;
			const firstOutputMs = firstVisibleOutputAt === 0 ? generationDurationMs : firstVisibleOutputAt - generationStartedAt;
			const result = {
				model: runtime.fileName,
				profile: runtime.profile.kind,
				mode: runtime.plan.mode,
				contextSize: runtime.plan.contextSize,
				generationDurationMs,
				firstOutputMs,
				inputTokens,
				outputTokens: measuredOutputTokens,
				tokensPerSecond
			};
			await this.diagnosticLog.record({
				component: "llama.cpp",
				operation: "chat-generation",
				status: firstOutputMs > 3e4 || tokensPerSecond < 2 ? "degraded" : "succeeded",
				detail: result
			}).catch(() => void 0);
			await new LocalModelPerformanceStore().record({
				filePath: runtime.filePath,
				mode: runtime.plan.mode,
				contextSize: runtime.plan.contextSize,
				tokensPerSecond,
				loadDurationMs: runtime.loadedAt > 0 ? Math.max(0, generationStartedAt - runtime.loadedAt) : 0,
				measuredAt: Date.now()
			}).catch(() => void 0);
		};
		if (automatic !== void 0) await this.diagnosticLog.record({
			component: "xyai-auto",
			operation: "local-model-route",
			status: "succeeded",
			detail: {
				selected: automatic.entry.inferredName,
				reason: automatic.reason,
				mode: automatic.plan.mode,
				measuredTokensPerSecond: automatic.measured?.tokensPerSecond
			}
		}).catch(() => void 0);
		const breakToolLoop = shouldBreakLocalToolLoop(rawMessages);
		if (options.system) rawMessages.unshift({
			role: "system",
			content: options.system
		});
		let messages = [...anchorLocalContinuation(rawMessages)];
		if (automatic !== void 0 && !automatic.task.requiresTools) messages.unshift({
			role: "system",
			content: "XYAI Auto 当前为直接答复模式：这是普通对话或本地模型体检请求。不得调用工具、不得创建 subagent、不得列出工具 JSON；直接给出简洁且完整的最终答复。"
		});
		if (breakToolLoop) messages.unshift({
			role: "system",
			content: "XYAI 检测到重复工具调用循环。本轮禁止继续调用工具；请基于已有工具结果直接给出简洁、可用的最终答复，并明确仍缺少的信息。"
		});
		const profile = this.runtime?.profile ?? { kind: "standard", maxOutputTokens: 2048, maximumTools: 8, compactSkillCatalog: false };
		messages = adaptLocalGgufMessages(messages, profile);
		let maxTokens = Math.min(options.maxTokens ?? profile.maxOutputTokens, profile.maxOutputTokens, Math.max(128, Math.floor((this.runtime?.plan.contextSize ?? 8192) / 4)));
		const suppressToolsForAuto = automatic !== void 0 && !automatic.task.requiresTools;
		const permittedTools = automatic?.task.webSearch ? options.tools?.filter((tool) => tool.name === "web_search") : options.tools;
		const tools = breakToolLoop || suppressToolsForAuto ? [] : permittedTools?.map((tool) => ({
			type: "function",
			function: tool
		})) ?? [];
		if (suppressToolsForAuto) await this.diagnosticLog.record({
			component: "xyai-auto",
			operation: "tool-policy",
			status: "succeeded",
			detail: { reason: automatic.task.modelBenchmark ? "model-benchmark-direct" : "direct-answer-default", registeredTools: options.tools?.length ?? 0, selectedTools: 0 }
		}).catch(() => void 0);
		let initial = prepareLocalContextHandoff(messages, this.runtime?.plan.contextSize ?? 8192, maxTokens, tools, 1, profile.maximumTools);
		const measured = this.runtime === void 0 ? void 0 : await new LocalModelPerformanceStore().get(this.runtime.filePath);
		if (measured !== void 0 && measured.tokensPerSecond < 4 && initial.tools.length === 0) {
			maxTokens = Math.min(maxTokens, measured.tokensPerSecond < 2.5 ? 384 : 512);
			initial = prepareLocalContextHandoff(messages, this.runtime?.plan.contextSize ?? 8192, maxTokens, tools, 1, profile.maximumTools);
		}
		let outputIndex = 0;
		if (initial.omittedMessages > 0) {
			const note = `XYAI 正在进行本地模型交接：已压缩 ${String(initial.omittedMessages)} 条历史消息，并从 ${String(tools.length)} 个工具中筛选 ${String(initial.tools.length)} 个适用工具。`;
			yield {
				type: "block-start",
				index: outputIndex,
				blockType: "reasoning"
			};
			yield {
				type: "reasoning-delta",
				index: outputIndex,
				text: note
			};
			yield {
				type: "block-end",
				index: outputIndex,
				block: {
					type: "reasoning",
					text: note
				}
			};
			outputIndex++;
		}
		if (initial.omittedTools > 0) await this.diagnosticLog.record({
			component: "llama.cpp",
			operation: "tool-budget",
			status: "degraded",
			detail: {
				registeredTools: tools.length,
				selectedTools: initial.tools.length,
				omittedTools: initial.omittedTools,
				estimatedInputTokens: initial.estimatedInputTokens,
				inputBudgetTokens: initial.inputBudgetTokens
			}
		}).catch(() => void 0);
		const request = async (handoff, includeTools = true) => {
			const send = async () => await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...handoff.compacted ? { "x-xyai-context-handoff": "1" } : {}
				},
				...options.signal === void 0 ? {} : { signal: options.signal },
				body: JSON.stringify({
					model: activeModelId,
					messages: handoff.messages,
					stream: true,
					stream_options: { include_usage: true },
					max_tokens: maxTokens,
					temperature: options.temperature ?? .7,
					...this.runtime?.disableThinking === true ? { chat_template_kwargs: { enable_thinking: false } } : {},
					...includeTools && handoff.tools.length ? { tools: handoff.tools } : {}
				})
			});
			try {
				return await send();
			} catch (cause) {
				if (options.signal?.aborted) throw cause;
				await this.diagnosticLog.record({
					component: "llama.cpp",
					operation: "request-recovery",
					status: "degraded",
					detail: {
						model: activeModelId,
						message: cause instanceof Error ? cause.message : String(cause)
					}
				}).catch(() => void 0);
				this.stop();
				port = await this.start(activeModelId, options.signal);
				return await send();
			}
		};
		let response = await request(initial);
		if (!response.ok && response.status === 400) {
			const firstBody = await response.text();
			if (/exceed(?:s|_).*context|exceed_context_size/i.test(firstBody)) {
				const note = "目标模型的实际分词高于预估，XYAI 正在执行第二级上下文压缩并重试。";
				yield {
					type: "block-start",
					index: outputIndex,
					blockType: "reasoning"
				};
				yield {
					type: "reasoning-delta",
					index: outputIndex,
					text: note
				};
				yield {
					type: "block-end",
					index: outputIndex,
					block: {
						type: "reasoning",
						text: note
					}
				};
				outputIndex++;
				response = await request(prepareLocalContextHandoff(messages, this.runtime?.plan.contextSize ?? 8192, Math.min(maxTokens, 1024), tools, .72, profile.maximumTools));
			} else if (/unable to generate parser|automatic parser generation failed|jinja exception.*roles must alternate/is.test(firstBody)) {
				const note = "当前模型模板不支持结构化工具解析，XYAI 已保留任务交接内容并切换为文本兼容模式重试。";
				yield {
					type: "block-start",
					index: outputIndex,
					blockType: "reasoning"
				};
				yield {
					type: "reasoning-delta",
					index: outputIndex,
					text: note
				};
				yield {
					type: "block-end",
					index: outputIndex,
					block: {
						type: "reasoning",
						text: note
					}
				};
				outputIndex++;
				response = await request(prepareLocalContextHandoff(messages, this.runtime?.plan.contextSize ?? 8192, maxTokens, [], .9, profile.maximumTools), false);
			} else throw new Error(`本地模型调用失败（HTTP ${response.status}）：${firstBody}`);
		}
		if (!response.ok) {
			const body = await response.text();
			if (response.status === 400 && /exceed(?:s|_).*context|exceed_context_size/i.test(body)) {
				const promptTokens = body.match(/"n_prompt_tokens"\s*:\s*(\d+)/)?.[1];
				const contextTokens = body.match(/"n_ctx"\s*:\s*(\d+)/)?.[1];
				throw new Error(`本地模型自动压缩、工具筛选和交接后仍超出上下文：请求约 ${promptTokens ?? "未知"} tokens，可用 ${contextTokens ?? String(this.runtime?.plan.contextSize ?? 0)} tokens。XYAI 已保留原会话，可切换至更大上下文模型继续。`);
			}
			throw new Error(`本地模型调用失败（HTTP ${response.status}）：${body}`);
		}
		if (/text\/event-stream/i.test(response.headers.get("content-type") ?? "")) {
			let active;
			const toolCalls = /* @__PURE__ */ new Map();
			let inputTokens = 0;
			let completionTokens = 0;
			let finishReason = null;
			for await (const raw of readSseJson(response)) {
				const payload = raw;
				if (payload.usage !== void 0) {
					inputTokens = payload.usage.prompt_tokens ?? inputTokens;
					completionTokens = payload.usage.completion_tokens ?? completionTokens;
				}
				const choice = payload.choices?.[0];
				finishReason = choice?.finish_reason ?? finishReason;
				const delta = choice?.delta;
				const reasoningDelta = delta?.reasoning_content ?? "";
				const textDelta = delta?.content ?? "";
				if (reasoningDelta !== "") {
					if (firstVisibleOutputAt === 0) firstVisibleOutputAt = Date.now();
					if (active?.kind !== "reasoning") {
						if (active !== void 0) yield {
							type: "block-end",
							index: active.index,
							block: {
								type: active.kind,
								text: active.text
							}
						};
						active = {
							kind: "reasoning",
							index: outputIndex++,
							text: ""
						};
						yield {
							type: "block-start",
							index: active.index,
							blockType: "reasoning"
						};
					}
					active.text += reasoningDelta;
					yield {
						type: "reasoning-delta",
						index: active.index,
						text: reasoningDelta
					};
				}
				if (textDelta !== "") {
					if (firstVisibleOutputAt === 0) firstVisibleOutputAt = Date.now();
					visibleCharacters += textDelta.length;
					if (active?.kind !== "text") {
						if (active !== void 0) yield {
							type: "block-end",
							index: active.index,
							block: {
								type: active.kind,
								text: active.text
							}
						};
						active = {
							kind: "text",
							index: outputIndex++,
							text: ""
						};
						yield {
							type: "block-start",
							index: active.index,
							blockType: "text"
						};
					}
					active.text += textDelta;
					yield {
						type: "text-delta",
						index: active.index,
						text: textDelta
					};
				}
				for (const part of delta?.tool_calls ?? []) {
					const key = part.index ?? 0;
					const existing = toolCalls.get(key) ?? {
						id: "",
						name: "",
						arguments: ""
					};
					existing.id += part.id ?? "";
					existing.name += part.function?.name ?? "";
					existing.arguments += part.function?.arguments ?? "";
					toolCalls.set(key, existing);
				}
			}
			if (active !== void 0) yield {
				type: "block-end",
				index: active.index,
				block: {
					type: active.kind,
					text: active.text
				}
			};
			for (const call of [...toolCalls.values()]) {
				const id = call.id || `call-${String(outputIndex)}`;
				const callName = call.name || "unknown";
				const args = call.arguments || "{}";
				yield {
					type: "block-start",
					index: outputIndex,
					blockType: "tool-call"
				};
				yield {
					type: "tool-call-delta",
					index: outputIndex,
					id,
					name: callName,
					argumentsDelta: args
				};
				yield {
					type: "block-end",
					index: outputIndex,
					block: {
						type: "tool-call",
						id,
						name: callName,
						arguments: args
					}
				};
				outputIndex++;
			}
			await recordChatPerformance(inputTokens, completionTokens);
			yield {
				type: "usage",
				usage: {
					inputTokens,
					outputTokens: completionTokens
				}
			};
			yield {
				type: "finish",
				reason: toolCalls.size > 0 ? { kind: "tool-calls" } : finishReason === "length" ? { kind: "max-tokens" } : { kind: "stop" }
			};
			return;
		}
		const payload = await response.json();
		const choice = payload.choices?.[0];
		const reasoning = choice?.message?.reasoning_content ?? "";
		const text = choice?.message?.content ?? "";
		if (reasoning !== "" || text !== "") firstVisibleOutputAt = Date.now();
		visibleCharacters = text.length;
		let index = outputIndex;
		if (reasoning) {
			yield {
				type: "block-start",
				index,
				blockType: "reasoning"
			};
			yield {
				type: "reasoning-delta",
				index,
				text: reasoning
			};
			yield {
				type: "block-end",
				index,
				block: {
					type: "reasoning",
					text: reasoning
				}
			};
			index++;
		}
		if (text) {
			yield {
				type: "block-start",
				index,
				blockType: "text"
			};
			yield {
				type: "text-delta",
				index,
				text
			};
			yield {
				type: "block-end",
				index,
				block: {
					type: "text",
					text
				}
			};
			index++;
		}
		for (const call of choice?.message?.tool_calls ?? []) {
			const id = call.id ?? `call-${index}`;
			const callName = call.function?.name ?? "unknown";
			const args = call.function?.arguments ?? "{}";
			yield {
				type: "block-start",
				index,
				blockType: "tool-call"
			};
			yield {
				type: "tool-call-delta",
				index,
				id,
				name: callName,
				argumentsDelta: args
			};
			yield {
				type: "block-end",
				index,
				block: {
					type: "tool-call",
					id,
					name: callName,
					arguments: args
				}
			};
			index++;
		}
		await recordChatPerformance(payload.usage?.prompt_tokens ?? 0, payload.usage?.completion_tokens ?? 0);
		yield {
			type: "usage",
			usage: {
				inputTokens: payload.usage?.prompt_tokens ?? 0,
				outputTokens: payload.usage?.completion_tokens ?? 0
			}
		};
		yield {
			type: "finish",
			reason: choice?.message?.tool_calls?.length ? { kind: "tool-calls" } : choice?.finish_reason === "length" ? { kind: "max-tokens" } : { kind: "stop" }
		};
	}
	async benchmarkFile(filePath) {
		const entry = this.catalog().find((model) => model.filePath.toLowerCase() === filePath.toLowerCase());
		if (!entry) throw new Error("基准测试只允许使用模型广场已识别的本地 GGUF 文件。");
		const loadedAt = Date.now();
		try {
			const port = await this.start(localGgufModelId(entry.filePath));
			const loadDurationMs = Date.now() - loadedAt;
			const generatedAt = Date.now();
			const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				signal: AbortSignal.timeout(12e4),
				body: JSON.stringify({
					model: localGgufModelId(entry.filePath),
					messages: [{
						role: "user",
						content: "请用简短中文说明本地推理正常工作。"
					}],
					stream: false,
					max_tokens: 64,
					temperature: 0,
					...shouldDisableLocalThinking(entry) ? { chat_template_kwargs: { enable_thinking: false } } : {}
				})
			});
			if (!response.ok) throw new Error(`基准生成失败（HTTP ${response.status}）：${(await response.text()).slice(0, 500)}`);
			const payload = await response.json();
			const generationDurationMs = Math.max(1, Date.now() - generatedAt);
			const content = payload.choices?.[0]?.message?.content ?? "";
			if (content.trim() === "") throw new Error("基准生成未产生可见正文；模型可能把输出额度全部消耗在隐藏推理中。");
			const outputTokens = payload.usage?.completion_tokens ?? Math.max(1, Math.round(content.length / 2));
			const result = {
				model: entry.fileName,
				mode: this.runtime?.plan.mode ?? "cpu",
				contextSize: this.runtime?.plan.contextSize ?? 2048,
				loadDurationMs,
				generationDurationMs,
				inputTokens: payload.usage?.prompt_tokens ?? 0,
				outputTokens,
				tokensPerSecond: Math.round(outputTokens * 1e3 / generationDurationMs * 10) / 10
			};
			await this.diagnosticLog.record({
				component: "llama.cpp",
				operation: "benchmark",
				status: "succeeded",
				detail: { ...result }
			}).catch(() => void 0);
			await new LocalModelPerformanceStore().record({
				filePath: entry.filePath,
				mode: result.mode,
				contextSize: result.contextSize,
				tokensPerSecond: result.tokensPerSecond,
				loadDurationMs: result.loadDurationMs,
				measuredAt: Date.now()
			}).catch(() => void 0);
			return result;
		} catch (cause) {
			await this.diagnosticLog.record({
				component: "llama.cpp",
				operation: "benchmark",
				status: "failed",
				detail: {
					model: entry.fileName,
					message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 3e3)
				}
			}).catch(() => void 0);
			throw cause;
		}
	}
	dispose() {
		this.stop();
	}
};
/** Run an explicit, user-triggered local model benchmark and always release its process. */
async function benchmarkLocalGgufModel(filePath) {
	const adapter = new LocalGgufAdapter();
	try {
		return await adapter.benchmarkFile(filePath);
	} finally {
		adapter.dispose();
	}
}
let sharedAdapter;
function apply(ctx) {
	const adapter = new LocalGgufAdapter();
	sharedAdapter = adapter;
	const registration = ctx.llm.registerAdapter([XYAI_LOCAL_PROVIDER], adapter);
	const announce = () => {
		registration.replace([XYAI_LOCAL_PROVIDER]);
	};
	catalogListeners.add(announce);
	ctx.effect(() => () => {
		catalogListeners.delete(announce);
		registration();
		adapter.dispose();
		sharedAdapter = sharedAdapter === adapter ? void 0 : sharedAdapter;
	}, "dsh-plugin-desktop: isolated llama.cpp server adapter");
}
/**
* 宿主批处理(知识库深度解析等)与对话复用同一本地模型运行时:单次补全。
* 无运行时、启动失败、超时或空输出一律返回 undefined,由调用方回退基础路径,绝不打断批处理。
*/
async function completeWithLocalGguf(modelId, system, prompt, options) {
	const adapter = sharedAdapter;
	if (adapter === void 0) return void 0;
	try {
		const timeoutMs = options?.timeoutMs ?? 15e4;
		const prepared = await adapter.prepareCall(XYAI_LOCAL_PROVIDER, modelId, AbortSignal.timeout(timeoutMs));
		let text = "";
		for await (const chunk of prepared.stream({
			provider: XYAI_LOCAL_PROVIDER,
			model: modelId,
			messages: [{
				role: "user",
				content: [{
					type: "text",
					text: prompt
				}]
			}],
			system,
			temperature: options?.temperature ?? .2,
			maxTokens: options?.maxTokens ?? 900,
			signal: AbortSignal.timeout(timeoutMs)
		})) if (chunk.type === "text-delta") text += chunk.text;
		return text.trim() === "" ? void 0 : text;
	} catch {
		return;
	}
}
/** 为批处理挑选最小可运行 GGUF(按体积升序,首个资源预算通过的模型);无目录或无预算时返回 undefined。 */
async function preferredLocalGgufForBatch() {
	if (sharedAdapter === void 0) return void 0;
	const catalog = scanLocalGgufModels().filter((entry) => entry.projectorPath === void 0).sort((a, b) => a.fileSize - b.fileSize);
	if (catalog.length === 0) return void 0;
	const hardware = await detectHardware();
	for (const entry of catalog) {
		const plan = planLocalGgufLaunch(entry, hardware, await new LocalModelPerformanceStore().get(entry.filePath));
		if (plan.estimatedRequiredMiB <= plan.availableBudgetMiB) return {
			id: localGgufModelId(entry.filePath),
			name: entry.inferredName
		};
	}
}
//#endregion
export { formatRuntimeDiagnosticReport as _, inject as a, detectHardware as b, localGgufModelId as c, planLocalGgufLaunch as d, preferredLocalGgufForBatch as f, defaultRuntimeDiagnosticsPath as g, RuntimeDiagnostics as h, completeWithLocalGguf as i, name as l, LocalModelPerformanceStore as m, apply as n, inspectEmbeddedLlamaRuntime as o, shouldDisableLocalThinking as p, benchmarkLocalGgufModel as r, localGgufFallbackPlans as s, XYAI_LOCAL_PROVIDER as t, notifyLocalGgufCatalogChanged as u, getRecommendedModels as v, detectOllama as x, scanLocalGgufModels as y };

//# sourceMappingURL=local-gguf-3IBAx29M.js.map
