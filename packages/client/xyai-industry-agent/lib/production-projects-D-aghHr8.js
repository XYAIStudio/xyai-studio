import { isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
//#region src/production-projects.ts
const ID = /^[a-f0-9-]{36}$/u;
const KINDS = /* @__PURE__ */ new Set([
	"agent",
	"skill",
	"system"
]);
const ARTIFACT_KINDS = /* @__PURE__ */ new Set([
	"agent-job",
	"agent-install",
	"skill-install",
	"review-report",
	"review-report-file",
	"release-readiness",
	"node-rework"
]);
const SYSTEM_BASES = /* @__PURE__ */ new Set(["xyos", "standalone"]);
function text(value, label, max, required = false) {
	if (typeof value !== "string") throw new Error(`${label} must be text`);
	const result = value.trim();
	if (required && result === "") throw new Error(`${label} is required`);
	if (result.length > max) throw new Error(`${label} is too long`);
	return result;
}
function documentText(value) {
	if (typeof value !== "string") throw new Error("artifact content must be text");
	if (value.trim() === "") throw new Error("artifact content is required");
	if (value.length > 2e5) throw new Error("artifact content is too long");
	return value;
}
function safeFileStem(value) {
	return value.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/gu, "-").replace(/^[.-]+|[.-]+$/gu, "").slice(0, 80) || "验收报告";
}
function kinds(value) {
	if (value === void 0) return ["agent"];
	if (!Array.isArray(value)) throw new Error("kinds must be a list");
	const result = value.filter((item) => typeof item === "string" && KINDS.has(item));
	return result.length ? Array.from(new Set(result)) : ["agent"];
}
function artifacts(value) {
	if (value === void 0) return [];
	if (!Array.isArray(value)) throw new Error("artifacts must be a list");
	return value.map((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid artifact");
		const source = item;
		const kind = text(source.kind, "artifact kind", 30, true);
		if (!ARTIFACT_KINDS.has(kind)) throw new Error("invalid artifact kind");
		const createdAt = text(source.createdAt, "artifact createdAt", 40, true);
		const updatedAt = text(source.updatedAt, "artifact updatedAt", 40, true);
		if (Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(updatedAt))) throw new Error("invalid artifact timestamp");
		return {
			id: text(source.id, "artifact id", 36, true),
			kind,
			name: text(source.name, "artifact name", 120, true),
			status: text(source.status, "artifact status", 40, true),
			reference: text(source.reference ?? "", "artifact reference", 500),
			createdAt,
			updatedAt
		};
	});
}
function systemBase(value) {
	if (value === void 0) return void 0;
	if (typeof value !== "string" || !SYSTEM_BASES.has(value)) throw new Error("invalid system base");
	return value;
}
function workspacePath(value) {
	if (value === void 0) return void 0;
	const result = text(value, "workspacePath", 1e3, true);
	if (!isAbsolute(result)) throw new Error("workspacePath must be absolute");
	return result;
}
function parseProject(value, expectedId) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid project file");
	const source = value;
	const id = text(source.id, "id", 36, true);
	if (!ID.test(id) || expectedId !== void 0 && id !== expectedId) throw new Error("invalid project id");
	const createdAt = text(source.createdAt, "createdAt", 40, true);
	const updatedAt = text(source.updatedAt, "updatedAt", 40, true);
	if (Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(updatedAt))) throw new Error("invalid project timestamp");
	const path = workspacePath(source.workspacePath);
	const base = systemBase(source.systemBase);
	return {
		schemaVersion: 1,
		id,
		name: text(source.name, "name", 80, true),
		goal: text(source.goal ?? "", "goal", 500),
		industry: text(source.industry ?? "", "industry", 80),
		kinds: kinds(source.kinds),
		stage: text(source.stage ?? "draft", "stage", 40, true),
		artifacts: artifacts(source.artifacts),
		...path === void 0 ? {} : { workspacePath: path },
		...base === void 0 ? {} : { systemBase: base },
		createdAt,
		updatedAt
	};
}
var ProductionProjectStore = class {
	root;
	constructor(root = dshHomePath("xyai-projects")) {
		this.root = root;
	}
	file(id) {
		if (!ID.test(id)) throw new Error("invalid project id");
		return join(this.root, `${id}.json`);
	}
	async list() {
		let files;
		try {
			files = (await readdir(this.root)).filter((name) => name.endsWith(".json") && ID.test(name.slice(0, -5)));
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
		return (await Promise.allSettled(files.map(async (name) => parseProject(JSON.parse(await readFile(join(this.root, name), "utf8")), name.slice(0, -5))))).filter((item) => item.status === "fulfilled").map((item) => item.value).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}
	async get(id) {
		return parseProject(JSON.parse(await readFile(this.file(id), "utf8")), id);
	}
	async create(input) {
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const requestedPath = workspacePath(input.workspacePath);
		let canonicalPath;
		if (requestedPath !== void 0) {
			canonicalPath = await realpath(requestedPath);
			if (!(await stat(canonicalPath)).isDirectory()) throw new Error("workspacePath must be a directory");
		}
		const base = systemBase(input.systemBase);
		const project = {
			schemaVersion: 1,
			id: randomUUID(),
			name: text(input.name, "name", 80, true),
			goal: text(input.goal ?? "", "goal", 500),
			industry: text(input.industry ?? "", "industry", 80),
			kinds: kinds(input.kinds),
			stage: canonicalPath === void 0 ? "draft" : "workspace-ready",
			artifacts: [],
			...canonicalPath === void 0 ? {} : { workspacePath: canonicalPath },
			...base === void 0 ? {} : { systemBase: base },
			createdAt: now,
			updatedAt: now
		};
		if (canonicalPath !== void 0) await this.scaffoldWorkspace(project, canonicalPath);
		await this.save(project);
		return project;
	}
	async update(id, input) {
		const current = parseProject(JSON.parse(await readFile(this.file(id), "utf8")), id);
		const nextBase = input.systemBase === void 0 ? void 0 : systemBase(input.systemBase);
		const project = {
			...current,
			...input.name === void 0 ? {} : { name: text(input.name, "name", 80, true) },
			...input.goal === void 0 ? {} : { goal: text(input.goal, "goal", 500) },
			...input.industry === void 0 ? {} : { industry: text(input.industry, "industry", 80) },
			...input.kinds === void 0 ? {} : { kinds: kinds(input.kinds) },
			...nextBase === void 0 ? {} : { systemBase: nextBase },
			...input.stage === void 0 ? {} : { stage: text(input.stage, "stage", 40, true) },
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		await this.save(project);
		return project;
	}
	async addArtifact(id, input) {
		const current = parseProject(JSON.parse(await readFile(this.file(id), "utf8")), id);
		if (!ARTIFACT_KINDS.has(input.kind)) throw new Error("invalid artifact kind");
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const name = text(input.name, "artifact name", 120, true);
		const status = text(input.status ?? "created", "artifact status", 40, true);
		const reference = text(input.reference ?? "", "artifact reference", 500);
		const existing = current.artifacts.find((item) => reference !== "" && item.kind === input.kind && item.reference === reference);
		const artifact = existing === void 0 ? {
			id: randomUUID(),
			kind: input.kind,
			name,
			status,
			reference,
			createdAt: now,
			updatedAt: now
		} : {
			...existing,
			name,
			status,
			updatedAt: now
		};
		const next = existing === void 0 ? [...current.artifacts, artifact] : current.artifacts.map((item) => item.id === existing.id ? artifact : item);
		const project = {
			...current,
			artifacts: next,
			updatedAt: now
		};
		await this.save(project);
		return project;
	}
	async writeArtifactFile(id, input) {
		this.file(id);
		if (input.kind !== "review-report-file") throw new Error("invalid file artifact kind");
		const name = text(input.name, "artifact name", 120, true);
		const content = documentText(input.content);
		const status = text(input.status ?? "created", "artifact status", 40, true);
		const directory = join(this.root, id, "artifacts");
		await mkdir(directory, { recursive: true });
		const filename = `${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/gu, "-")}-${safeFileStem(name)}-${randomUUID().slice(0, 8)}.md`;
		const target = join(directory, filename);
		await writeFile(target, content, {
			encoding: "utf8",
			flag: "wx"
		});
		try {
			return await this.addArtifact(id, {
				kind: "review-report-file",
				name,
				status,
				reference: join(id, "artifacts", filename)
			});
		} catch (error) {
			await unlink(target).catch(() => void 0);
			throw error;
		}
	}
	async readArtifactFile(id, artifactId) {
		const current = parseProject(JSON.parse(await readFile(this.file(id), "utf8")), id);
		if (!ID.test(artifactId)) throw new Error("invalid artifact id");
		const artifact = current.artifacts.find((item) => item.id === artifactId && item.kind === "review-report-file");
		if (artifact === void 0) throw new Error("artifact file not found");
		const directory = resolve(this.root, id, "artifacts");
		const target = resolve(this.root, artifact.reference);
		const nested = relative(directory, target);
		if (nested === "" || nested.startsWith("..") || isAbsolute(nested)) throw new Error("invalid artifact file path");
		return {
			name: artifact.name,
			content: await readFile(target, "utf8"),
			reference: artifact.reference
		};
	}
	async scaffoldWorkspace(project, target) {
		const metadata = join(target, ".xyai");
		await Promise.all([
			mkdir(metadata, { recursive: true }),
			mkdir(join(target, "src"), { recursive: true }),
			mkdir(join(target, "docs"), { recursive: true }),
			mkdir(join(target, "data"), { recursive: true }),
			mkdir(join(target, "artifacts"), { recursive: true })
		]);
		const writeOnce = async (file, content) => {
			await writeFile(file, content, {
				encoding: "utf8",
				flag: "wx"
			}).catch((error) => {
				if (error.code !== "EEXIST") throw error;
			});
		};
		await writeOnce(join(metadata, "project.json"), `${JSON.stringify({
			schema: "xyai.system-project.v1",
			id: project.id,
			name: project.name,
			goal: project.goal,
			base: project.systemBase ?? "standalone",
			workspace: target,
			createdAt: project.createdAt
		}, null, 2)}\n`);
		await writeOnce(join(target, "README.md"), `# ${project.name}\n\n${project.goal || "本项目由 XYAI Studio 创建。"}\n\n- 运行模式：${project.systemBase === "xyos" ? "基于 XYOS 扩展" : "独立管理系统"}\n- 本机工作区：${target}\n- 项目状态：草稿\n`);
		await writeOnce(join(target, "AGENTS.md"), `# XYAI Studio 项目规则\n\n- 所有源码、配置、数据样例和交付物必须写入当前工作区。\n- 默认仅允许修改当前工作区；访问工作区外路径前必须征得用户批准。\n- 不得把 API Key、口令、客户隐私或商业秘密写入源码和日志。\n- 先检查现有文件，再实施修改；每次变更后执行与风险相称的验证。\n- 系统基座：${project.systemBase === "xyos" ? "XYOS 扩展（保留与 XYOS 的接口边界）" : "独立系统（不得依赖 XYOS 运行时）"}。\n`);
	}
	async save(project) {
		await mkdir(this.root, { recursive: true });
		const file = this.file(project.id);
		const temporary = `${file}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
			await rename(temporary, file);
		} catch (error) {
			await unlink(temporary).catch(() => void 0);
			throw error;
		}
	}
};
//#endregion
export { ProductionProjectStore as t };

//# sourceMappingURL=production-projects-D-aghHr8.js.map