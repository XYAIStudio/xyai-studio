import { r as resolveXyosBackendDir } from "./xyos-backend-DROJg1pS.js";
import { b as detectHardware, f as preferredLocalGgufForBatch, i as completeWithLocalGguf } from "./local-gguf-3IBAx29M.js";
import { t as OllamaClient } from "./ollama-client-B5R1Vg5V.js";
import { t as ProductionProjectStore } from "./production-projects-D-aghHr8.js";
import { createRequire } from "node:module";
import { createWriteStream, existsSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { mkdir, readFile, readdir, realpath, rename, rm, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { Service } from "@deepseek-ai/cordis";
import * as McpClient from "@deepseek-ai/dsh-mcp-client";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { Client as McpSdkClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
//#region src/skill-routes.ts
/** Read and parse one request body as JSON; rejects malformed input. */
async function readJson$1(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
/** Write one JSON response with an explicit length and UTF-8 content type. */
function reply$6(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload)
	});
	res.end(payload);
}
/** Register the skill-workbench route; returns the exact disposer. */
function registerSkillRoutes(ctx, service) {
	return ctx.webServer.register({
		kind: "exact",
		path: "/api/skills",
		handler: async (req, res) => {
			try {
				if (req.method === "GET") {
					reply$6(res, 200, await service.list());
					return;
				}
				if (req.method === "POST") {
					const input = await readJson$1(req);
					reply$6(res, 200, { path: await service.install(input) });
					return;
				}
				if (req.method === "DELETE") {
					const name = new URL(req.url ?? "/", "http://x").searchParams.get("name") ?? "";
					await service.remove(name);
					reply$6(res, 200, { removed: true });
					return;
				}
				reply$6(res, 405, { error: "method-not-allowed" });
			} catch (error) {
				reply$6(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
}
//#endregion
//#region src/skill-bundle.ts
/**
* Pure skill-bundle rendering and name validation for the XYAI skill workbench.
*
* The guided wizard collects structured fields; this module turns them into the
* exact `SKILL.md` the `skill-filesystem` provider parses: YAML frontmatter
* (`name`, `description`, optional `whenToUse`) followed by the Markdown body.
* Name validation mirrors the provider's kebab-case rule so the wizard rejects
* an invalid name before writing it, instead of the provider dropping the whole
* bundle on discovery.
*
* @module dsh-plugin-desktop skill bundle
*/
/** Kebab-case rule the filesystem provider enforces: lower-case letters and digits, hyphen separators. */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Whether `name` satisfies the kebab-case rule the filesystem provider enforces. */
function isValidSkillName(name) {
	return SKILL_NAME_PATTERN.test(name);
}
/** Render a complete `SKILL.md` document from the wizard's structured fields. */
function renderSkillMarkdown(input) {
	const whenToUse = input.whenToUse === void 0 || input.whenToUse === "" ? "" : `\nwhenToUse: ${input.whenToUse}`;
	return `---\nname: ${input.name}\ndescription: ${input.description}${whenToUse}\n---\n\n${input.body}\n`;
}
//#endregion
//#region src/skill-install.ts
/**
* Filesystem-backed skill install/remove/list for the XYAI skill workbench.
*
* Writes and deletes skill bundles under a skill root — default
* `dshHomePath('skills')`, the user root `skill-filesystem` scans and
* hot-reloads. Name validation and Markdown rendering come from
* `./skill-bundle.ts`; this module owns only the filesystem effects.
*
* @module dsh-plugin-desktop skill install
*/
/** Owns one skill root's filesystem effects; the root is injectable for tests. */
var SkillInstaller = class {
	/** The skill root this installer reads and writes. */
	root;
	/** @param root - skill root; defaults to the user skill root `dshHomePath('skills')`. */
	constructor(root = dshHomePath("skills")) {
		this.root = root;
	}
	/** Write one skill bundle as `<root>/<name>/SKILL.md`, creating directories as needed. */
	async install(input) {
		if (!isValidSkillName(input.name)) throw new Error(`skill name ${JSON.stringify(input.name)} is not kebab-case`);
		const directory = join(this.root, input.name);
		await mkdir(directory, { recursive: true });
		const file = join(directory, "SKILL.md");
		await writeFile(file, renderSkillMarkdown(input), "utf8");
		return file;
	}
	/** Delete one skill bundle directory; a missing bundle is a no-op. */
	async remove(name) {
		if (!isValidSkillName(name)) throw new Error(`skill name ${JSON.stringify(name)} is not kebab-case`);
		await rm(join(this.root, name), {
			recursive: true,
			force: true
		});
	}
	/** List installed skill names (directories under the root); a missing root is empty. */
	async list() {
		try {
			return (await readdir(this.root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
	}
};
//#endregion
//#region src/skill-workspace-service.ts
/**
* Host service owning the XYAI skill workbench's filesystem effects.
*
* Wraps `SkillInstaller` behind the Cordis service boundary so host plugins
* (and, next, a `webServer` route exposing these calls to the browser client)
* install, remove, and list industry skill bundles through one owning service.
* The root defaults to the user skill root `dshHomePath('skills')` and is
* injectable for tests.
*
* @module dsh-plugin-desktop skill workspace service
*/
/** Host-side skill-bundle manager registered as `ctx.skillWorkspace`. */
var SkillWorkspaceService = class extends Service {
	installer;
	/**
	* @param ctx - Cordis context owning this service lifetime.
	* @param root - skill root; defaults to `dshHomePath('skills')`.
	*/
	constructor(ctx, root) {
		super(ctx, "skillWorkspace");
		this.installer = new SkillInstaller(root);
	}
	/** Write one skill bundle and return the written `SKILL.md` path. */
	install(input) {
		return this.installer.install(input);
	}
	/** Delete one skill bundle directory. */
	remove(name) {
		return this.installer.remove(name);
	}
	/** List installed skill names. */
	list() {
		return this.installer.list();
	}
};
//#endregion
//#region src/experience-workspaces.ts
const ID$2 = /^[a-f0-9-]{36}$/u;
const SOURCES = /* @__PURE__ */ new Set([
	"local-file",
	"ima",
	"manual",
	"xyos-template"
]);
const MATERIAL_STATUSES = /* @__PURE__ */ new Set(["catalogued", "reviewed"]);
const RULE_TYPES = /* @__PURE__ */ new Set([
	"principle",
	"decision",
	"procedure",
	"exception",
	"taboo",
	"template"
]);
const RULE_STATUSES = /* @__PURE__ */ new Set([
	"draft",
	"confirmed",
	"rejected",
	"needs-clarification"
]);
const CASE_TYPES = /* @__PURE__ */ new Set([
	"typical",
	"boundary",
	"counterexample"
]);
const CASE_STATUSES = /* @__PURE__ */ new Set([
	"draft",
	"ready",
	"passed",
	"failed"
]);
const SECRET = /(?:\b(?:api[_ -]?key|authorization|bearer)\b\s*[:=]|\bsk-[a-z0-9_-]{12,})/iu;
function text$1(value, label, max, required = false) {
	if (typeof value !== "string") throw new Error(`${label} must be text`);
	const result = value.trim();
	if (required && result === "") throw new Error(`${label} is required`);
	if (result.length > max) throw new Error(`${label} is too long`);
	if (SECRET.test(result)) throw new Error(`${label} appears to contain a credential; credentials are never stored in experience assets`);
	return result;
}
function enumValue$1(value, values, label) {
	const result = text$1(value, label, 40, true);
	if (!values.has(result)) throw new Error(`invalid ${label}`);
	return result;
}
function assetId(value, label) {
	const result = text$1(value, label, 36, true);
	if (!ID$2.test(result)) throw new Error(`invalid ${label}`);
	return result;
}
function ids(value, label, max = 30) {
	if (!Array.isArray(value)) throw new Error(`${label} must be a list`);
	if (value.length > max) throw new Error(`${label} is too large`);
	return Array.from(new Set(value.map((item) => assetId(item, label))));
}
function tags(value) {
	if (!Array.isArray(value)) throw new Error("tags must be a list");
	if (value.length > 20) throw new Error("tags is too large");
	return Array.from(new Set(value.map((item) => text$1(item, "tag", 30, true))));
}
function timestamp(value, label) {
	const result = text$1(value, label, 40, true);
	if (Number.isNaN(Date.parse(result))) throw new Error(`invalid ${label}`);
	return result;
}
function parseExperienceWorkspace(value, expectedId) {
	if (!ID$2.test(expectedId)) throw new Error("invalid project id");
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid experience workspace");
	const source = value;
	const projectId = text$1(source.projectId, "projectId", 36, true);
	if (projectId !== expectedId) throw new Error("invalid project id");
	const revision = Number(source.revision);
	if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("invalid revision");
	if (!Array.isArray(source.materials) || source.materials.length > 100) throw new Error("invalid materials");
	if (!Array.isArray(source.rules) || source.rules.length > 300) throw new Error("invalid rules");
	if (!Array.isArray(source.cases) || source.cases.length > 300) throw new Error("invalid cases");
	const materials = source.materials.map((value) => {
		const item = value;
		return {
			id: assetId(item.id, "material id"),
			title: text$1(item.title, "material title", 120, true),
			sourceType: enumValue$1(item.sourceType, SOURCES, "material source"),
			sourceLabel: text$1(item.sourceLabel ?? "", "material source label", 300),
			summary: text$1(item.summary ?? "", "material summary", 2e3),
			tags: tags(item.tags ?? []),
			status: enumValue$1(item.status, MATERIAL_STATUSES, "material status"),
			createdAt: timestamp(item.createdAt, "material createdAt"),
			updatedAt: timestamp(item.updatedAt, "material updatedAt")
		};
	});
	const rules = source.rules.map((value) => {
		const item = value;
		return {
			id: assetId(item.id, "rule id"),
			type: enumValue$1(item.type, RULE_TYPES, "rule type"),
			title: text$1(item.title, "rule title", 120, true),
			statement: text$1(item.statement, "rule statement", 3e3, true),
			sourceMaterialIds: ids(item.sourceMaterialIds ?? [], "source material id"),
			status: enumValue$1(item.status, RULE_STATUSES, "rule status"),
			expertNote: text$1(item.expertNote ?? "", "expert note", 2e3),
			createdAt: timestamp(item.createdAt, "rule createdAt"),
			updatedAt: timestamp(item.updatedAt, "rule updatedAt")
		};
	});
	const cases = source.cases.map((value) => {
		const item = value;
		return {
			id: assetId(item.id, "case id"),
			type: enumValue$1(item.type, CASE_TYPES, "case type"),
			title: text$1(item.title, "case title", 120, true),
			input: text$1(item.input, "case input", 4e3, true),
			expected: text$1(item.expected, "case expected", 4e3, true),
			sourceRuleIds: ids(item.sourceRuleIds ?? [], "source rule id"),
			status: enumValue$1(item.status, CASE_STATUSES, "case status"),
			expertVerdict: text$1(item.expertVerdict ?? "", "expert verdict", 2e3),
			createdAt: timestamp(item.createdAt, "case createdAt"),
			updatedAt: timestamp(item.updatedAt, "case updatedAt")
		};
	});
	const materialIds = new Set(materials.map((item) => item.id));
	const ruleIds = new Set(rules.map((item) => item.id));
	if (materialIds.size !== materials.length || ruleIds.size !== rules.length || new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("duplicate experience asset id");
	if (rules.some((item) => item.sourceMaterialIds.some((id) => !materialIds.has(id)))) throw new Error("rule references an unknown material");
	if (cases.some((item) => item.sourceRuleIds.some((id) => !ruleIds.has(id)))) throw new Error("case references an unknown rule");
	return {
		schemaVersion: 1,
		projectId,
		revision,
		materials,
		rules,
		cases,
		createdAt: timestamp(source.createdAt, "createdAt"),
		updatedAt: timestamp(source.updatedAt, "updatedAt")
	};
}
var ExperienceWorkspaceStore = class {
	root;
	constructor(root) {
		this.root = root;
	}
	directory(id) {
		if (!ID$2.test(id)) throw new Error("invalid project id");
		return join(this.root, id);
	}
	file(id) {
		return join(this.directory(id), "experience-workspace.json");
	}
	checkpointDirectory(id) {
		return join(this.directory(id), "experience-checkpoints");
	}
	async read(id) {
		try {
			return parseExperienceWorkspace(JSON.parse(await readFile(this.file(id), "utf8")), id);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			const now = (/* @__PURE__ */ new Date()).toISOString();
			return {
				schemaVersion: 1,
				projectId: id,
				revision: 0,
				materials: [],
				rules: [],
				cases: [],
				createdAt: now,
				updatedAt: now
			};
		}
	}
	async save(id, value, expectedRevision) {
		const current = await this.read(id);
		if (current.revision !== expectedRevision) throw new Error(`experience workspace changed; expected revision ${expectedRevision}, current ${current.revision}`);
		const parsed = parseExperienceWorkspace(value, id);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const next = parseExperienceWorkspace({
			...parsed,
			revision: current.revision + 1,
			createdAt: current.createdAt,
			updatedAt: now
		}, id);
		await mkdir(this.directory(id), { recursive: true });
		if (current.revision > 0) {
			await mkdir(this.checkpointDirectory(id), { recursive: true });
			await writeFile(join(this.checkpointDirectory(id), `revision-${String(current.revision).padStart(6, "0")}.json`), `${JSON.stringify(current, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx"
			}).catch((error) => {
				if (error.code !== "EEXIST") throw error;
			});
		}
		await this.atomicWrite(this.file(id), next);
		await this.pruneCheckpoints(id);
		return next;
	}
	async checkpoints(id) {
		let files;
		try {
			files = (await readdir(this.checkpointDirectory(id))).filter((name) => /^revision-\d{6}\.json$/u.test(name));
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
		return (await Promise.allSettled(files.map(async (name) => parseExperienceWorkspace(JSON.parse(await readFile(join(this.checkpointDirectory(id), name), "utf8")), id)))).filter((item) => item.status === "fulfilled").map(({ value }) => ({
			revision: value.revision,
			updatedAt: value.updatedAt,
			materials: value.materials.length,
			rules: value.rules.length,
			cases: value.cases.length
		})).sort((a, b) => b.revision - a.revision);
	}
	async restore(id, revision, expectedRevision) {
		if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("invalid checkpoint revision");
		const checkpoint = parseExperienceWorkspace(JSON.parse(await readFile(join(this.checkpointDirectory(id), `revision-${String(revision).padStart(6, "0")}.json`), "utf8")), id);
		return await this.save(id, checkpoint, expectedRevision);
	}
	async pruneCheckpoints(id, keep = 50) {
		let files;
		try {
			files = (await readdir(this.checkpointDirectory(id))).filter((name) => /^revision-\d{6}\.json$/u.test(name)).sort().reverse();
		} catch (error) {
			if (error.code === "ENOENT") return;
			throw error;
		}
		await Promise.all(files.slice(keep).map((name) => unlink(join(this.checkpointDirectory(id), name)).catch(() => void 0)));
	}
	async atomicWrite(file, value) {
		const temporary = `${file}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
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
async function body$4(req) {
	const declared = Number(req.headers["content-length"] ?? 0);
	if (Number.isFinite(declared) && declared > 2097152) throw new Error("request body is too large");
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		size += buffer.byteLength;
		if (size > 2097152) throw new Error("request body is too large");
		chunks.push(buffer);
	}
	if (size === 0) throw new Error("request body is required");
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function reply$5(res, status, value) {
	const payload = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload)
	});
	res.end(payload);
}
function replyMarkdown(res, value) {
	const payload = Buffer.from(value.content, "utf8");
	res.writeHead(200, {
		"content-type": "text/markdown; charset=utf-8",
		"content-length": payload.byteLength,
		"content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(`${value.name}.md`)}`,
		"x-content-type-options": "nosniff"
	});
	res.end(payload);
}
function registerProductionProjectRoutes(ctx, store = new ProductionProjectStore(), experienceStore = new ExperienceWorkspaceStore(store.root)) {
	return ctx.webServer.register({
		kind: "prefix",
		path: "/api/xyai/projects",
		handler: async (req, res) => {
			try {
				const suffix = new URL(req.url ?? "/", "http://local").pathname.slice(18).replace(/^\//u, "");
				const parts = suffix.split("/");
				if (req.method === "GET" && suffix === "") {
					reply$5(res, 200, await store.list());
					return;
				}
				if (parts.length >= 2 && parts[1] === "experience") {
					const id = decodeURIComponent(parts[0]);
					await store.get(id);
					if (req.method === "GET" && parts.length === 2) {
						reply$5(res, 200, await experienceStore.read(id));
						return;
					}
					if (req.method === "PUT" && parts.length === 2) {
						const input = await body$4(req);
						reply$5(res, 200, await experienceStore.save(id, input.workspace, Number(input.expectedRevision)));
						return;
					}
					if (req.method === "GET" && parts.length === 3 && parts[2] === "checkpoints") {
						reply$5(res, 200, await experienceStore.checkpoints(id));
						return;
					}
					if (req.method === "POST" && parts.length === 3 && parts[2] === "restore") {
						const input = await body$4(req);
						reply$5(res, 200, await experienceStore.restore(id, Number(input.revision), Number(input.expectedRevision)));
						return;
					}
				}
				if (req.method === "GET" && parts.length === 3 && parts[1] === "files") {
					replyMarkdown(res, await store.readArtifactFile(decodeURIComponent(parts[0]), decodeURIComponent(parts[2])));
					return;
				}
				if (req.method === "POST" && suffix === "") {
					reply$5(res, 201, await store.create(await body$4(req)));
					return;
				}
				if (req.method === "PATCH" && suffix !== "" && parts.length === 1) {
					reply$5(res, 200, await store.update(decodeURIComponent(suffix), await body$4(req)));
					return;
				}
				if (req.method === "POST" && parts.length === 2 && parts[1] === "artifacts") {
					reply$5(res, 201, await store.addArtifact(decodeURIComponent(parts[0]), await body$4(req)));
					return;
				}
				if (req.method === "POST" && parts.length === 2 && parts[1] === "review-report") {
					reply$5(res, 201, await store.writeArtifactFile(decodeURIComponent(parts[0]), await body$4(req)));
					return;
				}
				reply$5(res, 405, { error: "method-not-allowed" });
			} catch (error) {
				reply$5(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
}
//#endregion
//#region src/connectors.ts
const CONNECTORS = [
	{
		id: "ima",
		name: "ima 知识库",
		icon: "🐼",
		description: "读取用户授权的知识库与知识条目。",
		credentialRef: "XYAI_CONNECTOR_IMA",
		setupUrl: "https://ima.qq.com/agent-interface",
		fields: [{
			key: "clientId",
			label: "Client ID"
		}, {
			key: "apiKey",
			label: "API Key",
			secret: true
		}],
		version: "0.1.0",
		permissions: ["读取已授权知识库列表", "读取用户选择的知识条目"]
	},
	{
		id: "wechat",
		name: "微信（公众号/开放平台）",
		icon: "💬",
		description: "连接已认证公众号或开放平台应用；不使用个人号逆向协议。",
		credentialRef: "XYAI_CONNECTOR_WECHAT",
		setupUrl: "https://mp.weixin.qq.com/",
		fields: [{
			key: "appId",
			label: "AppID"
		}, {
			key: "appSecret",
			label: "AppSecret",
			secret: true
		}],
		limitation: "微信个人号没有官方通用消息 API，本连接器仅支持公众号/开放平台。",
		version: "0.1.0",
		permissions: ["验证公众号或开放平台应用身份", "按用户指令访问授权接口"]
	},
	{
		id: "wecom",
		name: "企业微信",
		icon: "🔷",
		description: "连接企业自建应用，后续可访问授权范围内的通讯录、消息与文档。",
		credentialRef: "XYAI_CONNECTOR_WECOM",
		setupUrl: "https://work.weixin.qq.com/wework_admin/frame#apps",
		fields: [{
			key: "corpId",
			label: "企业 ID（CorpID）"
		}, {
			key: "corpSecret",
			label: "应用 Secret",
			secret: true
		}],
		version: "0.1.0",
		permissions: ["验证企业自建应用", "访问管理员授权的企业资源"]
	},
	{
		id: "tencent-meeting",
		name: "腾讯会议",
		icon: "🎥",
		description: "使用 OAuth 用户凭证验证身份，并为会议工具调用做准备。",
		credentialRef: "XYAI_CONNECTOR_TENCENT_MEETING",
		setupUrl: "https://meeting.tencent.com/open-api.html",
		fields: [{
			key: "accessToken",
			label: "OAuth AccessToken",
			secret: true
		}, {
			key: "openId",
			label: "OpenId"
		}],
		version: "0.1.0",
		permissions: ["读取当前授权用户基本信息", "访问用户授权的会议资源"]
	},
	{
		id: "kdocs",
		name: "金山文档",
		icon: "📄",
		description: "验证金山文档 OAuth 令牌，访问授权用户的文档能力。",
		credentialRef: "XYAI_CONNECTOR_KDOCS",
		setupUrl: "https://developer.kdocs.cn/",
		fields: [{
			key: "accessToken",
			label: "OAuth Access Token",
			secret: true
		}],
		version: "0.1.0",
		permissions: ["读取授权用户基本信息", "访问用户明确授权的文档"]
	},
	{
		id: "tencent-docs",
		name: "腾讯文档",
		icon: "📘",
		description: "面向企业开放能力与网页工作流。",
		setupUrl: "https://docs.qq.com/",
		fields: [],
		limitation: "目前未发现面向普通个人帐号的公开通用 OAuth/API；需企业开放能力或官方合作授权后才能做真实读写连接。",
		version: "0.1.0-preview",
		permissions: []
	},
	{
		id: "miaoda",
		name: "秒哒应用搭建",
		icon: "🪄",
		description: "进入秒哒工作台创建、预览和发布应用。",
		setupUrl: "https://www.miaoda.cn/",
		fields: [],
		limitation: "秒哒公开文档当前提供产品工作流，未提供可供桌面第三方调用的通用帐号 API。",
		version: "0.1.0-preview",
		permissions: []
	},
	{
		id: "camscanner",
		name: "扫描全能王",
		icon: "📷",
		description: "文档扫描、增强与导出能力。",
		setupUrl: "https://dev.camscanner.com/?lang=zh-cn",
		fields: [],
		limitation: "公开方案是 Android/iOS 本地 API/SDK，要求移动端安装扫描全能王；暂无可直接验证的 Windows 服务端帐号连接。",
		version: "0.1.0-preview",
		permissions: []
	}
];
const get = (config, key) => {
	const value = config[key]?.trim();
	if (value === void 0 || value === "") throw new Error(`缺少 ${key}`);
	return value;
};
async function json(response) {
	return await response.json().catch(() => ({}));
}
function failure(platform, response, body) {
	const detail = body.errmsg ?? body.message ?? body.msg ?? body.error ?? `HTTP ${String(response.status)}`;
	throw new Error(`${platform} 验证失败：${String(detail)}`);
}
/** Validate credentials through one read-only official endpoint; never performs a write action. */
async function testConnector(id, config, fetchImpl = fetch) {
	const signal = AbortSignal.timeout(12e3);
	if (id === "ima") {
		const response = await fetchImpl("https://ima.qq.com/openapi/wiki/v1/get_addable_knowledge_base_list", {
			method: "POST",
			signal,
			headers: {
				"content-type": "application/json",
				"ima-openapi-clientid": get(config, "clientId"),
				"ima-openapi-apikey": get(config, "apiKey")
			},
			body: "{}"
		});
		const body = await json(response);
		if (!response.ok || typeof body.code === "number" && body.code !== 0) failure("ima 知识库", response, body);
		return {
			connected: true,
			message: "ima API 凭据有效，知识库接口已连通。"
		};
	}
	if (id === "wechat") {
		const response = await fetchImpl("https://api.weixin.qq.com/cgi-bin/stable_token", {
			method: "POST",
			signal,
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "client_credential",
				appid: get(config, "appId"),
				secret: get(config, "appSecret")
			})
		});
		const body = await json(response);
		if (!response.ok || typeof body.access_token !== "string") failure("微信公众平台", response, body);
		return {
			connected: true,
			message: "微信公众号/开放平台应用凭据有效。"
		};
	}
	if (id === "wecom") {
		const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
		url.searchParams.set("corpid", get(config, "corpId"));
		url.searchParams.set("corpsecret", get(config, "corpSecret"));
		const response = await fetchImpl(url, { signal });
		const body = await json(response);
		if (!response.ok || body.errcode !== 0 || typeof body.access_token !== "string") failure("企业微信", response, body);
		return {
			connected: true,
			message: "企业微信自建应用凭据有效。"
		};
	}
	if (id === "tencent-meeting") {
		const openId = get(config, "openId");
		const url = new URL("https://api.meeting.qq.com/v1/users/info/basic");
		url.searchParams.set("operator_id", openId);
		url.searchParams.set("operator_id_type", "2");
		const response = await fetchImpl(url, {
			signal,
			headers: {
				"content-type": "application/json",
				AccessToken: get(config, "accessToken"),
				OpenId: openId,
				"X-TC-Timestamp": String(Math.floor(Date.now() / 1e3)),
				"X-TC-Nonce": String(Math.floor(Math.random() * 1e9))
			}
		});
		const body = await json(response);
		if (!response.ok || typeof body.username !== "string") failure("腾讯会议", response, body);
		return {
			connected: true,
			message: `腾讯会议 OAuth 已连接：${body.username}`
		};
	}
	if (id === "kdocs") {
		const url = new URL("https://developer.kdocs.cn/api/v1/openapi/user/basic");
		url.searchParams.set("access_token", get(config, "accessToken"));
		const response = await fetchImpl(url, {
			signal,
			headers: { "content-type": "application/json" }
		});
		const body = await json(response);
		if (!response.ok || body.code !== 0) failure("金山文档", response, body);
		return {
			connected: true,
			message: "金山文档 OAuth 令牌有效。"
		};
	}
	const definition = CONNECTORS.find((item) => item.id === id);
	throw new Error(definition?.limitation ?? "该连接器暂不支持直接连接。");
}
/** Parse one encrypted-store payload without accepting surprising shapes. */
function parseConnectorCredential(value) {
	const parsed = JSON.parse(value);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("连接器凭据格式无效");
	const result = {};
	for (const [key, item] of Object.entries(parsed)) {
		if (typeof item !== "string" || item.trim() === "") throw new Error(`连接器凭据字段 ${key} 无效`);
		result[key] = item;
	}
	return result;
}
//#endregion
//#region src/connector-install-store.ts
/** Durable, desktop-owned lifecycle state for connector packages. */
const EMPTY = {
	schema: "xyai.connector-installations.v1",
	items: []
};
var ConnectorInstallStore = class {
	file;
	constructor(file = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "xyai", "connector-installations.json")) {
		this.file = file;
	}
	async list() {
		return (await this.read()).items;
	}
	async install(id, version, manifestDigest, manifest) {
		const document = await this.read();
		const current = document.items.find((item) => item.id === id);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const next = current === void 0 ? {
			id,
			version,
			enabled: true,
			installedAt: now,
			updatedAt: now,
			...manifestDigest === void 0 ? {} : { manifestDigest },
			...manifest === void 0 ? {} : { manifest }
		} : {
			...current,
			version,
			enabled: true,
			updatedAt: now,
			...manifestDigest === void 0 ? {} : { manifestDigest },
			...manifest === void 0 ? {} : { manifest }
		};
		await this.write({
			...document,
			items: [...document.items.filter((item) => item.id !== id), next]
		});
		return next;
	}
	async setEnabled(id, enabled) {
		const document = await this.read();
		const current = document.items.find((item) => item.id === id);
		if (current === void 0) throw new Error("请先安装连接器");
		const next = {
			...current,
			enabled,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		await this.write({
			...document,
			items: document.items.map((item) => item.id === id ? next : item)
		});
		return next;
	}
	async uninstall(id) {
		const document = await this.read();
		await this.write({
			...document,
			items: document.items.filter((item) => item.id !== id)
		});
	}
	async read() {
		try {
			const value = JSON.parse(await readFile(this.file, "utf8"));
			if (value.schema !== EMPTY.schema || !Array.isArray(value.items)) return {
				...EMPTY,
				items: []
			};
			return {
				schema: EMPTY.schema,
				items: value.items.filter(isInstallation)
			};
		} catch {
			return {
				...EMPTY,
				items: []
			};
		}
	}
	async write(document) {
		await mkdir(dirname(this.file), { recursive: true });
		const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
		try {
			await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
			await rename(temporary, this.file);
		} catch (error) {
			await unlink(temporary).catch(() => void 0);
			throw error;
		}
	}
};
function isInstallation(value) {
	if (typeof value !== "object" || value === null) return false;
	const item = value;
	return typeof item.id === "string" && typeof item.version === "string" && typeof item.enabled === "boolean" && typeof item.installedAt === "string" && typeof item.updatedAt === "string";
}
//#endregion
//#region src/connector-oauth.ts
/** OAuth 2.0 Authorization Code + PKCE flow for desktop connector packages. */
const text = (value, label) => {
	if (typeof value !== "string" || value.trim() === "") throw new Error(`缺少 ${label}`);
	return value.trim();
};
const base64url = (value) => value.toString("base64url");
var ConnectorOAuthCoordinator = class {
	fetchImpl;
	ttlMs;
	pending = /* @__PURE__ */ new Map();
	constructor(fetchImpl = fetch, ttlMs = 10 * 6e4) {
		this.fetchImpl = fetchImpl;
		this.ttlMs = ttlMs;
	}
	start(definition, input, callbackOrigin) {
		const oauth = requireOAuth(definition);
		const origin = safeLoopbackOrigin(callbackOrigin);
		const clientId = text(input.clientId, "Client ID");
		const clientSecret = typeof input.clientSecret === "string" && input.clientSecret.trim() !== "" ? input.clientSecret.trim() : void 0;
		const state = base64url(randomBytes(24));
		const codeVerifier = base64url(randomBytes(48));
		const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
		const redirectUri = `${origin}/api/xyai/connectors/oauth/callback`;
		const authorize = new URL(oauth.authorizeUrl);
		authorize.searchParams.set("response_type", "code");
		authorize.searchParams.set("client_id", clientId);
		authorize.searchParams.set("redirect_uri", redirectUri);
		authorize.searchParams.set("state", state);
		authorize.searchParams.set("code_challenge", codeChallenge);
		authorize.searchParams.set("code_challenge_method", "S256");
		if (oauth.scopes.length > 0) authorize.searchParams.set("scope", oauth.scopes.join(" "));
		for (const [key, value] of Object.entries(oauth.authorizeParams ?? {})) authorize.searchParams.set(key, value);
		const expiresAt = Date.now() + this.ttlMs;
		this.pending.set(state, {
			connectorId: definition.id,
			redirectUri,
			codeVerifier,
			clientId,
			...clientSecret === void 0 ? {} : { clientSecret },
			createdAt: Date.now()
		});
		this.prune();
		return {
			authorizeUrl: authorize.href,
			expiresAt
		};
	}
	async complete(definition, state, code) {
		const oauth = requireOAuth(definition);
		const pending = this.pending.get(state);
		this.pending.delete(state);
		if (pending === void 0 || pending.connectorId !== definition.id) throw new Error("OAuth 状态无效或已经使用，请重新连接");
		if (Date.now() - pending.createdAt > this.ttlMs) throw new Error("OAuth 授权已过期，请重新连接");
		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code: text(code, "authorization code"),
			redirect_uri: pending.redirectUri,
			client_id: pending.clientId,
			code_verifier: pending.codeVerifier
		});
		if (pending.clientSecret !== void 0) body.set("client_secret", pending.clientSecret);
		const response = await this.fetchImpl(oauth.tokenUrl, {
			method: "POST",
			signal: AbortSignal.timeout(15e3),
			headers: {
				accept: "application/json",
				"content-type": "application/x-www-form-urlencoded"
			},
			body
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(`OAuth 令牌交换失败：${String(payload.error_description ?? payload.error ?? `HTTP ${String(response.status)}`)}`);
		const credentials = {};
		for (const [target, source] of Object.entries(oauth.credentialMap)) credentials[target] = text(payload[source], source);
		return {
			connectorId: definition.id,
			credentials
		};
	}
	connectorForState(state) {
		return this.pending.get(state)?.connectorId;
	}
	prune() {
		const oldest = Date.now() - this.ttlMs;
		for (const [state, item] of this.pending) if (item.createdAt < oldest) this.pending.delete(state);
	}
};
function requireOAuth(definition) {
	if (definition.oauth === void 0) throw new Error("该连接器尚未开放浏览器授权，请使用当前凭据连接方式");
	return definition.oauth;
}
function safeLoopbackOrigin(value) {
	const url = new URL(value);
	if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new Error("OAuth 回调只能使用本机 loopback 地址");
	return url.origin;
}
//#endregion
//#region src/connector-manifest.ts
/** Declarative connector package contract. Third-party packages never inject arbitrary JS. */
const CONNECTOR_MANIFEST_SCHEMA = "xyai.connector.v1";
const XYAI_CONNECTOR_HOST_VERSION = "0.5.3";
const TOOL_CONTRIBUTIONS = {
	ima: [{
		name: "ima_list_knowledge_bases",
		description: "列出当前帐号有权添加的 ima 知识库。",
		operation: "listKnowledgeBases",
		risk: "read"
	}],
	wechat: [{
		name: "wechat_account_status",
		description: "验证微信公众号或开放平台应用身份和连接状态。",
		operation: "accountStatus",
		risk: "read"
	}],
	wecom: [{
		name: "wecom_list_departments",
		description: "读取企业微信应用授权范围内的部门列表。",
		operation: "listDepartments",
		risk: "sensitive"
	}],
	"tencent-meeting": [{
		name: "tencent_meeting_current_user",
		description: "读取腾讯会议当前授权用户基本信息。",
		operation: "currentUser",
		risk: "read"
	}],
	kdocs: [{
		name: "kdocs_current_user",
		description: "读取金山文档当前授权用户基本信息。",
		operation: "currentUser",
		risk: "read"
	}]
};
function manifestForConnector(definition) {
	return {
		schema: CONNECTOR_MANIFEST_SCHEMA,
		id: definition.id,
		name: definition.name,
		version: definition.version,
		publisher: "XYAI Studio",
		description: definition.description,
		minHostVersion: XYAI_CONNECTOR_HOST_VERSION,
		permissions: definition.permissions,
		runtime: { type: "builtin" },
		contributes: {
			tools: TOOL_CONTRIBUTIONS[definition.id] ?? [],
			skills: [],
			mcpServers: []
		}
	};
}
function parseConnectorManifest(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("连接器 Manifest 必须是 JSON 对象");
	const item = value;
	if (item.schema !== "xyai.connector.v1") throw new Error("不支持的连接器 Manifest schema");
	const id = required$1(item.id, "id");
	if (!/^[a-z0-9][a-z0-9-]{1,62}$/u.test(id)) throw new Error("连接器 id 格式无效");
	const version = semver(required$1(item.version, "version"), "version");
	const minHostVersion = semver(required$1(item.minHostVersion, "minHostVersion"), "minHostVersion");
	if (!Array.isArray(item.permissions) || !item.permissions.every((entry) => typeof entry === "string" && entry.trim() !== "")) throw new Error("permissions 格式无效");
	if (typeof item.runtime !== "object" || item.runtime === null || item.runtime.type !== "builtin" && item.runtime.type !== "mcp") throw new Error("runtime 格式无效");
	if (item.runtime.type === "mcp" && (typeof item.runtime.entry !== "string" || item.runtime.entry.trim() === "")) throw new Error("MCP 连接器缺少 runtime.entry");
	if (typeof item.contributes !== "object" || item.contributes === null || !Array.isArray(item.contributes.tools) || !Array.isArray(item.contributes.skills) || !Array.isArray(item.contributes.mcpServers)) throw new Error("contributes 格式无效");
	for (const tool of item.contributes.tools) if (typeof tool !== "object" || tool === null || !/^[a-z][a-z0-9_]{1,63}$/u.test(required$1(tool.name, "tool.name")) || ![
		"read",
		"write",
		"sensitive"
	].includes(tool.risk)) throw new Error("工具贡献格式无效");
	for (const skill of item.contributes.skills) {
		if (typeof skill !== "object" || skill === null || !/^[a-z][a-z0-9-]{1,63}$/u.test(required$1(skill.name, "skill.name")) || typeof skill.description !== "string" || skill.description.trim() === "" || typeof skill.content !== "string" || skill.content.trim() === "") throw new Error("Skill 贡献格式无效");
		if (skill.whenToUse !== void 0 && typeof skill.whenToUse !== "string") throw new Error("Skill whenToUse 格式无效");
		if (skill.invocation !== void 0 && (typeof skill.invocation !== "object" || skill.invocation === null || typeof skill.invocation.modelInvocable !== "boolean" || typeof skill.invocation.userInvocable !== "boolean")) throw new Error("Skill invocation 格式无效");
	}
	for (const server of item.contributes.mcpServers) validateMcpContribution(server);
	return {
		...item,
		id,
		version,
		minHostVersion,
		name: required$1(item.name, "name"),
		publisher: required$1(item.publisher, "publisher"),
		description: required$1(item.description, "description")
	};
}
function validateMcpContribution(server) {
	if (typeof server !== "object" || server === null) throw new Error("MCP 贡献格式无效");
	const typed = server;
	if (typed.transport !== "stdio" && typed.transport !== "streamable-http") throw new Error("MCP transport 只支持 stdio 或 streamable-http");
	if (typeof typed.serverName !== "string" || !/^[A-Za-z0-9_-]{1,32}$/u.test(typed.serverName)) throw new Error("MCP serverName 格式无效");
	if (typeof typed.toolCallTimeoutMs !== "number" || !Number.isInteger(typed.toolCallTimeoutMs) || typed.toolCallTimeoutMs < 1e3 || typed.toolCallTimeoutMs > 12e4) throw new Error("MCP toolCallTimeoutMs 必须在 1000 到 120000 毫秒之间");
	if (typed.transport === "stdio") {
		const stdio = typed;
		if (typeof stdio.command !== "string" || stdio.command.trim() === "") throw new Error("MCP stdio command 格式无效");
		if (!Array.isArray(stdio.args) || !stdio.args.every((arg) => typeof arg === "string")) throw new Error("MCP stdio args 必须是字符串数组");
		if (stdio.cwd !== void 0 && typeof stdio.cwd !== "string") throw new Error("MCP stdio cwd 格式无效");
	} else {
		const http = typed;
		if (typeof http.url !== "string" || !/^https?:\/\/[^\s]+$/u.test(http.url)) throw new Error("MCP streamable-http url 格式无效");
		if (http.headers !== void 0) validateStringRecord(http.headers, "MCP headers");
	}
	const env = typed.env;
	if (env !== void 0) validateStringRecord(env, "MCP env");
}
function validateStringRecord(value, label) {
	if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.entries(value).every(([key, item]) => key.trim() !== "" && typeof item === "string")) throw new Error(`${label} 格式无效`);
}
function assertConnectorCompatible(manifest, hostVersion = XYAI_CONNECTOR_HOST_VERSION) {
	if (compareVersions(hostVersion, manifest.minHostVersion) < 0) throw new Error(`连接器需要 XYAI Studio ${manifest.minHostVersion} 或更高版本`);
}
function connectorManifestDigest(manifest) {
	const unsigned = {
		...manifest,
		signature: void 0
	};
	return createHash("sha256").update(stable(unsigned)).digest("hex");
}
function required$1(value, label) {
	if (typeof value !== "string" || value.trim() === "") throw new Error(`连接器 Manifest 缺少 ${label}`);
	return value.trim();
}
function semver(value, label) {
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)) throw new Error(`连接器 Manifest ${label} 不是有效版本号`);
	return value;
}
function compareVersions(left, right) {
	const a = left.split("-", 1)[0].split(".").map(Number);
	const b = right.split("-", 1)[0].split(".").map(Number);
	for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
	return 0;
}
function stable(value) {
	if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
	if (typeof value === "object" && value !== null) return `{${Object.entries(value).filter(([, item]) => item !== void 0).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
	return JSON.stringify(value);
}
//#endregion
//#region src/connector-routes.ts
async function readJson(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(Buffer.from(chunk));
	const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("请求必须是 JSON 对象");
	return value;
}
function reply$4(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
		"cache-control": "no-store"
	});
	res.end(payload);
}
function replyHtml(res, status, title, message) {
	const escape = (value) => value.replace(/[&<>"']/gu, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[character] ?? character);
	const payload = `<!doctype html><meta charset="utf-8"><title>${escape(title)}</title><style>body{font:15px system-ui;margin:48px;line-height:1.7;color:#202124}main{max-width:620px;margin:auto;padding:28px;border:1px solid #ddd;border-radius:16px}h1{font-size:22px}</style><main><h1>${escape(title)}</h1><p>${escape(message)}</p><p>现在可以关闭此页面并返回 XYAI Studio。</p></main>`;
	res.writeHead(status, {
		"content-type": "text/html; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
		"cache-control": "no-store"
	});
	res.end(payload);
}
function definition(id) {
	const item = CONNECTORS.find((candidate) => candidate.id === id);
	if (item === void 0) throw new Error("未知连接器");
	return item;
}
function sanitize(input, item) {
	const allowed = new Set(item.fields.map((field) => field.key));
	const output = {};
	for (const [key, value] of Object.entries(input)) {
		if (!allowed.has(key) || typeof value !== "string") continue;
		const normalized = value.trim();
		if (normalized !== "") output[key] = normalized;
	}
	for (const field of item.fields) if (output[field.key] === void 0) throw new Error(`请填写${field.label}`);
	return output;
}
async function view(ctx, item, installation) {
	const lifecycle = {
		installed: installation !== void 0,
		enabled: installation?.enabled ?? false
	};
	if (item.credentialRef === void 0) return {
		...item,
		...lifecycle,
		state: "unsupported",
		message: item.limitation ?? "暂不支持直接连接。"
	};
	if (installation === void 0) return {
		...item,
		...lifecycle,
		state: "setup-required",
		message: "可一键安装；安装后再完成帐号授权。"
	};
	if (!installation.enabled) return {
		...item,
		...lifecycle,
		state: "setup-required",
		message: "连接器已停用，不会向智能体提供任何能力。"
	};
	const resolved = await ctx.credentials.resolve(credentialRef(item.credentialRef));
	if (resolved === void 0) return {
		...item,
		...lifecycle,
		state: "setup-required",
		message: "已安装，等待帐号授权；真实连通后才会高亮。"
	};
	try {
		const result = await testConnector(item.id, parseConnectorCredential(resolved.value));
		return {
			...item,
			...lifecycle,
			state: result.connected ? "connected" : "setup-required",
			message: result.message
		};
	} catch (cause) {
		return {
			...item,
			...lifecycle,
			state: "setup-required",
			message: cause instanceof Error ? cause.message : String(cause)
		};
	}
}
function registerConnectorRoutes(ctx, installs = new ConnectorInstallStore(), oauth = new ConnectorOAuthCoordinator(), onChanged = async () => {}) {
	return ctx.webServer.register({
		kind: "prefix",
		path: "/api/xyai/connectors",
		handler: async (req, res) => {
			try {
				const url = new URL(req.url ?? "/", "http://127.0.0.1");
				const suffix = url.pathname.slice(20).replace(/^\//u, "");
				if (req.method === "GET" && suffix === "") {
					const installed = new Map((await installs.list()).map((item) => [item.id, item]));
					reply$4(res, 200, await Promise.all(CONNECTORS.map(async (item) => await view(ctx, item, installed.get(item.id)))));
					return;
				}
				if (req.method === "GET" && suffix === "oauth/callback") {
					const state = url.searchParams.get("state") ?? "";
					const code = url.searchParams.get("code") ?? "";
					const id = oauth.connectorForState(state);
					if (id === void 0) throw new Error("OAuth 状态无效或已经过期");
					const item = definition(id);
					const completed = await oauth.complete(item, state, code);
					if (item.credentialRef === void 0) throw new Error("连接器没有凭据存储配置");
					await ctx.credentials.set(credentialRef(item.credentialRef), JSON.stringify(completed.credentials));
					await installs.install(item.id, item.version, connectorManifestDigest(manifestForConnector(item)), manifestForConnector(item));
					await onChanged();
					replyHtml(res, 200, "连接成功", `${item.name} 已完成浏览器授权并安全保存到本机凭据服务。`);
					return;
				}
				const [rawId, action] = suffix.split("/");
				const item = definition(decodeURIComponent(rawId ?? ""));
				if (req.method === "POST" && action === "oauth-start") {
					const input = await readJson(req);
					reply$4(res, 200, oauth.start(item, input, String(input.callbackOrigin ?? "")));
					return;
				}
				if (req.method === "POST" && action === "install") {
					if (item.credentialRef === void 0) throw new Error(item.limitation ?? "该连接器暂不可安装。");
					const manifest = manifestForConnector(item);
					assertConnectorCompatible(manifest);
					reply$4(res, 200, await installs.install(item.id, item.version, connectorManifestDigest(manifest), manifest));
					await onChanged();
					return;
				}
				if (req.method === "POST" && (action === "enable" || action === "disable")) {
					const changed = await installs.setEnabled(item.id, action === "enable");
					await onChanged();
					reply$4(res, 200, changed);
					return;
				}
				if (req.method === "DELETE" && action === "install") {
					await installs.uninstall(item.id);
					if (item.credentialRef !== void 0) await ctx.credentials.unset(credentialRef(item.credentialRef));
					await onChanged();
					reply$4(res, 200, {
						uninstalled: true,
						id: item.id
					});
					return;
				}
				if (item.credentialRef === void 0) throw new Error(item.limitation ?? "该连接器暂不支持直接连接。");
				const ref = credentialRef(item.credentialRef);
				if (req.method === "POST" && action === "connect") {
					const config = sanitize(await readJson(req), item);
					const result = await testConnector(item.id, config);
					if (!result.connected) throw new Error(result.message);
					const manifest = manifestForConnector(item);
					await installs.install(item.id, item.version, connectorManifestDigest(manifest), manifest);
					await ctx.credentials.set(ref, JSON.stringify(config));
					await onChanged();
					reply$4(res, 200, {
						...result,
						id: item.id
					});
					return;
				}
				if (req.method === "POST" && action === "test") {
					const stored = await ctx.credentials.resolve(ref);
					if (stored === void 0) throw new Error("尚未配置连接器");
					reply$4(res, 200, await testConnector(item.id, parseConnectorCredential(stored.value)));
					return;
				}
				if (req.method === "DELETE" && action === void 0) {
					await ctx.credentials.unset(ref);
					await onChanged();
					reply$4(res, 200, {
						disconnected: true,
						id: item.id
					});
					return;
				}
				reply$4(res, 405, { error: "method-not-allowed" });
			} catch (cause) {
				reply$4(res, 400, { error: cause instanceof Error ? cause.message : String(cause) });
			}
		}
	});
}
//#endregion
//#region src/knowledge-bases.ts
/** Durable XYAI knowledge-base catalog. Sources remain in place; XYAI stores references, not copies. */
var KnowledgeBaseStore = class {
	file;
	constructor(file = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "xyai", "knowledge-bases.json")) {
		this.file = file;
	}
	async list() {
		return (await this.read()).items.map(normalize).sort((a, b) => b.updatedAt - a.updatedAt);
	}
	async get(id) {
		const item = (await this.list()).find((entry) => entry.id === id);
		if (item === void 0) throw new Error("知识库不存在");
		return item;
	}
	async create(name) {
		const clean = name.trim();
		if (clean.length < 2 || clean.length > 80) throw new Error("知识库名称需为 2–80 个字符");
		const document = await this.read();
		const now = Date.now();
		const item = {
			id: randomUUID(),
			name: clean,
			sources: [],
			access: {
				mode: "private",
				workspaceIds: []
			},
			createdAt: now,
			updatedAt: now
		};
		document.items.push(item);
		await this.write(document);
		return item;
	}
	async setAccess(id, input) {
		const document = await this.read();
		const item = document.items.find((entry) => entry.id === id);
		if (item === void 0) throw new Error("知识库不存在");
		if (input.mode !== "private" && input.mode !== "workspace") throw new Error("不支持的知识库权限模式");
		const workspaceIds = Array.isArray(input.workspaceIds) ? [...new Set(input.workspaceIds.filter((value) => typeof value === "string" && value.trim() !== "").map((value) => value.trim()))] : [];
		item.access = {
			mode: input.mode,
			workspaceIds: input.mode === "workspace" ? workspaceIds : []
		};
		item.updatedAt = Date.now();
		await this.write(document);
		return normalize(item);
	}
	async addSource(id, input) {
		const document = await this.read();
		const item = document.items.find((entry) => entry.id === id);
		if (item === void 0) throw new Error("知识库不存在");
		const now = Date.now();
		let source;
		if (input.type === "local-folder") {
			if (typeof input.path !== "string" || !isAbsolute(input.path)) throw new Error("请选择有效的本机绝对文件夹");
			const resolved = await realpath(input.path);
			if (!(await stat(resolved)).isDirectory()) throw new Error("本地知识源必须是文件夹");
			source = {
				id: randomUUID(),
				type: "local-folder",
				path: resolved,
				addedAt: now
			};
		} else if (input.type === "cloud-drive") {
			const provider = typeof input.provider === "string" ? input.provider.trim() : typeof input.connectorId === "string" ? input.connectorId.trim() : "";
			if (provider !== "baidu-netdisk" && provider !== "360-yunpan") throw new Error("请选择已支持的云盘");
			const rootPath = typeof input.rootPath === "string" && input.rootPath.trim() !== "" ? input.rootPath.trim() : "/";
			if (!rootPath.startsWith("/")) throw new Error("云盘目录必须以 / 开头");
			source = {
				id: randomUUID(),
				type: "cloud-drive",
				provider,
				rootPath,
				name: typeof input.name === "string" && input.name.trim() !== "" ? input.name.trim() : provider,
				addedAt: now
			};
		} else if (input.type === "ima") {
			if (typeof input.imaKnowledgeBaseId !== "string" || input.imaKnowledgeBaseId.trim() === "") throw new Error("请选择要挂接的 ima 知识库");
			const mode = input.mode === void 0 ? "both" : input.mode;
			if (mode !== "realtime" && mode !== "cached" && mode !== "both") throw new Error("不支持的 ima 源模式");
			source = {
				id: randomUUID(),
				type: "ima",
				imaKnowledgeBaseId: input.imaKnowledgeBaseId.trim(),
				name: typeof input.name === "string" && input.name.trim() !== "" ? input.name.trim() : "ima 知识库",
				mode,
				addedAt: now
			};
		} else throw new Error("不支持的知识源类型");
		item.sources = [...item.sources.filter((existing) => existing.type !== source.type || (source.type === "local-folder" ? existing.type !== "local-folder" || existing.path !== source.path : source.type === "cloud-drive" ? existing.type !== "cloud-drive" || (existing.provider ?? existing.connectorId) !== source.provider || (existing.rootPath ?? "/") !== source.rootPath : existing.type !== "ima" || existing.imaKnowledgeBaseId !== source.imaKnowledgeBaseId)), source];
		item.updatedAt = now;
		await this.write(document);
		return item;
	}
	/** 调整 ima 源的取用模式(实时/缓存/both);其它类型源不支持。 */
	async updateSourceMode(id, sourceId, mode) {
		const document = await this.read();
		const item = document.items.find((entry) => entry.id === id);
		if (item === void 0) throw new Error("知识库不存在");
		const source = item.sources.find((entry) => entry.id === sourceId);
		if (source === void 0 || source.type !== "ima") throw new Error("只有 ima 源支持调整取用模式");
		if (mode !== "realtime" && mode !== "cached" && mode !== "both") throw new Error("不支持的 ima 源模式");
		source.mode = mode;
		item.updatedAt = Date.now();
		await this.write(document);
		return item;
	}
	async read() {
		try {
			const value = JSON.parse(await readFile(this.file, "utf8"));
			return value.schema === "xyai.knowledge-bases.v1" && Array.isArray(value.items) ? {
				...value,
				items: value.items.map(normalize)
			} : {
				schema: "xyai.knowledge-bases.v1",
				items: []
			};
		} catch {
			return {
				schema: "xyai.knowledge-bases.v1",
				items: []
			};
		}
	}
	async write(document) {
		await mkdir(dirname(this.file), { recursive: true });
		const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
		await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
		await rename(temporary, this.file);
	}
};
function normalize(value) {
	return {
		...value,
		access: value.access?.mode === "workspace" ? {
			mode: "workspace",
			workspaceIds: Array.isArray(value.access.workspaceIds) ? value.access.workspaceIds : []
		} : {
			mode: "private",
			workspaceIds: []
		}
	};
}
//#endregion
//#region src/knowledge-index.ts
/** Local-first parsing, incremental indexing, permission filtering and cited retrieval. */
const TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
	".txt",
	".md",
	".markdown",
	".json",
	".jsonl",
	".csv",
	".tsv",
	".html",
	".htm",
	".xml",
	".yaml",
	".yml",
	".js",
	".jsx",
	".ts",
	".tsx",
	".py",
	".java",
	".c",
	".cc",
	".cpp",
	".h",
	".hpp",
	".cs",
	".go",
	".rs",
	".sql",
	".toml",
	".ini",
	".log"
]);
const DOCUMENT_EXTENSIONS = /* @__PURE__ */ new Set([
	".pdf",
	".docx",
	".xlsx"
]);
const EXCLUDED_DIRECTORIES = /* @__PURE__ */ new Set([
	".git",
	"node_modules",
	".next",
	"dist",
	"build",
	"coverage",
	".cache",
	".venv",
	"venv"
]);
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_CHARS = 2e6;
const CHUNK_SIZE = 1600;
const CHUNK_OVERLAP = 240;
var KnowledgeIndexService = class {
	root;
	deep;
	/** deepParser 存在时,解析管线对新文件与历史未深化文件自动执行 AI 深度解析;失败静默回退基础蒸馏并计入 deepFailed。 */
	constructor(root = join(process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? "", ".dsh"), "xyai", "knowledge-indexes"), deep) {
		this.root = root;
		this.deep = deep;
	}
	/** onProgress:每解析完一个文件回调一次,供后台任务展示进度;total 为已枚举源的累计可解析文件数。 */
	async index(base, onProgress, shouldCancel) {
		throwIfKnowledgeIndexCancelled(shouldCancel);
		const current = await this.read(base.id);
		const existing = new Map(current.documents.map((item) => [`${item.sourceId}:${item.path}`, item]));
		const next = [];
		const report = {
			scanned: 0,
			added: 0,
			updated: 0,
			unchanged: 0,
			removed: 0,
			deepParsed: 0,
			deepFailed: 0,
			failed: [],
			revision: current.revision + 1
		};
		let enumeratedTotal = 0;
		for (const source of base.sources) {
			throwIfKnowledgeIndexCancelled(shouldCancel);
			if (source.type !== "local-folder") continue;
			let root;
			let paths;
			try {
				root = await realpath(source.path);
				paths = await walk(root);
			} catch (error) {
				report.failed.push({
					path: source.path,
					error: error instanceof Error ? error.message : String(error)
				});
				for (const [key, document] of existing) if (document.sourceId === source.id) {
					next.push(document);
					existing.delete(key);
				}
				continue;
			}
			throwIfKnowledgeIndexCancelled(shouldCancel);
			enumeratedTotal += paths.length;
			for (const path of paths) {
				throwIfKnowledgeIndexCancelled(shouldCancel);
				report.scanned += 1;
				onProgress?.({
					scanned: report.scanned,
					total: enumeratedTotal,
					currentFile: path
				});
				try {
					const info = await stat(path);
					const key = `${source.id}:${path}`;
					const previous = existing.get(key);
					if (previous !== void 0 && previous.size === info.size && previous.mtimeMs === info.mtimeMs) {
						const parser = this.deep?.deepParser;
						if (!(parser !== void 0 && (previous.aiInsight === void 0 || previous.aiInsight.tier !== "local-model"))) {
							next.push(previous);
							existing.delete(key);
							report.unchanged += 1;
							continue;
						}
						let insight;
						try {
							const text = await extractKnowledgeText(path);
							if (createHash("sha256").update(text).digest("hex") === previous.fingerprint) try {
								insight = await parser.parse({
									title: previous.title,
									text
								});
							} catch {
								insight = void 0;
							}
						} catch {
							insight = void 0;
						}
						if (insight !== void 0) {
							next.push({
								...previous,
								aiInsight: insight
							});
							existing.delete(key);
							report.updated += 1;
							report.deepParsed += 1;
							continue;
						}
						report.deepFailed += 1;
						next.push(previous);
						existing.delete(key);
						report.unchanged += 1;
						continue;
					}
					const text = await extractKnowledgeText(path);
					const fingerprint = createHash("sha256").update(text).digest("hex");
					if (previous !== void 0 && previous.fingerprint === fingerprint) {
						if (this.deep?.deepParser !== void 0 && (previous.aiInsight === void 0 || previous.aiInsight.tier !== "local-model")) {
							let insight;
							try {
								insight = await this.deep.deepParser.parse({
									title: previous.title,
									text
								});
							} catch {
								insight = void 0;
							}
							if (insight !== void 0) {
								next.push({
									...previous,
									size: info.size,
									mtimeMs: info.mtimeMs,
									aiInsight: insight
								});
								existing.delete(key);
								report.updated += 1;
								report.deepParsed += 1;
								onProgress?.({
									scanned: report.scanned,
									total: enumeratedTotal,
									currentFile: path
								});
								continue;
							}
							report.deepFailed += 1;
						}
						next.push({
							...previous,
							size: info.size,
							mtimeMs: info.mtimeMs
						});
						existing.delete(key);
						report.unchanged += 1;
						continue;
					}
					let aiInsight;
					if (this.deep?.deepParser !== void 0) {
						try {
							aiInsight = await this.deep.deepParser.parse({
								title: relative(root, path),
								text
							});
						} catch {
							aiInsight = void 0;
						}
						if (aiInsight === void 0) report.deepFailed += 1;
						else report.deepParsed += 1;
					}
					const chunks = chunkText(text);
					const document = {
						id: previous?.id ?? randomUUID(),
						sourceId: source.id,
						path,
						relativePath: relative(root, path),
						title: relative(root, path),
						extension: extname(path).toLowerCase(),
						size: info.size,
						mtimeMs: info.mtimeMs,
						fingerprint,
						indexedAt: Date.now(),
						chunks,
						memory: distillKnowledgeMemory(text, fingerprint),
						...aiInsight === void 0 ? {} : { aiInsight }
					};
					next.push(document);
					existing.delete(key);
					if (previous === void 0) report.added += 1;
					else report.updated += 1;
				} catch (error) {
					if (isKnowledgeIndexCancelled(error)) throw error;
					report.failed.push({
						path,
						error: error instanceof Error ? error.message : String(error)
					});
					const previous = existing.get(`${source.id}:${path}`);
					if (previous !== void 0) {
						next.push(previous);
						existing.delete(`${source.id}:${path}`);
					}
				}
			}
		}
		throwIfKnowledgeIndexCancelled(shouldCancel);
		report.removed = existing.size;
		await this.write({
			schema: "xyai.knowledge-index.v1",
			knowledgeBaseId: base.id,
			revision: report.revision,
			updatedAt: Date.now(),
			documents: next,
			failures: report.failed
		});
		return report;
	}
	/**
	* 拉取型云端源(ima)入索引:条目以伪路径 `ima://{knowledgeBaseId}/{mediaId}` 参与
	* 与本地文件完全一致的指纹增量/淘汰/蒸馏/深度解析管线;引用可溯源到 ima 来源。
	*/
	async indexExternalSource(base, sourceId, prefix, items, onProgress, shouldCancel) {
		throwIfKnowledgeIndexCancelled(shouldCancel);
		const current = await this.read(base.id);
		const existing = new Map(current.documents.filter((item) => item.sourceId === sourceId).map((item) => [`${item.sourceId}:${item.path}`, item]));
		const next = current.documents.filter((item) => item.sourceId !== sourceId);
		const report = {
			scanned: 0,
			added: 0,
			updated: 0,
			unchanged: 0,
			removed: 0,
			deepParsed: 0,
			deepFailed: 0,
			failed: [],
			revision: current.revision + 1
		};
		for (const item of items) {
			throwIfKnowledgeIndexCancelled(shouldCancel);
			report.scanned += 1;
			const path = `${prefix}/${item.id}`;
			onProgress?.({
				scanned: report.scanned,
				total: items.length,
				currentFile: item.title || path
			});
			try {
				if (item.text.trim() === "") throw new Error("条目内容为空");
				const key = `${sourceId}:${path}`;
				const previous = existing.get(key);
				const fingerprint = createHash("sha256").update(item.text).digest("hex");
				if (previous !== void 0 && previous.fingerprint === fingerprint) {
					const parser = this.deep?.deepParser;
					const needsDeep = parser !== void 0 && (previous.aiInsight === void 0 || previous.aiInsight.tier !== "local-model");
					let insight;
					if (needsDeep && parser !== void 0) try {
						insight = await parser.parse({
							title: previous.title,
							text: item.text
						});
					} catch {
						insight = void 0;
					}
					if (insight !== void 0) {
						next.push({
							...previous,
							aiInsight: insight
						});
						existing.delete(key);
						report.updated += 1;
						report.deepParsed += 1;
						continue;
					}
					if (needsDeep) report.deepFailed += 1;
					next.push(previous);
					existing.delete(key);
					report.unchanged += 1;
					continue;
				}
				let aiInsight;
				if (this.deep?.deepParser !== void 0) try {
					aiInsight = await this.deep.deepParser.parse({
						title: item.title,
						text: item.text
					});
				} catch {
					aiInsight = void 0;
				}
				if (aiInsight === void 0) report.deepFailed += 1;
				else report.deepParsed += 1;
				const chunks = chunkText(item.text);
				const document = {
					id: previous?.id ?? randomUUID(),
					sourceId,
					path,
					relativePath: item.title || path,
					title: item.title || path,
					extension: ".txt",
					size: item.text.length,
					mtimeMs: 0,
					fingerprint,
					indexedAt: Date.now(),
					chunks,
					memory: distillKnowledgeMemory(item.text, fingerprint),
					...aiInsight === void 0 ? {} : { aiInsight }
				};
				next.push(document);
				existing.delete(key);
				if (previous === void 0) report.added += 1;
				else report.updated += 1;
			} catch (error) {
				if (isKnowledgeIndexCancelled(error)) throw error;
				report.failed.push({
					path: item.title || path,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}
		throwIfKnowledgeIndexCancelled(shouldCancel);
		report.removed = existing.size;
		await this.write({
			schema: "xyai.knowledge-index.v1",
			knowledgeBaseId: base.id,
			revision: report.revision,
			updatedAt: Date.now(),
			documents: next,
			failures: report.failed
		});
		return report;
	}
	async search(base, request) {
		assertKnowledgeAccess(base, request.requester);
		const terms = tokenize(request.query);
		if (terms.length === 0) throw new Error("请输入有效检索词");
		const index = await this.read(base.id);
		const results = [];
		for (const document of index.documents) {
			const memoryText = [...new Set([document.memory.summary, ...document.memory.facts].filter(Boolean))].join("\n");
			const memoryScore = scoreText(memoryText, terms);
			if (memoryScore > 0) results.push({
				knowledgeBaseId: base.id,
				documentId: document.id,
				chunkId: `${document.id}:memory`,
				title: `${document.title} · 自动蒸馏记忆`,
				path: document.path,
				relativePath: document.relativePath,
				excerpt: highlightExcerpt(memoryText, terms),
				lineStart: 1,
				lineEnd: Math.max(1, memoryText.split("\n").length),
				score: Number((memoryScore + 2).toFixed(3))
			});
			for (let chunkIndex = 0; chunkIndex < document.chunks.length; chunkIndex += 1) {
				const chunk = document.chunks[chunkIndex];
				const lower = chunk.toLowerCase();
				let score = 0;
				for (const term of terms) {
					const matches = lower.split(term).length - 1;
					if (matches > 0) score += 1 + Math.log2(matches + 1);
				}
				if (score <= 0) continue;
				const excerpt = highlightExcerpt(chunk, terms);
				const before = chunk.slice(0, Math.max(0, chunk.indexOf(excerpt)));
				const lineStart = 1 + (document.chunks.slice(0, chunkIndex).map((value) => value.slice(0, CHUNK_SIZE - CHUNK_OVERLAP)).join("").match(/\n/gu)?.length ?? 0) + (before.match(/\n/gu)?.length ?? 0);
				results.push({
					knowledgeBaseId: base.id,
					documentId: document.id,
					chunkId: `${document.id}:${String(chunkIndex)}`,
					title: document.title,
					path: document.path,
					relativePath: document.relativePath,
					excerpt,
					lineStart,
					lineEnd: lineStart + (excerpt.match(/\n/gu)?.length ?? 0),
					score: Number(score.toFixed(3))
				});
			}
		}
		return results.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath)).slice(0, Math.min(20, Math.max(1, request.limit ?? 8)));
	}
	async exportCorpus(base, requester) {
		assertKnowledgeAccess(base, requester);
		return (await this.read(base.id)).documents.flatMap((document) => [{
			id: `${document.id}:memory`,
			text: [document.memory.summary, ...document.memory.facts].join("\n"),
			source: {
				knowledgeBaseId: base.id,
				documentId: document.id,
				chunkId: `${document.id}:memory`,
				title: `${document.title} · 自动蒸馏记忆`,
				path: document.path,
				relativePath: document.relativePath
			}
		}, ...document.chunks.map((text, chunkIndex) => ({
			id: `${document.id}:${String(chunkIndex)}`,
			text,
			source: {
				knowledgeBaseId: base.id,
				documentId: document.id,
				chunkId: `${document.id}:${String(chunkIndex)}`,
				title: document.title,
				path: document.path,
				relativePath: document.relativePath
			}
		}))]);
	}
	async status(id) {
		const index = await this.read(id);
		return {
			revision: index.revision,
			updatedAt: index.updatedAt,
			documents: index.documents.length,
			chunks: index.documents.reduce((sum, item) => sum + item.chunks.length, 0),
			memories: index.documents.filter((item) => item.memory.summary !== "" || item.memory.facts.length > 0).length,
			aiParsed: index.documents.filter((item) => item.aiInsight?.tier === "local-model").length,
			failed: index.failures.length
		};
	}
	async files(id) {
		const index = await this.read(id);
		return [...index.documents.map((document) => ({
			documentId: document.id,
			sourceId: document.sourceId,
			path: document.path,
			relativePath: document.relativePath,
			title: document.title,
			extension: document.extension,
			size: document.size,
			status: "distilled",
			chunks: document.chunks.length,
			memorySummary: document.memory.summary,
			memoryFacts: document.memory.facts.length,
			indexedAt: document.indexedAt,
			...document.aiInsight === void 0 ? {} : {
				aiTier: document.aiInsight.tier,
				aiModel: document.aiInsight.model,
				aiSummary: document.aiInsight.summary
			}
		})), ...index.failures.map((failure) => ({
			path: failure.path,
			relativePath: failure.path,
			title: failure.path.split(/[\\/]/u).at(-1) ?? failure.path,
			extension: extname(failure.path).toLowerCase(),
			size: 0,
			status: "failed",
			chunks: 0,
			error: failure.error
		}))].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
	}
	/** 只向桌面知识库预览区返回已解析原文；不包含凭据或未挂接资源。 */
	async document(knowledgeBaseId, documentId) {
		const index = await this.read(knowledgeBaseId);
		const document = index.documents.find((item) => item.id === documentId);
		if (document === void 0) throw new Error("已解析文件不存在或已被更新");
		return {
			documentId: document.id,
			sourceId: document.sourceId,
			title: document.title,
			path: document.path,
			relativePath: document.relativePath,
			memory: document.memory,
			aiInsight: document.aiInsight,
			content: document.chunks.join("\n\n")
		};
	}
	file(id) {
		if (!/^[0-9a-f-]{20,}$/iu.test(id)) throw new Error("知识库 ID 无效");
		return join(this.root, `${id}.json`);
	}
	async read(id) {
		const empty = {
			schema: "xyai.knowledge-index.v1",
			knowledgeBaseId: id,
			revision: 0,
			updatedAt: 0,
			documents: [],
			failures: []
		};
		try {
			const value = JSON.parse(await readFile(this.file(id), "utf8"));
			if (value.schema !== "xyai.knowledge-index.v1" || value.knowledgeBaseId !== id || !Array.isArray(value.documents)) return empty;
			return {
				...value,
				failures: Array.isArray(value.failures) ? value.failures : [],
				documents: value.documents.map((document) => ({
					...document,
					memory: document.memory ?? distillKnowledgeMemory(document.chunks.join("\n"), document.fingerprint)
				}))
			};
		} catch {
			return empty;
		}
	}
	async write(value) {
		await mkdir(this.root, { recursive: true });
		const target = this.file(value.knowledgeBaseId);
		const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
		try {
			await writeFile(temporary, `${JSON.stringify(value)}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
			await rename(temporary, target);
		} catch (error) {
			await unlink(temporary).catch(() => void 0);
			throw error;
		}
	}
};
function assertKnowledgeAccess(base, requester) {
	if (requester.kind === "desktop-user") return;
	if (base.access.mode === "private") throw new Error("该知识库仅允许桌面用户直接访问");
	if (!base.access.workspaceIds.includes(requester.workspaceId)) throw new Error("当前工作区没有该知识库权限");
}
async function walk(root) {
	const files = [];
	const visit = async (directory) => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) {
				if (!EXCLUDED_DIRECTORIES.has(entry.name)) await visit(join(directory, entry.name));
				continue;
			}
			if (!entry.isFile()) continue;
			const path = join(directory, entry.name);
			const extension = extname(path).toLowerCase();
			if (!TEXT_EXTENSIONS.has(extension) && !DOCUMENT_EXTENSIONS.has(extension)) continue;
			if ((await stat(path)).size <= MAX_FILE_BYTES) files.push(path);
		}
	};
	await visit(root);
	return files.sort();
}
/**
* 挂接即枚举:只做目录盘点,不解析不抽取文本,供 UI 在挂接后立即展示
* 文件夹、子文件夹与文件清单(含跳过原因)。与 walk() 共用同一套排除规则,
* 因此"树里显示可解析"与"索引实际解析"永远一致。
*/
async function enumerateTree(root) {
	const resolved = await realpath(root);
	const snapshot = {
		schema: "xyai.knowledge-tree.v1",
		root: resolved,
		capturedAt: Date.now(),
		directories: [],
		files: []
	};
	const parseableCount = /* @__PURE__ */ new Map();
	const visit = async (directory, relative) => {
		let count = 0;
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const childRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
			if (entry.isSymbolicLink()) {
				snapshot.files.push({
					relativePath: childRelative,
					extension: extname(entry.name).toLowerCase(),
					size: 0,
					mtimeMs: 0,
					parseable: false,
					skipReason: "symlink"
				});
				continue;
			}
			if (entry.isDirectory()) {
				if (EXCLUDED_DIRECTORIES.has(entry.name)) {
					snapshot.directories.push({
						relativePath: childRelative,
						fileCount: 0,
						skipReason: "excluded-dir"
					});
					continue;
				}
				snapshot.directories.push({
					relativePath: childRelative,
					fileCount: 0
				});
				await visit(join(directory, entry.name), childRelative);
				continue;
			}
			if (!entry.isFile()) continue;
			const extension = extname(entry.name).toLowerCase();
			const info = await stat(join(directory, entry.name));
			if (!TEXT_EXTENSIONS.has(extension) && !DOCUMENT_EXTENSIONS.has(extension)) {
				snapshot.files.push({
					relativePath: childRelative,
					extension,
					size: info.size,
					mtimeMs: info.mtimeMs,
					parseable: false,
					skipReason: "extension"
				});
				continue;
			}
			if (info.size > MAX_FILE_BYTES) {
				snapshot.files.push({
					relativePath: childRelative,
					extension,
					size: info.size,
					mtimeMs: info.mtimeMs,
					parseable: false,
					skipReason: "too-large"
				});
				continue;
			}
			count += 1;
			snapshot.files.push({
				relativePath: childRelative,
				extension,
				size: info.size,
				mtimeMs: info.mtimeMs,
				parseable: true
			});
		}
		parseableCount.set(relative, count);
	};
	await visit(resolved, "");
	for (const directory of [...snapshot.directories].sort((a, b) => b.relativePath.split("/").length - a.relativePath.split("/").length)) {
		directory.fileCount += parseableCount.get(directory.relativePath) ?? 0;
		const parent = directory.relativePath.split("/").slice(0, -1).join("/");
		const parentEntry = parent === "" ? void 0 : snapshot.directories.find((item) => item.relativePath === parent);
		if (parentEntry !== void 0) parentEntry.fileCount += directory.fileCount;
	}
	snapshot.directories.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
	snapshot.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
	return snapshot;
}
async function extractKnowledgeText(path) {
	if (!isAbsolute(path)) throw new Error("知识文件路径必须为绝对路径");
	const extension = extname(path).toLowerCase();
	if (TEXT_EXTENSIONS.has(extension)) {
		const raw = (await readFile(path, "utf8")).slice(0, MAX_TEXT_CHARS);
		if (extension === ".json") try {
			return JSON.stringify(JSON.parse(raw), null, 2);
		} catch {
			return raw;
		}
		return clean$1(raw);
	}
	const require = createRequire(join(resolveXyosBackendDir(), "package.json"));
	if (extension === ".docx") return clean$1((await require("mammoth").extractRawText({ buffer: await readFile(path) })).value).slice(0, MAX_TEXT_CHARS);
	if (extension === ".pdf") {
		const imported = require("pdf-parse");
		if (typeof imported.PDFParse === "function") {
			const parser = new imported.PDFParse({ data: await readFile(path) });
			try {
				return clean$1((await parser.getText()).text).slice(0, MAX_TEXT_CHARS);
			} finally {
				await parser.destroy?.();
			}
		}
		const legacy = imported.default;
		if (typeof legacy !== "function") throw new Error("PDF 解析器版本不兼容");
		return clean$1((await legacy(await readFile(path))).text).slice(0, MAX_TEXT_CHARS);
	}
	if (extension === ".xlsx") {
		const workbook = new (require("exceljs")).Workbook();
		await workbook.xlsx.load(await readFile(path));
		const lines = [];
		for (const sheet of workbook.worksheets) {
			lines.push(`# ${sheet.name}`);
			sheet.eachRow((row, number) => lines.push(`${number}\t${row.values.slice(1).map((value) => String(value ?? "")).join("	")}`));
		}
		return clean$1(lines.join("\n")).slice(0, MAX_TEXT_CHARS);
	}
	throw new Error(`不支持的知识文件格式：${extension}`);
}
function clean$1(value) {
	return value.replace(/\r\n?/gu, "\n").replace(/\0/gu, "").replace(/\n{4,}/gu, "\n\n\n").trim();
}
function chunkText(text) {
	const chunks = [];
	for (let start = 0; start < text.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
		const end = Math.min(text.length, start + CHUNK_SIZE);
		const chunk = text.slice(start, end).trim();
		if (chunk !== "") chunks.push(chunk);
		if (end === text.length) break;
	}
	return chunks;
}
function tokenize(query) {
	const expanded = (query.toLowerCase().match(/[\p{Script=Han}]{2,}|[a-z0-9_.-]{2,}/gu) ?? []).flatMap((term) => /^[\p{Script=Han}]+$/u.test(term) && term.length > 3 ? [term, ...Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2))] : [term]);
	return [...new Set(expanded)].slice(0, 24);
}
function scoreText(text, terms) {
	const lower = text.toLowerCase();
	let score = 0;
	for (const term of terms) {
		const matches = lower.split(term).length - 1;
		if (matches > 0) score += 1 + Math.log2(matches + 1);
	}
	return score;
}
function highlightExcerpt(chunk, terms) {
	const lower = chunk.toLowerCase();
	let position = 0;
	for (const term of terms) {
		const found = lower.indexOf(term);
		if (found >= 0) {
			position = found;
			break;
		}
	}
	return chunk.slice(Math.max(0, position - 180), Math.min(chunk.length, position + 520)).trim();
}
/** Fast, deterministic extractive distillation; no cloud call or model is required. */
function distillKnowledgeMemory(text, fingerprint) {
	const lines = clean$1(text).split(/\n|(?<=[。！？.!?])\s*/u).map((value) => value.replace(/^\s*[-*#>\d.)、]+\s*/u, "").trim()).filter((value) => value.length >= 6 && value.length <= 360);
	const unique = [...new Map(lines.map((line, index) => [line.replace(/\s+/gu, "").toLowerCase(), {
		line,
		index
	}])).values()];
	const signal = /(?:必须|应当|应该|不得|禁止|条件|范围|阈值|参数|步骤|流程|故障|异常|原因|措施|注意|结论|定义|职责|风险|温度|压力|流量|效率|must|shall|should|limit|step|error|risk|warning|\d+(?:\.\d+)?\s*(?:%|℃|°c|mpa|kpa|kw|mw|t\/h))/iu;
	const facts = unique.map((item) => ({
		...item,
		score: (signal.test(item.line) ? 5 : 0) + (item.line.length >= 16 && item.line.length <= 180 ? 2 : 0) + (item.index < 8 ? 1 : 0)
	})).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 12).sort((a, b) => a.index - b.index).map((item) => item.line);
	const summary = (facts.slice(0, 3).join("；") || unique.slice(0, 3).map((item) => item.line).join("；")).slice(0, 900);
	const counts = /* @__PURE__ */ new Map();
	for (const term of tokenize(`${summary}\n${facts.join("\n")}`)) if (!/^(?:一个|以及|进行|可以|需要|相关|文件|内容|the|and|for|with)$/iu.test(term)) counts.set(term, (counts.get(term) ?? 0) + 1);
	return {
		summary,
		facts,
		keywords: [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 16).map(([term]) => term),
		distilledAt: Date.now(),
		sourceFingerprint: fingerprint
	};
}
//#endregion
//#region src/knowledge-index-jobs.ts
const KNOWLEDGE_INDEX_CANCELLED = "XYAI_KNOWLEDGE_INDEX_CANCELLED";
function throwIfKnowledgeIndexCancelled(shouldCancel) {
	if (shouldCancel?.() !== true) return;
	const error = new Error("索引已由用户停止；已完成内容保持不变");
	error.code = KNOWLEDGE_INDEX_CANCELLED;
	throw error;
}
function isKnowledgeIndexCancelled(cause) {
	return cause !== null && typeof cause === "object" && cause.code === KNOWLEDGE_INDEX_CANCELLED;
}
/** 知识库后台索引任务:进程内单并发队列,同一知识库同时只有一个活动任务。任务不持久化——进程重启后由下次增量索引自然续接(指纹机制保证一致性),不冒充"已恢复"。 */
var KnowledgeIndexJobManager = class {
	store;
	index;
	imaSync;
	cloudSync;
	jobs = /* @__PURE__ */ new Map();
	tail = Promise.resolve();
	/** 拉取型知识源同步失败只记警告，不覆盖本地索引成果。 */
	constructor(store = new KnowledgeBaseStore(), index = new KnowledgeIndexService(), imaSync, cloudSync) {
		this.store = store;
		this.index = index;
		this.imaSync = imaSync;
		this.cloudSync = cloudSync;
	}
	/** 启动后台索引;该库已有排队/运行中任务时复用同一 jobId。库不存在时抛错(由路由转 400)。 */
	async start(baseId) {
		const base = await this.store.get(baseId);
		const active = [...this.jobs.values()].find((job) => job.knowledgeBaseId === baseId && (job.state === "queued" || job.state === "running" || job.state === "cancelling"));
		if (active !== void 0) return { jobId: active.jobId };
		const job = {
			jobId: randomUUID(),
			knowledgeBaseId: base.id,
			state: "queued",
			scanned: 0,
			total: 0,
			warnings: [],
			startedAt: Date.now(),
			updatedAt: Date.now()
		};
		this.jobs.set(job.jobId, job);
		this.tail = this.tail.then(async () => {
			if (job.cancelRequested === true) {
				job.state = "cancelled";
				job.message = "排队中的索引已停止";
				job.updatedAt = Date.now();
				return;
			}
			job.state = "running";
			job.updatedAt = Date.now();
			try {
				const shouldCancel = () => job.cancelRequested === true;
				const report = await this.index.index(base, (info) => {
					job.scanned = info.scanned;
					job.total = info.total;
					job.currentFile = info.currentFile;
					job.updatedAt = Date.now();
				}, shouldCancel);
				job.report = report;
				if (this.imaSync !== void 0) for (const source of base.sources) {
					throwIfKnowledgeIndexCancelled(shouldCancel);
					if (source.type !== "ima" || source.mode !== "cached" && source.mode !== "both") continue;
					try {
						await this.imaSync(base, (info) => {
							job.scanned = report.scanned + info.scanned;
							job.total = report.scanned + info.total;
							job.currentFile = info.currentFile;
							job.updatedAt = Date.now();
						}, shouldCancel);
						throwIfKnowledgeIndexCancelled(shouldCancel);
					} catch (cause) {
						if (isKnowledgeIndexCancelled(cause)) throw cause;
						job.warnings = [...job.warnings, `${source.name}:ima 同步失败(${cause instanceof Error ? cause.message : String(cause)})`];
					}
				}
				if (this.cloudSync !== void 0) for (const source of base.sources) {
					throwIfKnowledgeIndexCancelled(shouldCancel);
					if (source.type !== "cloud-drive") continue;
					try {
						const synced = await this.cloudSync(base, source, (info) => {
							job.scanned = report.scanned + info.scanned;
							job.total = report.scanned + info.total;
							job.currentFile = info.currentFile;
							job.updatedAt = Date.now();
						}, shouldCancel);
						throwIfKnowledgeIndexCancelled(shouldCancel);
						if (synced.warn !== "") job.warnings = [...job.warnings, `${source.name}:${synced.warn}`];
					} catch (cause) {
						if (isKnowledgeIndexCancelled(cause)) throw cause;
						job.warnings = [...job.warnings, `${source.name}:云盘同步失败(${cause instanceof Error ? cause.message : String(cause)})`];
					}
				}
				job.state = "succeeded";
			} catch (cause) {
				job.state = isKnowledgeIndexCancelled(cause) ? "cancelled" : "failed";
				if (isKnowledgeIndexCancelled(cause)) job.message = "索引已停止；已完成内容保持不变";
				job.error = cause instanceof Error ? cause.message : String(cause);
			}
			delete job.currentFile;
			job.updatedAt = Date.now();
		});
		return { jobId: job.jobId };
	}
	status(jobId) {
		return this.jobs.get(jobId);
	}
	/** 请求安全停止：正在解析的单个文件会先完成，索引文件仅在完整批次完成后写入。 */
	cancel(jobId) {
		const job = this.jobs.get(jobId);
		if (job === void 0) return void 0;
		if (job.state === "succeeded" || job.state === "failed" || job.state === "cancelled") return job;
		job.cancelRequested = true;
		job.state = job.state === "queued" ? "cancelled" : "cancelling";
		job.message = job.state === "cancelled" ? "排队中的索引已停止" : "正在安全停止，当前文件完成后退出";
		job.updatedAt = Date.now();
		return job;
	}
	/** 同步等待全部任务结束(测试与关闭前排空用)。 */
	async drain() {
		await this.tail;
	}
};
//#endregion
//#region src/knowledge-audit.ts
/**
* 知识库操作审计日志:append-only,存本机,记录关键操作的 who/what/when/result。
* 只记录操作事实,不记录用户知识内容或凭据值。
*/
function defaultAuditPath() {
	return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "xyai", "knowledge-audit.json");
}
var KnowledgeAuditLog = class {
	file;
	loaded = false;
	entries = [];
	tail = Promise.resolve();
	constructor(file = defaultAuditPath()) {
		this.file = file;
	}
	async append(entry) {
		await this.load();
		const full = {
			id: randomUUID(),
			timestamp: Date.now(),
			...entry
		};
		this.entries.push(full);
		this.tail = this.tail.then(async () => {
			await mkdir(dirname(this.file), { recursive: true });
			const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
			await writeFile(temporary, `${JSON.stringify({
				schema: "xyai.knowledge-audit.v1",
				entries: this.entries
			}, null, 2)}\n`, "utf8");
			await rename(temporary, this.file);
		});
		await this.tail;
		return full;
	}
	async list(options) {
		await this.load();
		let filtered = this.entries;
		if (options?.knowledgeBaseId !== void 0) filtered = filtered.filter((entry) => entry.knowledgeBaseId === options.knowledgeBaseId);
		return filtered.slice(-(options?.limit ?? 100)).reverse();
	}
	async load() {
		if (this.loaded) return;
		this.loaded = true;
		try {
			const parsed = JSON.parse(await readFile(this.file, "utf8"));
			if (parsed.schema === "xyai.knowledge-audit.v1" && Array.isArray(parsed.entries)) this.entries = parsed.entries.filter((entry) => typeof entry?.id === "string" && typeof entry.timestamp === "number" && typeof entry.action === "string" && typeof entry.knowledgeBaseId === "string");
		} catch {}
	}
};
//#endregion
//#region src/knowledge-base-routes.ts
async function body$3(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		size += buffer.length;
		if (size > 256 * 1024) throw new Error("请求内容过大");
		chunks.push(buffer);
	}
	const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("请求必须是 JSON 对象");
	return value;
}
function reply$3(res, status, value) {
	const payload = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
		"cache-control": "no-store"
	});
	res.end(payload);
}
function registerKnowledgeBaseRoutes(ctx, store = new KnowledgeBaseStore(), index = new KnowledgeIndexService(), ima, cloud, audit = new KnowledgeAuditLog()) {
	const jobs = new KnowledgeIndexJobManager(store, index, ima === void 0 ? void 0 : async (base, onProgress, shouldCancel) => {
		for (const source of base.sources.filter((entry) => entry.type === "ima" && (entry.mode === "cached" || entry.mode === "both"))) {
			throwIfKnowledgeIndexCancelled(shouldCancel);
			if (source.type !== "ima") continue;
			const items = await ima.listItems(source.imaKnowledgeBaseId);
			const documents = [];
			for (const item of items) {
				throwIfKnowledgeIndexCancelled(shouldCancel);
				const text = await ima.mediaContent(item.media_id);
				if (text !== null) documents.push({
					id: item.media_id,
					title: item.title ?? item.media_id,
					text
				});
			}
			await index.indexExternalSource(base, source.id, `ima://${source.imaKnowledgeBaseId}`, documents, onProgress, shouldCancel);
		}
	}, cloud === void 0 ? void 0 : async (base, source, onProgress, shouldCancel) => {
		throwIfKnowledgeIndexCancelled(shouldCancel);
		const result = await cloud.sync(base, source, index, onProgress, shouldCancel);
		throwIfKnowledgeIndexCancelled(shouldCancel);
		return result;
	});
	return ctx.webServer.register({
		kind: "prefix",
		path: "/api/xyai/knowledge-bases",
		handler: async (req, res) => {
			try {
				const url = new URL(req.url ?? "/", "http://local");
				const suffix = url.pathname.slice(25).replace(/^\//u, "");
				const parts = suffix.split("/");
				if (req.method === "GET" && suffix === "") {
					const bases = await store.list();
					reply$3(res, 200, await Promise.all(bases.map(async (item) => ({
						...item,
						index: await index.status(item.id),
						files: await index.files(item.id)
					}))));
					return;
				}
				if (req.method === "POST" && suffix === "") {
					const input = await body$3(req);
					reply$3(res, 201, await store.create(String(input.name ?? "")));
					return;
				}
				if (req.method === "GET" && parts[0] === "audit") {
					reply$3(res, 200, { entries: await audit.list({
						limit: Number(url.searchParams.get("limit") ?? 100),
						...parts[1] !== void 0 ? { knowledgeBaseId: decodeURIComponent(parts[1]) } : {}
					}) });
					return;
				}
				if (parts[0] === "index-jobs" && req.method === "POST" && parts.length === 3 && parts[2] === "cancel") {
					const job = jobs.cancel(decodeURIComponent(parts[1] ?? ""));
					if (job === void 0) {
						reply$3(res, 404, { error: "索引任务不存在或已过期" });
						return;
					}
					const base = await store.get(job.knowledgeBaseId);
					await audit.append({ action: "index.cancel", knowledgeBaseId: base.id, knowledgeBaseName: base.name, result: "success" });
					reply$3(res, 200, { ...job });
					return;
				}
				if (parts[0] === "index-jobs" && req.method === "GET") {
					const job = jobs.status(decodeURIComponent(parts[1] ?? ""));
					if (job === void 0) reply$3(res, 404, { error: "索引任务不存在或已过期" });
					else reply$3(res, 200, { ...job });
					return;
				}
				if (parts[0] === "ima" && ima !== void 0) {
					if (req.method === "GET" && parts[1] === "status") {
						reply$3(res, 200, { configured: await ima.configured() });
						return;
					}
					if (req.method === "POST" && parts[1] === "credentials") {
						const input = await body$3(req);
						await ima.setCredentials(String(input.clientId ?? ""), String(input.apiKey ?? ""));
						reply$3(res, 200, { configured: true });
						return;
					}
					if (req.method === "GET" && parts[1] === "bases") {
						reply$3(res, 200, { list: await ima.listBases() });
						return;
					}
					if (req.method === "GET" && parts[1] === "items") {
						const kbId = new URL(req.url ?? "/", "http://local").searchParams.get("knowledgeBaseId") ?? "";
						reply$3(res, 200, { list: await ima.listItems(kbId) });
						return;
					}
					if (req.method === "POST" && parts[1] === "fetch") {
						const input = await body$3(req);
						const ids = Array.isArray(input.knowledgeBaseIds) ? input.knowledgeBaseIds.map((item) => String(item)).filter((item) => item.trim() !== "") : [];
						if (ids.length === 0) {
							reply$3(res, 400, { error: "请先勾选要挂接的知识库" });
							return;
						}
						const keywords = Array.isArray(input.keywords) ? input.keywords.map((item) => String(item)) : [];
						reply$3(res, 200, await ima.fetchDocuments(ids, keywords));
						return;
					}
					reply$3(res, 405, { error: "method-not-allowed" });
					return;
				}
				if (parts[0] === "cloud" && cloud !== void 0) {
					if (req.method === "GET" && parts[1] === "status") {
						const provider = String(url.searchParams.get("provider") ?? "");
						reply$3(res, 200, { configured: await cloud.configured(provider) });
						return;
					}
					if (req.method === "POST" && parts[1] === "credentials") {
						const input = await body$3(req);
						await cloud.setCredentials(String(input.provider ?? ""), String(input.secret ?? ""));
						reply$3(res, 200, { configured: true });
						return;
					}
					reply$3(res, 405, { error: "method-not-allowed" });
					return;
				}
				const id = decodeURIComponent(parts[0] ?? "");
				if (req.method === "POST" && parts.length === 2 && parts[1] === "sources") {
					const added = await store.addSource(id, await body$3(req));
					await audit.append({
						action: "source.add",
						knowledgeBaseId: id,
						knowledgeBaseName: added.name,
						result: "success"
					});
					reply$3(res, 201, added);
					return;
				}
				if (req.method === "PUT" && parts.length === 4 && parts[1] === "sources" && parts[3] === "mode") {
					reply$3(res, 200, await store.updateSourceMode(id, decodeURIComponent(parts[2] ?? ""), (await body$3(req)).mode));
					return;
				}
				if (req.method === "PUT" && parts.length === 2 && parts[1] === "access") {
					const updated = await store.setAccess(id, await body$3(req));
					await audit.append({
						action: "access.set",
						knowledgeBaseId: id,
						knowledgeBaseName: updated.name,
						result: "success"
					});
					reply$3(res, 200, updated);
					return;
				}
				if (req.method === "GET" && parts.length === 4 && parts[1] === "sources" && parts[3] === "tree") {
					const source = (await store.get(id)).sources.find((item) => item.id === decodeURIComponent(parts[2] ?? ""));
					if (source === void 0) {
						reply$3(res, 404, { error: "知识源不存在" });
						return;
					}
					if (source.type === "cloud-drive") {
						if (cloud === void 0) throw new Error("云盘连接器未启用");
						reply$3(res, 200, { ...await cloud.enumerate(source), sourceId: source.id });
						return;
					}
					if (source.type !== "local-folder") {
						reply$3(res, 400, { error: "该源类型暂不支持目录枚举" });
						return;
					}
					reply$3(res, 200, {
						...await enumerateTree(source.path),
						sourceId: source.id
					});
					return;
				}
				if (req.method === "POST" && parts.length === 2 && parts[1] === "index") {
					if ((await body$3(req).catch(() => ({}))).mode === "background") {
						const { jobId } = await jobs.start(id);
						reply$3(res, 202, { jobId });
						return;
					}
					reply$3(res, 200, await index.index(await store.get(id)));
					return;
				}
				if (req.method === "POST" && parts.length === 2 && parts[1] === "search") {
					const input = await body$3(req);
					const requester = input.requesterKind === "workspace" ? {
						kind: "workspace",
						workspaceId: String(input.workspaceId ?? "")
					} : { kind: "desktop-user" };
					const request = {
						query: String(input.query ?? ""),
						requester,
						...typeof input.limit === "number" ? { limit: input.limit } : {}
					};
					reply$3(res, 200, await index.search(await store.get(id), request));
					return;
				}
				if (req.method === "GET" && parts.length === 2 && parts[1] === "status") {
					reply$3(res, 200, await index.status(id));
					return;
				}
				if (req.method === "GET" && parts.length === 2 && parts[1] === "files") {
					reply$3(res, 200, await index.files(id));
					return;
				}
				if (req.method === "GET" && parts.length === 3 && parts[1] === "documents") {
					reply$3(res, 200, await index.document(id, decodeURIComponent(parts[2] ?? "")));
					return;
				}
				reply$3(res, 405, { error: "method-not-allowed" });
			} catch (error) {
				reply$3(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
}
//#endregion
//#region src/knowledge-ai-parse.ts
/**
* 知识库 AI 深度解析:本地模型可用时自动启用(内置 GGUF 优先,Ollama 兜底),
* 不可用或单次失败自动回退基础蒸馏,由调用方如实标注解析档次。纯决策,无 UI。
*/
const SYSTEM_PROMPT = "你是严谨的行业知识整理助手。只输出一个严格 JSON 对象,不解释,不使用代码块,不得编造文档中不存在的信息。";
const MAX_PROMPT_CHARS = 12e3;
/** 组装单次深度解析请求;超长文档保头尾、标 partial。 */
function buildDeepParsePrompt(title, text) {
	const body = text.length <= MAX_PROMPT_CHARS ? text : `${text.slice(0, MAX_PROMPT_CHARS - 2e3)}\n\n[中间部分内容过长已省略]\n\n${text.slice(-2e3)}`;
	return {
		coverage: text.length <= MAX_PROMPT_CHARS ? "full" : "partial",
		prompt: `文档标题:${title}\n文档内容:\n${body}\n\n请提炼为如下 JSON(字段全部必填,数组可为空):\n{"summary":"不超过200字的文档摘要","keyFacts":["关键事实/参数/规则/阈值/步骤,每条一句话,最多12条"],"entities":["人名/设备/部位/规范/单位等实体,最多15个"],"qa":[{"q":"依据文档可回答的问题","a":"依据原文的简短回答"}],"confidence":"high 或 medium 或 low"}\n要求:qa 最多6条;confidence 表示依据文档信息完整度的自评。`
	};
}
/** 从模型原始输出提取洞察 JSON;容忍代码围栏与前后噪声,缺 summary 或解析失败返回 undefined。 */
function extractInsightJson(raw) {
	const cleaned = raw.replace(/```[a-z]*\s*/giu, "").trim();
	const start = cleaned.indexOf("{");
	const end = cleaned.lastIndexOf("}");
	if (start < 0 || end <= start) return void 0;
	try {
		const value = JSON.parse(cleaned.slice(start, end + 1));
		const summary = typeof value.summary === "string" ? value.summary.trim() : "";
		if (summary === "") return void 0;
		const strings = (input, max) => Array.isArray(input) ? input.filter((item) => typeof item === "string" && item.trim() !== "").slice(0, max).map((item) => item.trim()) : [];
		const qa = Array.isArray(value.qa) ? value.qa.flatMap((item) => {
			const entry = item;
			return typeof entry?.q === "string" && entry.q.trim() !== "" && typeof entry?.a === "string" && entry.a.trim() !== "" ? [{
				q: entry.q.trim().slice(0, 300),
				a: entry.a.trim().slice(0, 800)
			}] : [];
		}).slice(0, 6) : [];
		const confidence = value.confidence === "high" || value.confidence === "medium" || value.confidence === "low" ? value.confidence : "medium";
		return {
			summary: summary.slice(0, 900),
			keyFacts: strings(value.keyFacts, 12),
			entities: strings(value.entities, 15),
			qa,
			confidence
		};
	} catch {
		return;
	}
}
/**
* 本地深度解析器:内置 GGUF 优先(与对话共用运行时,零额外常驻),无 GGUF 目录时探测 Ollama。
* 后端选择缓存一段时间——'none' 只缓存 60 秒,用户中途装好模型后无需重启即可升级解析。
*/
function createLocalKnowledgeParser(deps = {
	ggufComplete: completeWithLocalGguf,
	ggufPreferred: preferredLocalGgufForBatch,
	ollama: new OllamaClient()
}) {
	let cached;
	let cachedUntil = 0;
	const resolve = async () => {
		if (cached !== void 0 && Date.now() < cachedUntil) return cached;
		cached = void 0;
		const preferred = await deps.ggufPreferred().catch(() => void 0);
		if (preferred !== void 0) {
			cached = {
				backend: "gguf",
				modelId: preferred.id,
				label: preferred.name
			};
			cachedUntil = Date.now() + 3e5;
			return cached;
		}
		try {
			if (await deps.ollama.healthCheck()) {
				const model = (await deps.ollama.listModels())[0];
				if (model !== void 0 && model.name.trim() !== "") {
					cached = {
						backend: "ollama",
						model: model.name,
						label: model.name
					};
					cachedUntil = Date.now() + 3e5;
					return cached;
				}
			}
		} catch {}
		cached = "none";
		cachedUntil = Date.now() + 6e4;
		return cached;
	};
	return {
		tier: "local-model",
		async parse({ title, text }) {
			if (text.trim() === "") return void 0;
			const backend = await resolve();
			if (backend === void 0 || backend === "none") return void 0;
			const { prompt, coverage } = buildDeepParsePrompt(title, text);
			let raw;
			let model;
			if (backend.backend === "gguf") {
				raw = await deps.ggufComplete(backend.modelId, SYSTEM_PROMPT, prompt);
				model = backend.label;
			} else {
				model = backend.label;
				raw = await deps.ollama.complete(backend.model, SYSTEM_PROMPT, prompt).catch(() => void 0);
			}
			if (raw === void 0) return void 0;
			const insight = extractInsightJson(raw);
			if (insight === void 0) return void 0;
			return {
				tier: "local-model",
				model,
				summarizedAt: Date.now(),
				coverage,
				...insight
			};
		}
	};
}
//#endregion
//#region src/ima-client.ts
/**
* ima 知识库 OpenAPI 客户端(桌面端)。
* 规范来源:https://ima.qq.com/agent-interface(ima_api_ref.md)
* 协议:HTTP POST JSON,Base /openapi/wiki/v1/;认证 Header ima-openapi-clientid / ima-openapi-apikey;
* 响应 {code,msg,data},code=0 成功,code≠0 直接把 msg 展示给用户;cursor 翻页。
* 凭据只存本机凭据库,绝不写入本模块或任何日志。
*/
const IMA_BASE = "https://ima.qq.com/openapi/wiki/v1/";
/** 可拉取文本的媒体类型(网页2/公众号6/Markdown7/TXT13/Excel5);PDF1/Word3/PPT4/图片9/录音15 等如实跳过。 */
const TEXT_MEDIA_TYPES = /* @__PURE__ */ new Set([
	2,
	5,
	6,
	7,
	13
]);
function imaUri(knowledgeBaseId, mediaId) {
	return `ima://${knowledgeBaseId}/${mediaId}`;
}
/** 把自然语言查询拆成标题匹配用关键词;不足两字的散词丢弃,无可用词时回退整句。 */
function splitKeywords(query) {
	const terms = query.split(/[\s,，、;；。.!?？!]+/u).map((term) => term.trim()).filter((term) => term.length >= 2);
	return terms.length > 0 ? [...new Set(terms)].slice(0, 12) : [query.trim()].filter((term) => term !== "");
}
async function imaFetch(clientId, apiKey, endpoint, payload) {
	if (clientId.trim() === "" || apiKey.trim() === "") throw new Error("ima 凭据缺失:请先在知识库页配置 ClientID 与 API Key");
	const response = await fetch(`${IMA_BASE}${endpoint}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"ima-openapi-clientid": clientId,
			"ima-openapi-apikey": apiKey
		},
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(2e4)
	});
	if (!response.ok) throw new Error(`ima 接口错误(HTTP ${String(response.status)})`);
	return await response.json();
}
/** 列出当前账号有权限访问的知识库(get_addable_knowledge_base_list,自动翻页)。 */
async function listImaKnowledgeBases(clientId, apiKey) {
	const bases = [];
	let cursor = "";
	for (let page = 0; page < 10; page += 1) {
		const data = await imaFetch(clientId, apiKey, "get_addable_knowledge_base_list", {
			cursor,
			limit: 50
		});
		if (data.code !== 0) throw new Error(data.msg || "连接 ima 失败(请检查 API Key 与 ClientID)");
		bases.push(...data.data?.addable_knowledge_base_list ?? []);
		if (data.data?.is_end !== false) break;
		cursor = data.data?.next_cursor ?? "";
		if (cursor === "") break;
	}
	return bases;
}
/** 浏览知识库条目清单(get_knowledge_list,自动翻页)。 */
async function listImaKnowledgeItems(clientId, apiKey, knowledgeBaseId) {
	const items = [];
	let cursor = "";
	for (let page = 0; page < 20; page += 1) {
		const data = await imaFetch(clientId, apiKey, "get_knowledge_list", {
			cursor,
			limit: 50,
			knowledge_base_id: knowledgeBaseId
		});
		if (data.code !== 0) throw new Error(data.msg || "浏览 ima 知识库失败");
		items.push(...data.data?.knowledge_list ?? []);
		if (data.data?.is_end !== false) break;
		cursor = data.data?.next_cursor ?? "";
		if (cursor === "") break;
	}
	return items;
}
/** 获取单个媒体文本(get_media_info → url_info.url → 下载);不可文本拉取的类型返回 null。 */
async function getImaMediaContent(clientId, apiKey, mediaId) {
	const info = await imaFetch(clientId, apiKey, "get_media_info", { media_id: mediaId });
	if (info.code !== 0) throw new Error(info.msg || "获取 ima 媒体信息失败");
	const mediaType = info.data?.media_type;
	if (mediaType === void 0 || !TEXT_MEDIA_TYPES.has(mediaType)) return null;
	const url = info.data?.url_info?.url;
	if (url === void 0 || url === "") return null;
	const headers = info.data?.url_info?.headers ?? {};
	const downloaded = await fetch(url, {
		...Object.keys(headers).length > 0 ? { headers } : {},
		signal: AbortSignal.timeout(3e4)
	});
	if (!downloaded.ok) return null;
	const text = (await downloaded.text()).replace(/\0/gu, "").trim();
	return text === "" ? null : text.slice(0, 5e4);
}
//#endregion

//#region src/ima-notes-import.ts
/**
* ima 笔记 + 网页导入 + 知识库检索 + 媒体详情(官方接口)。
* 笔记 Base:/openapi/note/v1/;写入类操作仅限用户显式要求时调用。
* 数据边界:列表只返回标题/摘要等元数据;正文只在用户点开某篇时按需拉取;凭据永不下发。
*/
const IMA_NOTE_BASE = "https://ima.qq.com/openapi/note/v1/";
async function imaNoteFetch(clientId, apiKey, endpoint, payload) {
	if (clientId.trim() === "" || apiKey.trim() === "") throw new Error("ima 凭据缺失:请先在知识库页配置 ClientID 与 API Key");
	const response = await fetch(IMA_NOTE_BASE + endpoint, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"ima-openapi-clientid": clientId,
			"ima-openapi-apikey": apiKey
		},
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(2e4)
	});
	if (!response.ok) throw new Error("ima 接口错误(HTTP " + String(response.status) + ")");
	return await response.json();
}
function imaNoteData(packet, label) {
	if (typeof packet === "object" && packet !== null && typeof packet.code === "number" && packet.code !== 0) throw new Error(packet.msg || label + "失败(请检查 ima 凭据与权限)");
	if (typeof packet !== "object" || packet === null || packet.code !== 0) throw new Error(label + ":ima 返回结构异常");
	return packet.data ?? {};
}
/** 列出笔记本(笔记分类,自动翻页)。 */
async function listImaNotebooks(clientId, apiKey) {
	const folders = [];
	let cursor = "0";
	for (let page = 0; page < 10; page += 1) {
		const data = await imaNoteFetch(clientId, apiKey, "list_notebook", { cursor, limit: 50 });
		const payload = imaNoteData(data, "列出 ima 笔记本");
		folders.push(...payload.note_folder_infos ?? []);
		if (payload.is_end !== false) break;
		cursor = payload.next_cursor ?? "";
		if (cursor === "") break;
	}
	return folders;
}
/** 列出笔记本内笔记(元数据)。 */
async function listImaNotes(clientId, apiKey, folderId) {
	const notes = [];
	let cursor = "";
	for (let page = 0; page < 10; page += 1) {
		const payload = { cursor, limit: 50, sort_type: 0 };
		if (folderId !== void 0 && folderId !== "") payload.folder_id = folderId;
		const data = await imaNoteFetch(clientId, apiKey, "list_note", payload);
		const packet = imaNoteData(data, "列出 ima 笔记");
		notes.push(...packet.note_book_list ?? []);
		if (packet.is_end !== false) break;
		cursor = packet.next_cursor ?? "";
		if (cursor === "") break;
	}
	return notes;
}
/** 检索笔记:searchType 0=标题、1=正文。 */
async function searchImaNotes(clientId, apiKey, keyword, searchType) {
	const notes = [];
	let start = 0;
	const end = 20;
	for (let page = 0; page < 10; page += 1) {
		const queryInfo = searchType === 1 ? { content: keyword } : { title: keyword };
		const data = await imaNoteFetch(clientId, apiKey, "search_note", { search_type: searchType, sort_type: 0, query_info: queryInfo, start, end });
		const packet = imaNoteData(data, "检索 ima 笔记");
		notes.push(...packet.note_list ?? []);
		if (packet.is_end !== false) break;
		start = end * (page + 1);
	}
	return notes;
}
/** 读取笔记正文(纯文本)。 */
async function readImaNoteContent(clientId, apiKey, noteId) {
	const data = await imaNoteFetch(clientId, apiKey, "get_doc_content", { note_id: noteId, target_content_format: 0 });
	const packet = imaNoteData(data, "读取 ima 笔记");
	return typeof packet.content === "string" ? packet.content : "";
}
/** 新建笔记(import_doc,Markdown;标题由首行推导)。 */
async function createImaNote(clientId, apiKey, content, folderId, folderName) {
	const payload = { content_format: 1, content };
	if (folderId !== void 0 && folderId !== "") payload.folder_id = folderId;
	if (folderName !== void 0 && folderName !== "") payload.folder_name = folderName;
	const data = await imaNoteFetch(clientId, apiKey, "import_doc", payload);
	const packet = imaNoteData(data, "新建 ima 笔记");
	return typeof packet.note_id === "string" ? packet.note_id : "";
}
/** 追加内容到已有笔记(Markdown)。 */
async function appendImaNote(clientId, apiKey, noteId, content) {
	const data = await imaNoteFetch(clientId, apiKey, "append_doc", { note_id: noteId, content_format: 1, content });
	const packet = imaNoteData(data, "追加 ima 笔记");
	return typeof packet.note_id === "string" ? packet.note_id : "";
}
/** 把网页 / 微信公众号文章链接加入知识库根目录(服务端抓取,本地不落地内容)。 */
async function importImaUrls(clientId, apiKey, knowledgeBaseId, urls) {
	const clean = (urls ?? []).filter((url) => typeof url === "string" && url.trim() !== "").slice(0, 10);
	if (clean.length === 0) throw new Error("请提供 1-10 个网页链接");
	const data = await imaFetch(clientId, apiKey, "import_urls", { knowledge_base_id: knowledgeBaseId, folder_id: knowledgeBaseId, urls: clean });
	const packet = imaNoteData(data, "导入网页到 ima 知识库");
	const mapping = typeof packet.results === "object" && packet.results !== null ? packet.results : {};
	return clean.map((url) => ({ url, result: mapping[url] ?? {} }));
}
/** 检索知识库条目(标题/内容命中),返回条目元数据。 */
async function searchImaKnowledgeItems(clientId, apiKey, knowledgeBaseId, query) {
	const items = [];
	let cursor = "";
	for (let page = 0; page < 10; page += 1) {
		const data = await imaFetch(clientId, apiKey, "search_knowledge", { knowledge_base_id: knowledgeBaseId, query, cursor, limit: 20 });
		const packet = imaNoteData(data, "检索 ima 知识库");
		items.push(...packet.info_list ?? []);
		if (packet.is_end !== false) break;
		cursor = packet.next_cursor ?? "";
		if (cursor === "") break;
	}
	return items;
}
/** 获取单个媒体的访问信息:可文本化的返回正文,笔记返回正文,其余返回可访问链接(不外泄鉴权头)。 */
async function getImaMediaDetail(clientId, apiKey, mediaId) {
	const data = await imaFetch(clientId, apiKey, "get_media_info", { media_id: mediaId });
	const packet = imaNoteData(data, "获取 ima 媒体信息");
	const mediaType = packet.media_type;
	const url = typeof packet.url_info === "object" && packet.url_info !== null ? packet.url_info.url ?? "" : "";
	if (mediaType === 11) {
		const notebookId = typeof packet.notebook_ext_info === "object" && packet.notebook_ext_info !== null ? packet.notebook_ext_info.notebook_id ?? "" : "";
		if (notebookId !== "") return { mediaId, mediaType, notebookId, content: await readImaNoteContent(clientId, apiKey, notebookId) };
	}
	if (typeof url === "string" && url !== "") return { mediaId, mediaType, url };
	return { mediaId, mediaType };
}

/** 解析目标 id 到可调用的 ima 知识库 id(兼容 XYAI 本地挂接 id 与 ima 原始 id;空则返回全部挂接)。 */
async function resolveImaKnowledgeBaseIds(store, wanted) {
	const ids = [];
	const bases = await store.list();
	for (const base of bases) for (const source of base.sources ?? []) {
		if (source.type !== "ima") continue;
		if (wanted === "" || wanted === base.id || wanted === source.imaKnowledgeBaseId) ids.push(source.imaKnowledgeBaseId);
	}
	return [...new Set(ids)];
}
//#endregion
//#region src/knowledge-ima.ts
/**
* ima 网关:凭据只存本机凭据库(ctx.credentials),永不回显、不落日志、不进渲染层 state。
* 高层操作:列库/列条目/取文本/按关键词定向拉取文档(行业智能体喂料与缓存同步共用)。
*/
const CLIENT_ID_REF = credentialRef("XYAI_IMA_CLIENT_ID");
const API_KEY_REF = credentialRef("XYAI_IMA_API_KEY");
const MAX_ITEMS_PER_KB = 30;
const MAX_KB_PER_FETCH = 5;
function createImaGateway(ctx) {
	const credentials = ctx.credentials;
	const load = async () => {
		const [clientId, apiKey] = await Promise.all([credentials.resolve(CLIENT_ID_REF), credentials.resolve(API_KEY_REF)]);
		if (clientId === void 0 || apiKey === void 0) return void 0;
		return {
			clientId: clientId.value,
			apiKey: apiKey.value
		};
	};
	return {
		async configured() {
			return await load() !== void 0;
		},
		async setCredentials(clientId, apiKey) {
			if (clientId.trim() === "" || apiKey.trim() === "") throw new Error("ClientID 与 API Key 不能为空");
			await credentials.set(CLIENT_ID_REF, clientId.trim());
			await credentials.set(API_KEY_REF, apiKey.trim());
		},
		async listBases() {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await listImaKnowledgeBases(creds.clientId, creds.apiKey);
		},
		async listItems(knowledgeBaseId) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await listImaKnowledgeItems(creds.clientId, creds.apiKey, knowledgeBaseId);
		},
		async mediaContent(mediaId) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await getImaMediaContent(creds.clientId, creds.apiKey, mediaId);
		},
		async fetchDocuments(knowledgeBaseIds, keywords = []) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			const terms = splitKeywords(keywords.join(" "));
			const documents = [];
			let skippedBinary = 0;
			let skippedUnavailable = 0;
			let skippedIrrelevant = 0;
			for (const knowledgeBaseId of knowledgeBaseIds.slice(0, MAX_KB_PER_FETCH)) {
				const items = await listImaKnowledgeItems(creds.clientId, creds.apiKey, knowledgeBaseId);
				const relevant = terms.length === 0 ? items : items.filter((item) => {
					const title = (item.title ?? "").toLowerCase();
					return terms.some((term) => title.includes(term.toLowerCase()));
				});
				skippedIrrelevant += items.length - relevant.length;
				for (const item of relevant.slice(0, MAX_ITEMS_PER_KB)) try {
					const content = await getImaMediaContent(creds.clientId, creds.apiKey, item.media_id);
					if (content === null) skippedBinary += 1;
					else documents.push({
						name: `${item.title || item.media_id}.txt`,
						content
					});
				} catch {
					skippedUnavailable += 1;
				}
			}
			const parts = [];
			if (skippedIrrelevant > 0) parts.push(`已按关键词过滤 ${String(skippedIrrelevant)} 条不相关条目`);
			if (skippedBinary > 0) parts.push(`跳过 ${String(skippedBinary)} 个二进制条目(PDF/Word/图片等请在 ima 客户端查看原文)`);
			if (skippedUnavailable > 0) parts.push(`跳过 ${String(skippedUnavailable)} 个不可访问条目`);
			return {
				documents,
				count: documents.length,
				skipped: skippedIrrelevant,
				warn: parts.join(";")
			};
		},
		async searchKnowledge(knowledgeBaseId, query) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await searchImaKnowledgeItems(creds.clientId, creds.apiKey, knowledgeBaseId, query);
		},
		async listNotebooks() {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await listImaNotebooks(creds.clientId, creds.apiKey);
		},
		async listNotes(folderId) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await listImaNotes(creds.clientId, creds.apiKey, folderId);
		},
		async searchNotes(keyword, searchType) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await searchImaNotes(creds.clientId, creds.apiKey, keyword, searchType);
		},
		async readNote(noteId) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await readImaNoteContent(creds.clientId, creds.apiKey, noteId);
		},
		async createNote(content, folderId, folderName) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await createImaNote(creds.clientId, creds.apiKey, content, folderId, folderName);
		},
		async appendNote(noteId, content) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await appendImaNote(creds.clientId, creds.apiKey, noteId, content);
		},
		async importUrls(knowledgeBaseId, urls) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await importImaUrls(creds.clientId, creds.apiKey, knowledgeBaseId, urls);
		},
		async mediaDetail(mediaId) {
			const creds = await load();
			if (creds === void 0) throw new Error("尚未配置 ima 凭据:请先在知识库页保存 ClientID 与 API Key(仅存本机)");
			return await getImaMediaDetail(creds.clientId, creds.apiKey, mediaId);
		}
	};
}
//#endregion
//#region src/knowledge-cloud-drive.ts
/**
* 云盘不再只是网站跳转：只连接供应方公开 MCP，只调用读列表工具。
* 密钥存在 ctx.credentials，知识源只记录供应方、根路径和标题，绝不存储、回显或审计记录凭据。
*/
const CLOUD_DRIVE_PROVIDERS = {
	"baidu-netdisk": {
		name: "百度网盘",
		endpoint: "https://mcp-pan.baidu.com/sse",
		transport: "sse",
		secretRef: credentialRef("XYAI_BAIDU_NETDISK_ACCESS_TOKEN"),
		secretLabel: "Access Token",
		secretParameter: "access_token",
		listTools: ["file_doc_list", "file_list"]
	},
	"360-yunpan": {
		name: "360 AI云盘",
		endpoint: "https://mcp.yunpan.com/mcp",
		transport: "streamable-http",
		secretRef: credentialRef("XYAI_360_YUNPAN_API_KEY"),
		secretLabel: "API Key",
		secretParameter: "api_key",
		listTools: ["file-list", "file_list"]
	}
};
function cloudProvider(source) {
	const provider = CLOUD_DRIVE_PROVIDERS[source.provider ?? source.connectorId];
	if (provider === void 0) throw new Error("该云盘源缺少可用的连接器配置");
	return provider;
}
function cloudResultText(result) {
	return result.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n") ?? "";
}
function cloudResultValue(result) {
	if (result.structuredContent !== void 0) return result.structuredContent;
	const text = cloudResultText(result).trim();
	if (text === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		const start = text.indexOf("{");
		const end = text.lastIndexOf("}");
		if (start >= 0 && end > start) try {
			return JSON.parse(text.slice(start, end + 1));
		} catch {}
		return { text };
	}
}
function cloudFileRows(value) {
	const rows = [];
	const seen = /* @__PURE__ */ new Set();
	const visit = (item, depth = 0) => {
		if (depth > 8 || item === null || item === void 0) return;
		if (Array.isArray(item)) {
			for (const entry of item) visit(entry, depth + 1);
			return;
		}
		if (typeof item !== "object") return;
		const record = item;
		const path = typeof record.path === "string" ? record.path : typeof record.full_path === "string" ? record.full_path : "";
		const title = typeof record.filename === "string" ? record.filename : typeof record.name === "string" ? record.name : typeof record.title === "string" ? record.title : path.split("/").filter(Boolean).at(-1) ?? "";
		const id = String(record.fsid ?? record.fs_id ?? record.id ?? path ?? title);
		if (title !== "" && id !== "" && !seen.has(id)) {
			seen.add(id);
			rows.push({
				id,
				path,
				title,
				isDirectory: record.isdir === 1 || record.isdir === true || record.is_dir === 1 || record.is_dir === true || record.type === "directory",
				size: Number(record.size ?? 0) || 0,
				text: [record.content, record.abstract, record.text, record.summary].find((entry) => typeof entry === "string" && entry.trim() !== "") ?? ""
			});
		}
		for (const child of Object.values(record)) if (typeof child === "object" && child !== null) visit(child, depth + 1);
	};
	visit(value);
	return rows;
}
function cloudToolArguments(tool, rootPath) {
	const properties = tool.inputSchema?.properties ?? {};
	const args = {};
	if (Object.prototype.hasOwnProperty.call(properties, "dir")) args.dir = rootPath;
	else if (Object.prototype.hasOwnProperty.call(properties, "path")) args.path = rootPath;
	else if (Object.prototype.hasOwnProperty.call(properties, "folder")) args.folder = rootPath;
	else if (Object.prototype.hasOwnProperty.call(properties, "root")) args.root = rootPath;
	if (Object.prototype.hasOwnProperty.call(properties, "page")) args.page = 1;
	if (Object.prototype.hasOwnProperty.call(properties, "num")) args.num = 100;
	if (Object.prototype.hasOwnProperty.call(properties, "limit")) args.limit = 100;
	return args;
}
function cloudError(result) {
	return cloudResultText(result).trim() || "云盘 MCP 工具未返回可用结果";
}
function createCloudDriveGateway(ctx) {
	const credentials = ctx.credentials;
	const loadSecret = async (providerId) => {
		const provider = CLOUD_DRIVE_PROVIDERS[providerId];
		if (provider === void 0) throw new Error("不支持的云盘");
		const secret = await credentials.resolve(provider.secretRef);
		return secret?.value.trim() || void 0;
	};
	const withClient = async (source, operation) => {
		const provider = cloudProvider(source);
		const secret = await loadSecret(source.provider ?? source.connectorId);
		if (secret === void 0) throw new Error(`${provider.name}凭据缺失:请先在知识库页保存 ${provider.secretLabel}`);
		const endpoint = new URL(provider.endpoint);
		endpoint.searchParams.set(provider.secretParameter, secret);
		const transport = provider.transport === "sse" ? new SSEClientTransport(endpoint) : new StreamableHTTPClientTransport(endpoint);
		const client = new McpSdkClient({ name: "xyai-studio-cloud-knowledge", version: "0.3.1" });
		try {
			await client.connect(transport);
			return await operation(client, provider);
		} finally {
			await client.close().catch(() => void 0);
		}
	};
	const list = async (source) => await withClient(source, async (client, provider) => {
		const tools = (await client.listTools()).tools;
		const tool = provider.listTools.map((name) => tools.find((entry) => entry.name === name)).find((entry) => entry !== void 0);
		if (tool === void 0) throw new Error(`${provider.name} 未提供必需的只读文件列表工具`);
		const response = await client.callTool({
			name: tool.name,
			arguments: cloudToolArguments(tool, source.rootPath ?? "/")
		});
		if (response.isError === true) throw new Error(cloudError(response));
		return cloudFileRows(cloudResultValue(response));
	});
	return {
		async configured(providerId) {
			return await loadSecret(providerId) !== void 0;
		},
		async setCredentials(providerId, secret) {
			const provider = CLOUD_DRIVE_PROVIDERS[providerId];
			if (provider === void 0) throw new Error("不支持的云盘");
			if (secret.trim() === "") throw new Error(`${provider.secretLabel} 不能为空`);
			await credentials.set(provider.secretRef, secret.trim());
		},
		async enumerate(source) {
			const rows = await list(source);
			return {
				schema: "xyai.knowledge-tree.v1",
				root: `${source.provider ?? source.connectorId}:${source.rootPath ?? "/"}`,
				capturedAt: Date.now(),
				directories: rows.filter((item) => item.isDirectory).map((item) => ({ relativePath: item.path || item.title, fileCount: 0 })),
				files: rows.filter((item) => !item.isDirectory).map((item) => ({
					relativePath: item.path || item.title,
					extension: extname(item.title).toLowerCase(),
					size: item.size,
					mtimeMs: 0,
					parseable: item.text.trim() !== "",
					...item.text.trim() === "" ? { skipReason: "cloud-content-pending" } : {}
				}))
			};
		},
		async sync(base, source, index, onProgress, shouldCancel) {
			throwIfKnowledgeIndexCancelled(shouldCancel);
			const rows = await list(source);
			throwIfKnowledgeIndexCancelled(shouldCancel);
			const documents = rows.filter((item) => !item.isDirectory && item.text.trim() !== "").map((item) => ({
				id: item.id,
				title: item.path || item.title,
				text: item.text
			}));
			const pendingContent = rows.filter((item) => !item.isDirectory && item.text.trim() === "").length;
			const report = await index.indexExternalSource(base, source.id, `cloud://${source.provider ?? source.connectorId}${source.rootPath ?? "/"}`, documents, onProgress, shouldCancel);
			return {
				report,
				warn: pendingContent > 0 ? `${String(pendingContent)} 个云端文件尚未产生可读的文本片段，已保留在目录列表中等待云盘端解析` : ""
			};
		}
	};
}
//#endregion
//#region src/connector-tool-runtime.ts
/** Registers enabled connector capabilities as real model-facing DSH tools. */
var ConnectorToolRuntime = class {
	ctx;
	installs;
	fetchImpl;
	disposers = [];
	constructor(ctx, installs = new ConnectorInstallStore(), fetchImpl = fetch) {
		this.ctx = ctx;
		this.installs = installs;
		this.fetchImpl = fetchImpl;
	}
	async refresh() {
		this.dispose();
		const installations = await this.installs.list();
		for (const installation of installations.filter((item) => item.enabled)) try {
			await this.activate(installation.id);
		} catch (error) {
			this.ctx.logger?.error(`连接器 ${installation.id} 能力激活失败，已隔离：${error instanceof Error ? error.message : String(error)}`);
		}
	}
	dispose() {
		for (const dispose of this.disposers.splice(0).reverse()) dispose();
	}
	async activate(id) {
		const installation = (await this.installs.list()).find((item) => item.id === id);
		if (installation?.enabled !== true) return;
		const definition = CONNECTORS.find((item) => item.id === id);
		const manifest = parseConnectorManifest(installation.manifest ?? (definition === void 0 ? void 0 : manifestForConnector(definition)));
		if (definition?.credentialRef !== void 0 && manifest.contributes.tools.length > 0) {
			const credential = await this.ctx.credentials.resolve(credentialRef(definition.credentialRef));
			if (credential !== void 0) {
				const config = parseConnectorCredential(credential.value);
				for (const contribution of manifest.contributes.tools) {
					if (!isBuiltinConnectorTool(definition, contribution)) continue;
					this.disposers.push(this.ctx.tools.register(defineTool({
						name: contribution.name,
						description: `${contribution.description} 仅访问“${definition.name}”中用户已经授权的范围。`,
						parameters: {},
						output: {
							schema: { type: "json" },
							render: (_args, value) => [{
								type: "text",
								text: JSON.stringify(value)
							}]
						},
						timeoutMs: 15e3,
						isConcurrencySafe: () => contribution.risk === "read",
						execute: async (_args, exec) => await executeOperation(definition.id, contribution, config, exec.signal, this.fetchImpl)
					})));
				}
			}
		}
		for (const contribution of manifest.contributes.skills) this.disposers.push(this.ctx.skills.register({
			name: contribution.name,
			description: contribution.description,
			...contribution.whenToUse === void 0 ? {} : { whenToUse: contribution.whenToUse },
			source: "runtime",
			provider: `xyai-connector:${manifest.id}`,
			content: contribution.content,
			...contribution.invocation === void 0 ? {} : { invocation: contribution.invocation }
		}));
		for (const contribution of manifest.contributes.mcpServers) {
			const config = mcpClientConfig(contribution);
			const fiber = this.ctx.plugin(McpClient, config);
			await fiber;
			this.disposers.push(() => {
				fiber.dispose();
			});
		}
	}
};
function isBuiltinConnectorTool(definition, contribution) {
	return definition !== void 0 && manifestForConnector(definition).contributes.tools.some((item) => item.name === contribution.name && item.operation === contribution.operation);
}
function mcpClientConfig(contribution) {
	const common = {
		serverName: contribution.serverName,
		toolCallTimeoutMs: contribution.toolCallTimeoutMs ?? 3e4,
		failOnStartupError: false
	};
	return contribution.transport === "stdio" ? {
		...common,
		transport: "stdio",
		command: contribution.command,
		args: [...contribution.args],
		env: { ...contribution.env },
		cwd: contribution.cwd ?? process.cwd()
	} : {
		...common,
		transport: "streamable-http",
		url: contribution.url,
		headers: { ...contribution.headers }
	};
}
async function executeOperation(id, tool, config, signal, fetchImpl) {
	if (id === "ima" && tool.operation === "listKnowledgeBases") return await checkedJson("ima 知识库", await fetchImpl("https://ima.qq.com/openapi/wiki/v1/get_addable_knowledge_base_list", {
		method: "POST",
		signal,
		headers: {
			"content-type": "application/json",
			"ima-openapi-clientid": required(config, "clientId"),
			"ima-openapi-apikey": required(config, "apiKey")
		},
		body: "{}"
	}));
	if (id === "wechat" && tool.operation === "accountStatus") {
		const body = await checkedJson("微信公众平台", await fetchImpl("https://api.weixin.qq.com/cgi-bin/stable_token", {
			method: "POST",
			signal,
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "client_credential",
				appid: required(config, "appId"),
				secret: required(config, "appSecret")
			})
		}));
		if (typeof body.access_token !== "string") throw new Error(`微信公众平台验证失败：${String(body.errmsg ?? "未返回 access_token")}`);
		return {
			connected: true,
			...typeof body.expires_in === "number" ? { expiresIn: body.expires_in } : {}
		};
	}
	if (id === "wecom" && tool.operation === "listDepartments") {
		const tokenUrl = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
		tokenUrl.searchParams.set("corpid", required(config, "corpId"));
		tokenUrl.searchParams.set("corpsecret", required(config, "corpSecret"));
		const token = await checkedJson("企业微信", await fetchImpl(tokenUrl, { signal }));
		if (typeof token.access_token !== "string") throw new Error(`企业微信验证失败：${String(token.errmsg ?? "未返回 access_token")}`);
		const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/department/list");
		url.searchParams.set("access_token", token.access_token);
		const departments = await checkedJson("企业微信部门", await fetchImpl(url, { signal }));
		if (departments.errcode !== 0) throw new Error(`企业微信部门读取失败：${String(departments.errmsg ?? departments.errcode)}`);
		return { departments: Array.isArray(departments.department) ? departments.department : [] };
	}
	if (id === "tencent-meeting" && tool.operation === "currentUser") {
		const openId = required(config, "openId");
		const url = new URL("https://api.meeting.qq.com/v1/users/info/basic");
		url.searchParams.set("operator_id", openId);
		url.searchParams.set("operator_id_type", "2");
		return await checkedJson("腾讯会议", await fetchImpl(url, {
			signal,
			headers: {
				"content-type": "application/json",
				AccessToken: required(config, "accessToken"),
				OpenId: openId,
				"X-TC-Timestamp": String(Math.floor(Date.now() / 1e3)),
				"X-TC-Nonce": String(Math.floor(Math.random() * 1e9))
			}
		}));
	}
	if (id === "kdocs" && tool.operation === "currentUser") {
		const url = new URL("https://developer.kdocs.cn/api/v1/openapi/user/basic");
		url.searchParams.set("access_token", required(config, "accessToken"));
		return await checkedJson("金山文档", await fetchImpl(url, {
			signal,
			headers: { "content-type": "application/json" }
		}));
	}
	throw new Error(`连接器 ${id} 尚未实现操作 ${tool.operation}`);
}
async function checkedJson(platform, response) {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(`${platform} 调用失败：${String(body.errmsg ?? body.message ?? body.error ?? `HTTP ${String(response.status)}`)}`);
	return body;
}
function required(config, key) {
	const value = config[key];
	if (value === void 0 || value.trim() === "") throw new Error(`连接器凭据缺少 ${key}`);
	return value;
}
//#endregion
//#region src/knowledge-tool-runtime.ts
function parseRequester(args) {
	return args.workspaceId === void 0 ? { kind: "desktop-user" } : {
		kind: "workspace",
		workspaceId: String(args.workspaceId ?? "")
	};
}
/** 列出模型可访问的知识库;workspace 请求方只看到已授权的库。 */
async function listAccessibleKnowledgeBases(store, index, requester) {
	const bases = await store.list();
	const visible = [];
	for (const base of bases) try {
		assertKnowledgeAccess(base, requester);
		visible.push(base);
	} catch {}
	return Promise.all(visible.map(async (base) => ({
		knowledgeBaseId: base.id,
		name: base.name,
		sourceTypes: base.sources.map((source) => source.type),
		...await index.status(base.id)
	})));
}
/** 不指定库时跨全部可访问库检索;引用带库名,按相关度合并排序。 */
async function searchKnowledgeBases(store, index, baseId, query, limit, requester) {
	const bases = baseId === void 0 ? await store.list() : [await store.get(baseId)];
	const merged = [];
	for (const base of bases) {
		try {
			assertKnowledgeAccess(base, requester);
		} catch (cause) {
			if (baseId !== void 0) throw cause;
			continue;
		}
		const citations = await index.search(base, {
			query,
			limit,
			requester
		});
		merged.push(...citations.map((item) => ({
			...item,
			knowledgeBaseName: base.name
		})));
	}
	return merged.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath)).slice(0, Math.min(20, Math.max(1, limit)));
}
/** 注册知识库发现与带引用检索两个工具(harness 侧统一入口);ima 网关存在时同时注册实时检索。 */
function registerKnowledgeTools(ctx, store = new KnowledgeBaseStore(), index = new KnowledgeIndexService(), ima) {
	const disposals = [
		ctx.tools.register(defineTool({
			name: "xyai_knowledge_list",
			description: "列出当前可用的 XYAI 本机知识库(名称、来源类型、文件数),检索前先用它发现知识库 ID。",
			parameters: { workspaceId: {
				type: "string",
				description: "从项目工作区调用时传入工作区 ID"
			} },
			output: {
				schema: { type: "json" },
				render: (_args, value) => [{
					type: "text",
					text: JSON.stringify(value)
				}]
			},
			timeoutMs: 1e4,
			isConcurrencySafe: () => true,
			execute: async (args) => ({ knowledgeBases: await listAccessibleKnowledgeBases(store, index, parseRequester(args)) })
		})),
		ctx.tools.register(defineTool({
			name: "xyai_knowledge_search",
			description: "检索 XYAI 本机知识库,返回带文件路径、行号和稳定 chunk ID 的引用。不传 knowledgeBaseId 时跨全部可访问知识库检索。",
			parameters: {
				query: {
					type: "string",
					required: true,
					description: "检索问题或关键词"
				},
				knowledgeBaseId: {
					type: "string",
					description: "知识库 ID(先用 xyai_knowledge_list 获取;不传则跨库检索)"
				},
				workspaceId: {
					type: "string",
					description: "从项目工作区调用时传入工作区 ID"
				}
			},
			output: {
				schema: { type: "json" },
				render: (_args, value) => [{
					type: "text",
					text: JSON.stringify(value)
				}]
			},
			timeoutMs: 15e3,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				return { citations: await searchKnowledgeBases(store, index, args.knowledgeBaseId === void 0 || args.knowledgeBaseId === "" ? void 0 : String(args.knowledgeBaseId), String(args.query ?? ""), 8, parseRequester(args)) };
			}
		})),
		...ima === void 0 ? [] : [ctx.tools.register(defineTool({
			name: "xyai_ima_search",
			description: "实时检索用户挂接的 ima 云端知识库,返回带 ima:// 来源的摘录。适合查询最新云端资料;仅限\"实时调用\"或\"实时+缓存\"模式的 ima 源。",
			parameters: {
				query: {
					type: "string",
					required: true,
					description: "检索问题或关键词(按条目标题匹配)"
				},
				knowledgeBaseId: {
					type: "string",
					description: "限定检索某一个本机知识库(其 ima 源);不传则检索全部 ima 源"
				},
				workspaceId: {
					type: "string",
					description: "从项目工作区调用时传入工作区 ID"
				}
			},
			output: {
				schema: { type: "json" },
				render: (_args, value) => [{
					type: "text",
					text: JSON.stringify(value)
				}]
			},
			timeoutMs: 3e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				const query = String(args.query ?? "").trim();
				if (query === "") return { error: "请提供检索词" };
				const requester = parseRequester(args);
				const wanted = args.knowledgeBaseId === void 0 || args.knowledgeBaseId === "" ? void 0 : String(args.knowledgeBaseId);
				const bases = (await store.list()).filter((base) => (wanted === void 0 || base.id === wanted) && base.sources.some((source) => source.type === "ima" && (source.mode === "realtime" || source.mode === "both")));
				const results = [];
				try {
					for (const base of bases.slice(0, 3)) {
						try {
							assertKnowledgeAccess(base, requester);
						} catch {
							continue;
						}
						for (const source of base.sources) {
							if (source.type !== "ima" || source.mode !== "realtime" && source.mode !== "both") continue;
							const matched = (await ima.listItems(source.imaKnowledgeBaseId)).filter((item) => {
								const title = (item.title ?? "").toLowerCase();
								return splitKeywords(query).some((term) => title.includes(term.toLowerCase()));
							}).slice(0, 5);
							for (const item of matched) {
								const content = await ima.mediaContent(item.media_id);
								if (content === null) continue;
								results.push({
									title: item.title ?? item.media_id,
									knowledgeBaseName: base.name,
									uri: imaUri(source.imaKnowledgeBaseId, item.media_id),
									excerpt: content.slice(0, 700)
								});
								if (results.length >= 10) return { results };
							}
						}
					}
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
				if (results.length === 0) return {
					results,
					note: "ima 库中未找到标题匹配的条目;可换关键词,或该库为仅缓存模式(请用 xyai_knowledge_search 检索缓存快照)"
				};
				return { results };
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_list_bases",
			description: "列出当前 ima 账号可访问/可添加内容的云端知识库(只读)。返回每个知识库的 id 与名称;浏览内容或导入网页链接前先用它找到 id。",
			parameters: {},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 2e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					const list = await ima.listBases();
					return { results: list };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_browse_files",
			description: "列出 ima 云端知识库中的文件/条目清单(只读元数据,不下载正文)。knowledgeBaseId 传 xyai_ima_list_bases 得到的 id;省略时自动取第一个挂接的 ima 知识库。",
			parameters: {
				knowledgeBaseId: {
					type: "string",
					description: "ima 知识库 ID;省略时自动取第一个挂接 ima 源"
				}},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 3e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					const wanted = String(args.knowledgeBaseId ?? "").trim();
					const ids = await resolveImaKnowledgeBaseIds(store, wanted);
					if (ids.length === 0 && wanted !== "") ids.push(wanted);
					if (ids.length === 0) return { error: "当前没有可用的 ima 知识库,请先用 xyai_ima_list_bases 列出并把 id 传入" };
					const results = [];
					for (const knowledgeBaseId of ids.slice(0, 3)) {
						results.push({ knowledgeBaseId, items: await ima.listItems(knowledgeBaseId) });
					}
					return { results };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_search_kb",
			description: "在 ima 云端知识库中按关键词检索(标题与正文命中),返回条目与高亮片段(不下载原文)。",
			parameters: {
				query: {
					type: "string",
					required: true,
					description: "检索关键词"
				},
				knowledgeBaseId: {
					type: "string",
					description: "ima 知识库 ID;省略时检索全部挂接 ima 知识库"
				}},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 3e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					const query = String(args.query ?? "").trim();
					if (query === "") return { error: "请提供检索关键词" };
					const wanted = String(args.knowledgeBaseId ?? "").trim();
					const ids = await resolveImaKnowledgeBaseIds(store, wanted);
					if (ids.length === 0 && wanted !== "") ids.push(wanted);
					if (ids.length === 0) return { error: "当前没有可用的 ima 知识库,请先用 xyai_ima_list_bases 列出并把 id 传入" };
					const results = [];
					for (const knowledgeBaseId of ids.slice(0, 3)) {
						const hits = await ima.searchKnowledge(knowledgeBaseId, query);
						results.push({ knowledgeBaseId, hits });
					}
					return { results };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_read_item",
			description: "读取 ima 知识库某一条目:笔记/文本条目返回正文;PDF、Word、图片等二进制文件不下载正文,返回可在浏览器或 ima 客户端打开的链接。",
			parameters: {
				mediaId: {
					type: "string",
					required: true,
					description: "条目 media_id(来自浏览或检索结果)"
				}},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 3e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					const mediaId = String(args.mediaId ?? "").trim();
					if (mediaId === "") return { error: "请提供条目 media_id" };
					const detail = await ima.mediaDetail(mediaId);
					if (typeof detail.content === "string" && detail.content !== "") return { content: detail.content.slice(0, 20000) };
					if (typeof detail.url === "string" && detail.url !== "") return { note: "该条目为 PDF/Word/图片等类型,本机不下载正文;可在浏览器或 ima 客户端打开", url: detail.url };
					return { note: "该条目需在 ima 客户端中查看原文", detail };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_import_urls",
			description: "把网页链接/微信公众号文章导入 ima 知识库(服务端抓取;写操作,仅在用户要求时调用)。",
			parameters: {
				urls: {
					type: "array",
					required: true,
					description: "要导入的网页链接(1-10 个)"
				},
				knowledgeBaseId: {
					type: "string",
					description: "目标 ima 知识库 ID;省略时导入第一个挂接 ima 源"
				}},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 4e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					const urls = Array.isArray(args.urls) ? args.urls.filter((url) => typeof url === "string" && url.trim() !== "") : [];
					if (urls.length === 0) return { error: "请提供 1-10 个网页链接" };
					const wanted = String(args.knowledgeBaseId ?? "").trim();
					const ids = await resolveImaKnowledgeBaseIds(store, wanted);
					if (ids.length === 0 && wanted !== "") ids.push(wanted);
					if (ids.length === 0) return { error: "当前没有可用的 ima 知识库,请先用 xyai_ima_list_bases 列出并把 id 传入" };
					const results = [];
					for (const knowledgeBaseId of ids.slice(0, 2)) results.push(...await ima.importUrls(knowledgeBaseId, urls));
					return { imported: results.length, results };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_list_notebooks",
			description: "列出 ima 笔记本(笔记分类/目录),返回 folder_id 与名称;列笔记前先用它确认分类。",
			parameters: {},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 2e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					return { results: await ima.listNotebooks() };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_list_notes",
			description: "列出 ima 某个笔记本(或全部)内的笔记标题清单(只读元数据)。",
			parameters: {
				folderId: {
					type: "string",
					description: "笔记本 folder_id(来自 xyai_ima_list_notebooks);省略则列出全部笔记"
				}},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 3e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					const folderId = typeof args.folderId === "string" ? args.folderId.trim() : "";
					return { results: await ima.listNotes(folderId === "" ? void 0 : folderId) };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_search_notes",
			description: "在 ima 笔记中按关键词检索标题或正文,返回命中的笔记清单(只读元数据;读正文用 xyai_ima_read_note)。",
			parameters: {
				query: {
					type: "string",
					required: true,
					description: "检索关键词"
				},
				mode: {
					type: "string",
					description: "0=按标题检索(默认);1=按正文检索"
				}},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 3e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					const keyword = String(args.query ?? "").trim();
					if (keyword === "") return { error: "请提供检索关键词" };
					const mode = String(args.mode ?? "0").trim() === "1" ? 1 : 0;
					return { results: await ima.searchNotes(keyword, mode) };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_read_note",
			description: "读取 ima 一篇笔记的正文(纯文本),用于回答前先取原文。",
			parameters: {
				noteId: {
					type: "string",
					required: true,
					description: "笔记 note_id(来自列表或检索结果)"
				}},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 3e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					const noteId = String(args.noteId ?? "").trim();
					if (noteId === "") return { error: "请提供笔记 note_id" };
					const content = await ima.readNote(noteId);
					if (content === "") return { note: "该笔记内容为空或不可读" };
					return { content: content.slice(0, 30000) };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_create_note",
			description: "在 ima 新建一篇笔记(Markdown)。写操作,仅在用户明确要求记录/整理到 ima 时调用;标题由内容首行推导。",
			parameters: {
				content: {
					type: "string",
					required: true,
					description: "笔记正文(Markdown,首行作为标题)"
				},
				folderId: {
					type: "string",
					description: "目标笔记本 folder_id(来自 xyai_ima_list_notebooks);可省略"
				},
				folderName: {
					type: "string",
					description: "目标笔记本名称(未指定 folderId 时可用名称,不存在会自动创建)"
				}},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 3e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					const content = String(args.content ?? "").trim();
					if (content === "") return { error: "笔记内容不能为空" };
					const folderId = typeof args.folderId === "string" ? args.folderId.trim() : void 0;
					const folderName = typeof args.folderName === "string" ? args.folderName.trim() : void 0;
					const noteId = await ima.createNote(content, folderId === "" ? void 0 : folderId, folderName === "" ? void 0 : folderName);
					if (noteId === "") return { error: "ima 未返回新建笔记 ID,请稍后重试" };
					return { noteId };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		})),
		ctx.tools.register(defineTool({
			name: "xyai_ima_append_note",
			description: "把新内容追加到 ima 已有笔记末尾(Markdown)。写操作,仅在用户明确要求补充到某篇笔记时调用。",
			parameters: {
				noteId: {
					type: "string",
					required: true,
					description: "笔记 note_id(来自列表或检索结果)"
				},
				content: {
					type: "string",
					required: true,
					description: "要追加的内容"
				}},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
			timeoutMs: 3e4,
			isConcurrencySafe: () => true,
			execute: async (args) => {
				try {
					const noteId = String(args.noteId ?? "").trim();
					const content = String(args.content ?? "").trim();
					if (noteId === "" || content === "") return { error: "请提供笔记 note_id 与要追加的内容" };
					const id = await ima.appendNote(noteId, content);
					return { noteId: id };
				} catch (cause) {
					return { error: cause instanceof Error ? cause.message : String(cause) };
				}
			}
		}))
		]
	];
	return () => {
		for (const dispose of disposals) try {
			dispose();
		} catch {}
	};
}
//#endregion
//#region src/production-architecture.ts
/**
* Stable, desktop-owned contract for XYAI Studio's production flywheel.
*
* Product lines describe business assets. Pipeline stages describe how each
* asset is made. Keeping both layers explicit prevents ingestion/training
* implementation details from becoming a second, conflicting navigation.
*/
const PRODUCTION_LINES = [
	"knowledge",
	"data",
	"model",
	"capability",
	"agent",
	"system",
	"deployment"
];
const PRODUCTION_ARCHITECTURE = {
	knowledge: {
		id: "knowledge",
		label: "知识生产线",
		purpose: "把本机与授权云端资料变成可追溯、可检索的知识资产",
		stages: [
			{
				id: "attach",
				label: "挂接数据源",
				gate: "来源获得用户授权且路径可访问"
			},
			{
				id: "inventory",
				label: "文件盘点",
				gate: "逐文件建立稳定标识和增量指纹"
			},
			{
				id: "parse",
				label: "解析清洗",
				gate: "支持格式解析完成，失败文件可见且可重试"
			},
			{
				id: "index",
				label: "分块索引",
				gate: "知识块保留文件、位置和版本引用"
			},
			{
				id: "memory",
				label: "记忆蒸馏",
				gate: "记忆可回溯原文，不覆盖原始证据"
			},
			{
				id: "access",
				label: "权限与引用",
				gate: "检索结果通过项目权限过滤并返回引用"
			}
		]
	},
	data: {
		id: "data",
		label: "数据生产线",
		purpose: "把已验收知识转成可审核、可复现的数据集版本",
		dependsOn: "knowledge",
		stages: [
			{
				id: "collect",
				label: "样本生成",
				gate: "每条样本保留上游知识引用"
			},
			{
				id: "normalize",
				label: "规范化",
				gate: "格式、单位、术语和角色模板一致"
			},
			{
				id: "deduplicate",
				label: "去重与冲突检测",
				gate: "近重复、冲突和泄漏样本已标记"
			},
			{
				id: "review",
				label: "专家审核",
				gate: "未经审核的自动样本不得进入正式训练集"
			},
			{
				id: "split",
				label: "冻结与分集",
				gate: "训练、验证和盲测集隔离且版本不可变"
			}
		]
	},
	model: {
		id: "model",
		label: "模型生产线",
		purpose: "按硬件安全档调优并登记可复现模型产物",
		dependsOn: "data",
		stages: [
			{
				id: "plan",
				label: "训练规划",
				gate: "底模许可、格式、显存和磁盘预算通过"
			},
			{
				id: "train",
				label: "参数高效训练",
				gate: "检查点、日志和中止恢复可用"
			},
			{
				id: "evaluate",
				label: "基线评测",
				gate: "质量、速度和退化指标通过阈值"
			},
			{
				id: "package",
				label: "合并量化",
				gate: "训练产物可被目标推理后端加载"
			},
			{
				id: "register",
				label: "模型登记",
				gate: "模型卡、数据版本、指标和回滚版本完整"
			}
		]
	},
	capability: {
		id: "capability",
		label: "能力生产线",
		purpose: "组合模型、Skills、插件、MCP和连接器；纯 Skill/MCP 能力不强制依赖已验收模型",
		stages: [
			{
				id: "compose",
				label: "能力编排",
				gate: "依赖版本和权限声明完整"
			},
			{
				id: "sandbox",
				label: "权限审计",
				gate: "高风险能力需要明确授权"
			},
			{
				id: "integration",
				label: "集成测试",
				gate: "工具调用、失败回退和结果结构通过"
			},
			{
				id: "bundle",
				label: "能力打包",
				gate: "可安装、可禁用、可卸载"
			}
		]
	},
	agent: {
		id: "agent",
		label: "智能体生产线",
		purpose: "把知识和能力固化为可验收的行业智能体",
		dependsOn: "capability",
		stages: [
			{
				id: "define",
				label: "角色与边界",
				gate: "目标、禁区、输出标准明确"
			},
			{
				id: "bind",
				label: "资源绑定",
				gate: "知识、模型、工具和权限均为明确版本"
			},
			{
				id: "simulate",
				label: "场景演练",
				gate: "正例、反例和异常路径均已覆盖"
			},
			{
				id: "accept",
				label: "专家验收",
				gate: "行业专家确认后方可进入系统生产线"
			}
		]
	},
	system: {
		id: "system",
		label: "系统生产线",
		purpose: "把智能体装配成XYOS或独立本地管理系统",
		dependsOn: "agent",
		stages: [
			{
				id: "scaffold",
				label: "项目生成",
				gate: "成果写入用户授权的本机工作区"
			},
			{
				id: "integrate",
				label: "业务集成",
				gate: "数据、身份和智能体通道连通"
			},
			{
				id: "test",
				label: "系统测试",
				gate: "功能、权限、数据迁移和恢复通过"
			},
			{
				id: "build",
				label: "构建产物",
				gate: "独立运行且不依赖可变的Harness界面"
			}
		]
	},
	deployment: {
		id: "deployment",
		label: "部署生产线",
		purpose: "审计、打包、安装、升级和回滚完整资产链",
		dependsOn: "system",
		stages: [
			{
				id: "audit",
				label: "发布审计",
				gate: "资产血缘、许可、密钥和安全检查通过"
			},
			{
				id: "package",
				label: "安装打包",
				gate: "按需组件不默认塞入主安装包"
			},
			{
				id: "smoke",
				label: "安装验证",
				gate: "干净环境安装、启动和核心流程通过"
			},
			{
				id: "release",
				label: "版本发布",
				gate: "版本、校验值和回滚方案完整"
			}
		]
	}
};
function previousProductionLine(line) {
	return PRODUCTION_ARCHITECTURE[line].dependsOn;
}
function productionLineLabel(line) {
	return PRODUCTION_ARCHITECTURE[line].label;
}
//#endregion
//#region src/production-lines.ts
/** Project-owned asset graph connecting XYAI Studio's seven production lines. */
const ID$1 = /^[a-f0-9-]{36}$/u;
const LINE_SET = new Set(PRODUCTION_LINES);
var ProductionLineStore = class {
	root;
	projects;
	knowledge;
	indexes;
	connectors;
	constructor(root = dshHomePath("xyai-production-lines"), projects = new ProductionProjectStore(), knowledge = new KnowledgeBaseStore(), indexes = new KnowledgeIndexService(), connectors = new ConnectorInstallStore()) {
		this.root = root;
		this.projects = projects;
		this.knowledge = knowledge;
		this.indexes = indexes;
		this.connectors = connectors;
	}
	async read(projectId) {
		this.assertId(projectId);
		try {
			const parsed = JSON.parse(await readFile(this.file(projectId), "utf8"));
			if (parsed.schema !== "xyai.production-lines.v1" || parsed.projectId !== projectId || !Array.isArray(parsed.assets) || !Array.isArray(parsed.events)) throw new Error("invalid production-line state");
			return parsed;
		} catch (error) {
			if (error.code === "ENOENT") return {
				schema: "xyai.production-lines.v1",
				projectId,
				revision: 0,
				assets: [],
				events: []
			};
			throw error;
		}
	}
	async create(projectId, input) {
		const project = await this.projects.get(projectId);
		if (project.workspacePath === void 0) throw new Error("请先为项目绑定本机工作区");
		if (!LINE_SET.has(input.line)) throw new Error("无效生产线");
		const name = clean(input.name, "产物名称", 120);
		const state = await this.read(projectId);
		const inputIds = [...new Set(input.inputIds ?? [])];
		const inputs = inputIds.map((id) => {
			const asset = state.assets.find((item) => item.id === id);
			if (asset === void 0) throw new Error(`上游资产不存在：${id}`);
			return asset;
		});
		const expected = previous(input.line);
		if (expected !== void 0 && !inputs.some((item) => item.line === expected && item.status === "ready")) throw new Error(`必须先选择已验收的${lineLabel(expected)}产物`);
		const id = randomUUID();
		const now = (/* @__PURE__ */ new Date()).toISOString();
		let reference = typeof input.reference === "string" ? input.reference.trim() : "";
		let status = "ready";
		let metadata = {};
		const directory = join(project.workspacePath, ".xyai", "production-lines", input.line);
		await mkdir(directory, { recursive: true });
		if (input.line === "knowledge") {
			let base = await this.knowledge.get(clean(input.knowledgeBaseId, "知识库", 80));
			const indexStatus = await this.indexes.status(base.id);
			if (indexStatus.documents === 0) throw new Error("知识库尚未建立有效索引");
			base = await this.knowledge.setAccess(base.id, {
				mode: "workspace",
				workspaceIds: [...base.access.workspaceIds, projectId]
			});
			reference = base.id;
			metadata = {
				knowledgeBaseId: base.id,
				indexRevision: indexStatus.revision,
				documents: indexStatus.documents,
				chunks: indexStatus.chunks,
				access: base.access
			};
		} else if (input.line === "data") {
			const source = inputs.find((item) => item.line === "knowledge");
			const base = await this.knowledge.get(String(source.metadata.knowledgeBaseId ?? source.reference));
			const corpus = await this.indexes.exportCorpus(base, {
				kind: "workspace",
				workspaceId: projectId
			});
			const seen = /* @__PURE__ */ new Set();
			const cleaned = corpus.map(distillCorpusItem).filter((item) => item.text.length >= 8).filter((item) => {
				const fingerprint = createHash("sha256").update(item.text).digest("hex");
				if (seen.has(fingerprint)) return false;
				seen.add(fingerprint);
				return true;
			});
			if (cleaned.length === 0) throw new Error("知识资产清洗后没有可导出的语料");
			const datasetDirectory = join(directory, id);
			await mkdir(datasetDirectory, { recursive: true });
			const evaluation = cleaned.filter((item) => Number.parseInt(createHash("sha256").update(item.id).digest("hex").slice(0, 2), 16) % 10 === 0);
			if (evaluation.length === 0 && cleaned.length > 1) evaluation.push(cleaned[cleaned.length - 1]);
			const evaluationIds = new Set(evaluation.map((item) => item.id));
			let training = cleaned.filter((item) => !evaluationIds.has(item.id));
			if (training.length === 0) {
				training = cleaned;
				evaluation.length = 0;
			}
			const trainPath = join(datasetDirectory, "train.jsonl");
			const evaluationPath = join(datasetDirectory, "evaluation.jsonl");
			await writeFile(trainPath, `${training.map((item) => JSON.stringify(item)).join("\n")}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
			await writeFile(evaluationPath, evaluation.length === 0 ? "" : `${evaluation.map((item) => JSON.stringify(item)).join("\n")}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
			reference = join(datasetDirectory, "dataset.json");
			metadata = {
				format: "xyai-instruction-jsonl",
				inputRecords: corpus.length,
				records: cleaned.length,
				removed: corpus.length - cleaned.length,
				trainingRecords: training.length,
				evaluationRecords: evaluation.length,
				qualityGate: {
					minimumCharacters: 8,
					deduplicated: true,
					sourceTraceable: true,
					instructionStructured: true
				},
				files: {
					train: trainPath,
					evaluation: evaluationPath
				},
				sourceKnowledgeAssetId: source.id,
				knowledgeBaseId: base.id
			};
			await writeFile(reference, `${JSON.stringify({
				schema: "xyai.dataset.v1",
				id,
				name,
				projectId,
				...metadata
			}, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
		} else if (input.line === "model") {
			const dataset = inputs.find((item) => item.line === "data");
			metadata = {
				baseModel: clean(input.baseModel, "基础模型", 200),
				dataset: dataset.reference,
				method: "QLoRA",
				quantization: "4-bit",
				trainingRuntime: "optional-local-component"
			};
			if (reference === "" || !isAbsolute(reference) || !await exists(reference)) {
				status = "awaiting-training";
				reference = join(directory, `${id}-training-recipe.json`);
			}
		} else if (input.line === "capability") {
			const installed = (await this.connectors.list()).filter((item) => item.enabled).map((item) => ({
				id: item.id,
				version: item.version,
				contributes: item.manifest?.contributes ?? {
					tools: [],
					skills: [],
					mcpServers: []
				}
			}));
			const modelInput = inputs.find((item) => item.line === "model");
			metadata = {
				...modelInput ? { modelAssetId: modelInput.id } : { modelAssetId: null },
				connectors: installed,
				skillSources: [
					"project",
					"user",
					"enabled-connectors"
				],
				mcpSources: installed.flatMap((item) => item.contributes.mcpServers.map((server) => ({
					connectorId: item.id,
					serverName: server.serverName
				})))
			};
			reference = join(directory, `${id}-capability-bundle.json`);
		} else if (input.line === "agent") {
			metadata = {
				capabilityAssetId: inputs.find((item) => item.line === "capability").id,
				knowledgeAssets: state.assets.filter((item) => item.line === "knowledge" && item.status === "ready").map((item) => item.id)
			};
			if (reference === "" || !isAbsolute(reference) || !await exists(reference)) {
				status = "awaiting-build";
				reference = join(directory, `${id}-agent-blueprint.json`);
			}
		} else if (input.line === "system") {
			metadata = {
				agentAssetId: inputs.find((item) => item.line === "agent").id,
				systemBase: project.systemBase ?? "standalone",
				workspacePath: project.workspacePath
			};
			reference = reference || project.workspacePath;
		} else {
			metadata = {
				systemAssetId: inputs.find((item) => item.line === "system").id,
				assetSnapshot: state.assets.map((item) => ({
					id: item.id,
					line: item.line,
					status: item.status,
					reference: item.reference
				})),
				reviewGate: "required"
			};
			reference = join(directory, `${id}-deployment-manifest.json`);
			status = "ready-for-review";
		}
		const asset = {
			id,
			projectId,
			line: input.line,
			name,
			status,
			inputIds,
			reference,
			metadata,
			createdAt: now,
			updatedAt: now
		};
		await this.writeManifest(asset);
		const next = {
			...state,
			revision: state.revision + 1,
			assets: [...state.assets, asset],
			events: [...state.events, event(asset, "created", `已生成${lineLabel(asset.line)}产物：${asset.name}`)]
		};
		await this.write(next);
		return asset;
	}
	async complete(projectId, assetId, reference) {
		const state = await this.read(projectId);
		const current = state.assets.find((item) => item.id === assetId);
		if (current === void 0) throw new Error("生产线资产不存在");
		if (![
			"awaiting-training",
			"awaiting-build",
			"ready-for-review",
			"needs-revalidation",
			"needs-improvement"
		].includes(current.status)) throw new Error("该资产当前不处于待验收状态");
		const cleanReference = reference.trim();
		if (!isAbsolute(cleanReference) || !await exists(cleanReference)) throw new Error("请选择真实存在的本机产物路径");
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const updated = {
			...current,
			reference: cleanReference,
			status: "ready",
			updatedAt: now
		};
		await this.writeManifest(updated);
		await this.write({
			...state,
			revision: state.revision + 1,
			assets: state.assets.map((item) => item.id === assetId ? updated : item),
			events: [...state.events, event(updated, "completed", `已验收并接通下游：${updated.name}`)]
		});
		return updated;
	}
	async feedback(projectId, assetId, message) {
		const state = await this.read(projectId);
		const current = state.assets.find((item) => item.id === assetId);
		if (current === void 0) throw new Error("生产线资产不存在");
		const value = clean(message, "反馈内容", 1e3);
		const upstream = /* @__PURE__ */ new Set([assetId, ...collectUpstream(state.assets, current.inputIds)]);
		const downstream = new Set(collectDownstream(state.assets, assetId));
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const updated = {
			...current,
			status: "needs-improvement",
			updatedAt: now
		};
		await this.write({
			...state,
			revision: state.revision + 1,
			assets: state.assets.map((item) => upstream.has(item.id) ? {
				...item,
				status: "needs-improvement",
				updatedAt: now
			} : downstream.has(item.id) ? {
				...item,
				status: "needs-revalidation",
				updatedAt: now
			} : item),
			events: [...state.events, event(updated, "feedback", value)]
		});
		return updated;
	}
	file(projectId) {
		this.assertId(projectId);
		return join(this.root, `${projectId}.json`);
	}
	assertId(value) {
		if (!ID$1.test(value)) throw new Error("无效项目 ID");
	}
	async write(value) {
		await mkdir(this.root, { recursive: true });
		const target = this.file(value.projectId);
		const temporary = `${target}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
			await rename(temporary, target);
		} catch (error) {
			await unlink(temporary).catch(() => void 0);
			throw error;
		}
	}
	async writeManifest(asset) {
		if (!isAbsolute(asset.reference) || asset.line === "data" || asset.status === "ready" && await exists(asset.reference)) return;
		await writeFile(asset.reference, `${JSON.stringify({
			schema: "xyai.production-asset.v1",
			...asset
		}, null, 2)}\n`, {
			encoding: "utf8",
			flag: "wx"
		}).catch((error) => {
			if (error.code !== "EEXIST") throw error;
		});
	}
};
const previous = previousProductionLine;
const lineLabel = productionLineLabel;
function clean(value, label, max) {
	if (typeof value !== "string" || value.trim() === "") throw new Error(`${label}不能为空`);
	const result = value.trim();
	if (result.length > max) throw new Error(`${label}过长`);
	return result;
}
async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}
function event(asset, kind, message) {
	return {
		id: randomUUID(),
		kind,
		assetId: asset.id,
		line: asset.line,
		message,
		createdAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
function collectUpstream(assets, ids) {
	const result = /* @__PURE__ */ new Set();
	const visit = (id) => {
		if (result.has(id)) return;
		result.add(id);
		const item = assets.find((asset) => asset.id === id);
		for (const parent of item?.inputIds ?? []) visit(parent);
	};
	for (const id of ids) visit(id);
	return [...result];
}
function collectDownstream(assets, id) {
	const result = /* @__PURE__ */ new Set();
	const visit = (parent) => {
		for (const item of assets) {
			if (!item.inputIds.includes(parent) || result.has(item.id)) continue;
			result.add(item.id);
			visit(item.id);
		}
	};
	visit(id);
	return [...result];
}
function normalizeCorpusText(value) {
	return value.replace(/\r\n?/gu, "\n").replace(/[\t ]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
}
function distillCorpusItem(item) {
	const output = normalizeCorpusText(item.text);
	const title = item.source.title.trim() || "行业资料";
	return {
		...item,
		text: output,
		instruction: `请依据《${title}》中的行业资料，准确说明以下知识要点，并保留关键条件、数值和限制。`,
		output,
		quality: {
			characters: output.length,
			sourceTraceable: true
		}
	};
}
//#endregion
//#region src/production-line-routes.ts
const MAX = 256 * 1024;
function registerProductionLineRoutes(ctx, store = new ProductionLineStore()) {
	return ctx.webServer.register({
		kind: "prefix",
		path: "/api/xyai/production-lines",
		handler: async (req, res) => {
			try {
				const parts = new URL(req.url ?? "/", "http://local").pathname.slice(26).replace(/^\//u, "").split("/").filter(Boolean);
				if (parts.length === 1 && req.method === "GET") {
					reply$2(res, 200, await store.read(decodeURIComponent(parts[0])));
					return;
				}
				if (parts.length === 2 && parts[1] === "assets" && req.method === "POST") {
					reply$2(res, 201, await store.create(decodeURIComponent(parts[0]), await body$2(req)));
					return;
				}
				if (parts.length === 4 && parts[1] === "assets" && parts[3] === "complete" && req.method === "POST") {
					const input = await body$2(req);
					reply$2(res, 200, await store.complete(decodeURIComponent(parts[0]), decodeURIComponent(parts[2]), String(input.reference ?? "")));
					return;
				}
				if (parts.length === 4 && parts[1] === "assets" && parts[3] === "feedback" && req.method === "POST") {
					const input = await body$2(req);
					reply$2(res, 200, await store.feedback(decodeURIComponent(parts[0]), decodeURIComponent(parts[2]), String(input.message ?? "")));
					return;
				}
				reply$2(res, 405, { error: "method-not-allowed" });
			} catch (error) {
				reply$2(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
}
async function body$2(req) {
	const chunks = [];
	let size = 0;
	for await (const raw of req) {
		const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
		size += chunk.length;
		if (size > MAX) throw new Error("请求内容过大");
		chunks.push(chunk);
	}
	return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function reply$2(res, status, value) {
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.end(JSON.stringify(value));
}
//#endregion
//#region src/outcome-contracts.ts
const ID = /^[a-f0-9-]{36}$/u;
const STATUSES = /* @__PURE__ */ new Set([
	"draft",
	"active",
	"accepted",
	"blocked"
]);
const PRIVACY_MODES = /* @__PURE__ */ new Set(["local", "hybrid"]);
const HARDWARE_TIERS = /* @__PURE__ */ new Set([
	"basic",
	"professional",
	"workstation"
]);
function requiredText(value, label, max) {
	if (typeof value !== "string") throw new Error(`${label}必须填写`);
	const result = value.trim();
	if (result === "") throw new Error(`${label}必须填写`);
	if (result.length > max) throw new Error(`${label}过长`);
	return result;
}
function enumValue(value, allowed, label) {
	if (typeof value !== "string" || !allowed.has(value)) throw new Error(`无效的${label}`);
	return value;
}
function parse(value, expectedProjectId) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("无效的结果契约");
	const source = value;
	if (source.schema !== "xyai.outcome-contract.v1") throw new Error("结果契约格式不受支持");
	const projectId = requiredText(source.projectId, "项目ID", 36);
	if (projectId !== expectedProjectId) throw new Error("结果契约与项目不匹配");
	const revision = Number(source.revision);
	if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("无效的结果契约版本");
	const createdAt = requiredText(source.createdAt, "创建时间", 40);
	const updatedAt = requiredText(source.updatedAt, "更新时间", 40);
	if (Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(updatedAt))) throw new Error("无效的结果契约时间");
	const id = requiredText(source.id, "结果契约ID", 36);
	if (!ID.test(id)) throw new Error("无效的结果契约ID");
	return {
		schema: "xyai.outcome-contract.v1",
		id,
		projectId,
		goal: requiredText(source.goal, "生产目标", 500),
		deliverable: requiredText(source.deliverable, "交付物", 500),
		acceptance: requiredText(source.acceptance, "验收标准", 1e3),
		privacy: enumValue(source.privacy, PRIVACY_MODES, "隐私边界"),
		hardwareTier: enumValue(source.hardwareTier, HARDWARE_TIERS, "硬件档位"),
		status: enumValue(source.status, STATUSES, "契约状态"),
		revision,
		createdAt,
		updatedAt
	};
}
function input(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("无效的结果契约内容");
	const source = value;
	return {
		goal: requiredText(source.goal, "生产目标", 500),
		deliverable: requiredText(source.deliverable, "交付物", 500),
		acceptance: requiredText(source.acceptance, "验收标准", 1e3),
		privacy: enumValue(source.privacy, PRIVACY_MODES, "隐私边界"),
		hardwareTier: enumValue(source.hardwareTier, HARDWARE_TIERS, "硬件档位"),
		status: enumValue(source.status, STATUSES, "契约状态")
	};
}
var OutcomeContractStore = class {
	root;
	projects;
	constructor(root = join(new ProductionProjectStore().root, "outcome-contracts"), projects = new ProductionProjectStore()) {
		this.root = root;
		this.projects = projects;
	}
	file(projectId) {
		if (!ID.test(projectId)) throw new Error("无效项目ID");
		return join(this.root, `${projectId}.json`);
	}
	async read(projectId) {
		await this.projects.get(projectId);
		try {
			return parse(JSON.parse(await readFile(this.file(projectId), "utf8")), projectId);
		} catch (error) {
			if (error.code === "ENOENT") return void 0;
			throw error;
		}
	}
	async list() {
		let files;
		try {
			files = (await readdir(this.root)).filter((name) => name.endsWith(".json") && ID.test(name.slice(0, -5)));
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
		return (await Promise.allSettled(files.map(async (name) => await this.read(name.slice(0, -5))))).flatMap((item) => item.status === "fulfilled" && item.value !== void 0 ? [item.value] : []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}
	async save(projectId, value) {
		await this.projects.get(projectId);
		const next = input(value);
		const current = await this.read(projectId);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const contract = {
			schema: "xyai.outcome-contract.v1",
			id: current?.id ?? randomUUID(),
			projectId,
			...next,
			revision: (current?.revision ?? 0) + 1,
			createdAt: current?.createdAt ?? now,
			updatedAt: now
		};
		await mkdir(this.root, { recursive: true });
		const file = this.file(projectId);
		const temporary = `${file}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporary, `${JSON.stringify(contract, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
			await rename(temporary, file);
		} catch (error) {
			await unlink(temporary).catch(() => void 0);
			throw error;
		}
		return contract;
	}
};
//#endregion
//#region src/outcome-contract-routes.ts
const MAX_BODY_BYTES = 256 * 1024;
async function body$1(req) {
	const chunks = [];
	let size = 0;
	for await (const raw of req) {
		const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
		size += chunk.byteLength;
		if (size > MAX_BODY_BYTES) throw new Error("请求内容过大");
		chunks.push(chunk);
	}
	if (size === 0) throw new Error("请求内容不能为空");
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function reply$1(res, status, value) {
	const payload = JSON.stringify(value);
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.end(payload);
}
function registerOutcomeContractRoutes(ctx, store = new OutcomeContractStore()) {
	return ctx.webServer.register({
		kind: "prefix",
		path: "/api/xyai/outcome-contracts",
		handler: async (req, res) => {
			try {
				const suffix = new URL(req.url ?? "/", "http://local").pathname.slice(27).replace(/^\//u, "");
				if (req.method === "GET" && suffix === "") {
					reply$1(res, 200, await store.list());
					return;
				}
				const parts = suffix.split("/").filter(Boolean);
				if (parts.length === 1 && req.method === "GET") {
					reply$1(res, 200, await store.read(decodeURIComponent(parts[0])));
					return;
				}
				if (parts.length === 1 && req.method === "PUT") {
					reply$1(res, 200, await store.save(decodeURIComponent(parts[0]), await body$1(req)));
					return;
				}
				reply$1(res, 405, { error: "method-not-allowed" });
			} catch (error) {
				reply$1(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
}
//#endregion
//#region src/local-training.ts
/** Optional, local-only QLoRA runtime and persistent training jobs. */
const PYTHON_PACKAGES = [
	"transformers>=4.49,<5",
	"datasets>=3,<5",
	"peft>=0.14,<1",
	"trl>=0.15,<1",
	"accelerate>=1.2,<2",
	"safetensors>=0.5,<1",
	"bitsandbytes>=0.45,<1",
	"huggingface-hub>=0.28,<2"
];
var LocalTrainingService = class {
	root;
	lines;
	spawnProcess;
	hardwareDetector;
	children = /* @__PURE__ */ new Map();
	installProcess;
	constructor(root = process.env.XYAI_TRAINING_HOME?.trim() || dshHomePath("xyai-training"), lines = new ProductionLineStore(), spawnProcess = spawn, hardwareDetector = detectHardware) {
		this.root = root;
		this.lines = lines;
		this.spawnProcess = spawnProcess;
		this.hardwareDetector = hardwareDetector;
	}
	async runtime() {
		const hardware = await this.hardwareDetector();
		const profile = trainingHardwareProfile(hardware);
		const python = this.venvPython();
		const hardwareView = {
			gpu: hardware.gpu?.name,
			vramMiB: hardware.gpu?.vramMiB,
			vramFreeMiB: hardware.gpu?.vramFreeMiB,
			memoryGiB: hardware.memoryGiB
		};
		if (!existsSync(python)) return {
			root: this.root,
			installed: false,
			installing: this.installProcess !== void 0,
			cuda: false,
			detail: "尚未安装受控 Python 3.11 与本地调优组件（按需下载，不占主安装包）",
			hardware: hardwareView,
			recommendedTier: profile.label,
			downloadNotice: "预计下载约 3–5GB、安装后占用约 6–10GB；仅在用户确认后安装，至少保留 40GB 系统盘空间。"
		};
		const result = spawnSync(python, ["-c", "import torch,transformers,datasets,peft,trl; print(\"cuda=\" + str(torch.cuda.is_available()).lower())"], {
			encoding: "utf8",
			timeout: 2e4,
			windowsHide: true
		});
		const installed = result.status === 0;
		return {
			root: this.root,
			python,
			installed,
			installing: this.installProcess !== void 0,
			cuda: installed && result.stdout.includes("cuda=true"),
			detail: installed ? "受控 Python 3.11 本地调优组件可用" : String(result.stderr || result.stdout || "训练依赖不完整").trim().slice(0, 500),
			hardware: hardwareView,
			recommendedTier: profile.label
		};
	}
	async install() {
		if (this.installProcess !== void 0) return await this.runtime();
		await mkdir(this.root, { recursive: true });
		const rootDisk = await statfs(this.root);
		if (rootDisk.bavail * rootDisk.bsize < 40 * 1024 ** 3) throw new Error("训练环境安装要求所在磁盘至少保留 40GB 可用空间，请更换训练环境目录");
		const compatible = findCompatiblePython();
		const bootstrap = compatible ?? findAnyPython();
		if (bootstrap === void 0) throw new Error("未找到可用于引导训练环境的 Python；请先安装 Python 或 uv 后重试");
		const args = compatible === void 0 ? bootstrap.args.concat([
			"-m",
			"pip",
			"install",
			"--target",
			join(this.root, "uv-bootstrap"),
			"uv"
		]) : compatible.args.concat([
			"-m",
			"venv",
			this.venvRoot()
		]);
		const child = this.spawnProcess(bootstrap.command, args, {
			windowsHide: true,
			stdio: "ignore"
		});
		this.installProcess = child;
		child.once("exit", (code) => {
			this.installProcess = void 0;
			if (code !== 0) return;
			const createRuntime = compatible === void 0 ? this.spawnProcess(bootstrap.command, [
				...bootstrap.args,
				"-m",
				"uv",
				"venv",
				"--python",
				"3.11",
				"--python-preference",
				"only-managed",
				this.venvRoot()
			], {
				windowsHide: true,
				stdio: "ignore",
				env: {
					...process.env,
					PYTHONPATH: join(this.root, "uv-bootstrap"),
					UV_PYTHON_INSTALL_DIR: join(this.root, "managed-python")
				}
			}) : void 0;
			const installTorch = () => {
				const torch = this.spawnProcess(this.venvPython(), [
					"-m",
					"pip",
					"install",
					"torch>=2.8,<3",
					"--index-url",
					"https://download.pytorch.org/whl/cu128"
				], {
					windowsHide: true,
					stdio: "ignore"
				});
				this.installProcess = torch;
				torch.once("exit", (torchCode) => {
					if (torchCode !== 0) {
						this.installProcess = void 0;
						return;
					}
					const dependencies = this.spawnProcess(this.venvPython(), [
						"-m",
						"pip",
						"install",
						...PYTHON_PACKAGES
					], {
						windowsHide: true,
						stdio: "ignore"
					});
					this.installProcess = dependencies;
					dependencies.once("exit", () => {
						this.installProcess = void 0;
					});
				});
			};
			const upgradePip = () => {
				const ensure = this.spawnProcess(this.venvPython(), [
					"-m",
					"ensurepip",
					"--upgrade"
				], {
					windowsHide: true,
					stdio: "ignore"
				});
				this.installProcess = ensure;
				ensure.once("exit", (ensureCode) => {
					if (ensureCode !== 0) {
						this.installProcess = void 0;
						return;
					}
					const pip = this.spawnProcess(this.venvPython(), [
						"-m",
						"pip",
						"install",
						"--upgrade",
						"pip"
					], {
						windowsHide: true,
						stdio: "ignore"
					});
					this.installProcess = pip;
					pip.once("exit", (pipCode) => {
						if (pipCode !== 0) this.installProcess = void 0;
						else installTorch();
					});
				});
			};
			if (createRuntime !== void 0) {
				this.installProcess = createRuntime;
				createRuntime.once("exit", (createCode) => {
					if (createCode !== 0) this.installProcess = void 0;
					else upgradePip();
				});
				return;
			}
			upgradePip();
		});
		return await this.runtime();
	}
	async list(projectId) {
		return (await this.readJobs()).jobs.filter((job) => projectId === void 0 || job.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}
	async start(projectId, assetId, overrides = {}) {
		const runtime = await this.runtime();
		if (!runtime.installed || runtime.python === void 0) throw new Error("请先安装本地调优组件");
		if ((await this.list()).some((job) => job.status === "queued" || job.status === "running")) throw new Error("为保护本机资源，一次只能运行一个训练任务");
		if (runtime.hardware?.vramMiB !== void 0 && (runtime.hardware.vramFreeMiB ?? 0) < Math.min(6e3, runtime.hardware.vramMiB * .7)) throw new Error("当前可用显存不足；请先关闭占用 GPU 的程序再开始训练");
		const asset = await this.modelAsset(projectId, assetId);
		if (asset.status !== "awaiting-training" && asset.status !== "needs-improvement") throw new Error("该模型资产当前不需要训练");
		const recipe = await this.recipe(asset, overrides);
		const id = randomUUID();
		const jobDirectory = join(dirname(asset.reference), `${asset.id}-training`, id);
		await mkdir(jobDirectory, { recursive: true });
		recipe.outputDirectory = join(jobDirectory, "adapter");
		recipe.cacheDirectory = join(jobDirectory, "model-cache");
		await this.assertDiskBudget(jobDirectory, recipe.baseModel);
		const recipePath = join(jobDirectory, "recipe.json");
		const logPath = join(jobDirectory, "training.log");
		await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`, "utf8");
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const job = {
			id,
			projectId,
			assetId,
			name: asset.name,
			status: "queued",
			progress: 0,
			stage: "正在准备训练",
			outputDirectory: recipe.outputDirectory,
			logPath,
			createdAt: now,
			updatedAt: now
		};
		await this.upsert(job);
		this.launch(job, runtime.python, recipePath);
		return job;
	}
	async stop(id) {
		const job = await this.get(id);
		const child = this.children.get(id);
		if (child !== void 0 && child.pid !== void 0) if (process.platform === "win32") spawnSync("taskkill.exe", [
			"/pid",
			String(child.pid),
			"/t",
			"/f"
		], { windowsHide: true });
		else child.kill("SIGTERM");
		this.children.delete(id);
		return await this.upsert({
			...job,
			status: "stopped",
			stage: "已停止，可从检查点恢复",
			pid: void 0,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
	async resume(id) {
		const current = await this.get(id);
		if (![
			"stopped",
			"failed",
			"interrupted"
		].includes(current.status)) throw new Error("只有已停止、失败或中断的任务可以恢复");
		const runtime = await this.runtime();
		if (!runtime.installed || runtime.python === void 0) throw new Error("本地调优组件不可用");
		const recipePath = join(dirname(current.logPath), "recipe.json");
		const resumed = await this.upsert({
			...current,
			status: "queued",
			stage: "正在从最近检查点恢复",
			error: void 0,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		this.launch(resumed, runtime.python, recipePath, true);
		return resumed;
	}
	async log(id, tail = 4e4) {
		const job = await this.get(id);
		try {
			return (await readFile(job.logPath, "utf8")).slice(-Math.max(1e3, Math.min(tail, 2e5)));
		} catch {
			return "";
		}
	}
	launch(job, python, recipePath, resume = false) {
		const script = trainingScriptPath();
		if (!existsSync(script)) {
			this.fail(job, `训练脚本不存在：${script}`);
			return;
		}
		const output = createWriteStream(job.logPath, { flags: "a" });
		const child = this.spawnProcess(python, [
			script,
			"--recipe",
			recipePath,
			...resume ? ["--resume"] : []
		], {
			windowsHide: true,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		this.children.set(job.id, child);
		this.upsert({
			...job,
			status: "running",
			stage: resume ? "正在恢复训练" : "正在训练",
			pid: child.pid,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		let buffer = "";
		child.stdout?.on("data", (chunk) => {
			const text = String(chunk);
			output.write(text);
			buffer += text;
			const lines = buffer.split(/\r?\n/u);
			buffer = lines.pop() ?? "";
			for (const line of lines) this.consumeProgress(job.id, line);
		});
		child.stderr?.on("data", (chunk) => output.write(String(chunk)));
		child.once("exit", (code) => {
			output.end();
			this.children.delete(job.id);
			this.get(job.id).then((current) => {
				if (current.status === "stopped") return;
				if (code === 0) return this.succeed(job.id);
				return this.failById(job.id, code === null ? "训练进程被中断" : `训练进程退出（代码 ${String(code)}）`);
			});
		});
	}
	consumeProgress(id, line) {
		if (!line.startsWith("XYAI_EVENT ")) return;
		try {
			const event = JSON.parse(line.slice(11));
			this.get(id).then((job) => this.upsert({
				...job,
				progress: clamp(event.progress ?? job.progress, 0, 99),
				stage: event.stage ?? job.stage,
				checkpoint: event.checkpoint ?? job.checkpoint,
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			}));
		} catch {}
	}
	async succeed(id) {
		const job = await this.get(id);
		if (!await pathExists(join(job.outputDirectory, "adapter_config.json"))) {
			await this.failById(id, "训练结束但未生成有效 LoRA Adapter");
			return;
		}
		try {
			if (JSON.parse(await readFile(join(job.outputDirectory, "xyai-evaluation.json"), "utf8")).passed !== true) {
				await this.failById(id, "留出集评测未通过，产物未进入能力生产线");
				return;
			}
		} catch {
			await this.failById(id, "缺少训练评测报告，产物未进入能力生产线");
			return;
		}
		await this.lines.complete(job.projectId, job.assetId, job.outputDirectory);
		await this.upsert({
			...job,
			status: "succeeded",
			progress: 100,
			stage: "训练完成，已登记模型产物并接通能力生产线",
			pid: void 0,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
	async fail(job, error) {
		await this.upsert({
			...job,
			status: "failed",
			stage: "训练失败",
			error,
			pid: void 0,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
	async failById(id, error) {
		await this.fail(await this.get(id), error);
	}
	async modelAsset(projectId, assetId) {
		const asset = (await this.lines.read(projectId)).assets.find((item) => item.id === assetId);
		if (asset === void 0 || asset.line !== "model") throw new Error("模型生产线资产不存在");
		return asset;
	}
	async recipe(asset, values) {
		const baseModel = String(asset.metadata.baseModel ?? "").trim();
		if (baseModel.toLowerCase().endsWith(".gguf")) throw new Error("GGUF 是推理格式，不能直接作为 QLoRA 训练底模；请选择 Hugging Face 模型目录或仓库");
		const datasetManifest = JSON.parse(await readFile(String(asset.metadata.dataset), "utf8"));
		if (datasetManifest.files?.train === void 0) throw new Error("训练语料清单无效");
		const profile = trainingHardwareProfile(await this.hardwareDetector());
		if (!profile.supported) throw new Error(profile.reason);
		if (profile.maxParametersB !== void 0 && inferredParameters(baseModel) > profile.maxParametersB) throw new Error(`${profile.label}建议训练不超过 ${String(profile.maxParametersB)}B 的模型；当前底模可能超出显存安全范围`);
		return {
			baseModel,
			trainFile: datasetManifest.files.train,
			evaluationFile: datasetManifest.files.evaluation,
			outputDirectory: "",
			cacheDirectory: "",
			epochs: bounded(values.epochs, 1, 10, 2),
			maxSteps: profile.maxSteps,
			learningRate: bounded(values.learningRate, 1e-6, .01, 2e-4),
			batchSize: bounded(values.batchSize, 1, profile.batchSize, profile.batchSize),
			gradientAccumulation: bounded(values.gradientAccumulation, 1, 128, profile.gradientAccumulation),
			maxSequenceLength: bounded(values.maxSequenceLength, 256, profile.maxSequenceLength, profile.maxSequenceLength),
			loraRank: bounded(values.loraRank, 4, profile.loraRank, profile.loraRank),
			loraAlpha: bounded(values.loraAlpha, 8, profile.loraRank * 2, profile.loraRank * 2)
		};
	}
	async get(id) {
		const job = (await this.readJobs()).jobs.find((item) => item.id === id);
		if (job === void 0) throw new Error("训练任务不存在");
		return job;
	}
	async assertDiskBudget(directory, baseModel) {
		await mkdir(directory, { recursive: true });
		const disk = await statfs(directory);
		const freeGiB = disk.bavail * disk.bsize / 1024 ** 3;
		const parameters = inferredParameters(baseModel);
		const requiredGiB = isAbsolute(baseModel) ? 8 : Math.max(12, parameters * 2.5 + 8);
		if (freeGiB < requiredGiB) throw new Error(`训练工作区可用空间仅 ${freeGiB.toFixed(1)}GB，当前任务至少需要约 ${requiredGiB.toFixed(1)}GB`);
	}
	async upsert(job) {
		const data = await this.readJobs();
		const jobs = data.jobs.some((item) => item.id === job.id) ? data.jobs.map((item) => item.id === job.id ? job : item) : [...data.jobs, job];
		await this.writeJobs({
			schema: "xyai.training-jobs.v1",
			jobs
		});
		return job;
	}
	async readJobs() {
		try {
			const value = JSON.parse(await readFile(join(this.root, "jobs.json"), "utf8"));
			for (const job of value.jobs) if (job.status === "running" && !this.children.has(job.id)) {
				job.status = "interrupted";
				job.stage = "应用重启，等待从检查点恢复";
				job.pid = void 0;
			}
			return value;
		} catch (error) {
			if (error.code === "ENOENT") return {
				schema: "xyai.training-jobs.v1",
				jobs: []
			};
			throw error;
		}
	}
	async writeJobs(value) {
		await mkdir(this.root, { recursive: true });
		const target = join(this.root, "jobs.json");
		const temporary = `${target}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
			await rename(temporary, target);
		} catch (error) {
			await unlink(temporary).catch(() => void 0);
			throw error;
		}
	}
	venvRoot() {
		return join(this.root, "runtime");
	}
	venvPython() {
		return process.platform === "win32" ? join(this.venvRoot(), "Scripts", "python.exe") : join(this.venvRoot(), "bin", "python");
	}
};
function findCompatiblePython() {
	return findPython(true);
}
function findAnyPython() {
	return findPython(false);
}
function findPython(requireCompatible) {
	const candidates = process.platform === "win32" ? [
		{
			command: "py.exe",
			args: ["-3.11"]
		},
		{
			command: "py.exe",
			args: ["-3.12"]
		},
		{
			command: "python.exe",
			args: []
		}
	] : [
		{
			command: "python3.11",
			args: []
		},
		{
			command: "python3.12",
			args: []
		},
		{
			command: "python3",
			args: []
		},
		{
			command: "python",
			args: []
		}
	];
	for (const candidate of candidates) {
		const result = spawnSync(candidate.command, [
			...candidate.args,
			"-c",
			"import sys; print(f\"{sys.version_info.major}.{sys.version_info.minor}\")"
		], {
			encoding: "utf8",
			windowsHide: true,
			timeout: 5e3
		});
		if (result.status === 0 && (!requireCompatible || /^(3\.11|3\.12)/u.test(result.stdout.trim()))) return candidate;
	}
}
function trainingHardwareProfile(hardware) {
	const vram = hardware.gpu?.vramMiB ?? 0;
	if (hardware.gpu === void 0 || vram < 6e3) return {
		supported: false,
		label: "仅数据蒸馏",
		reason: "本机可进行数据清洗和蒸馏，但低于 6GB 显存不建议执行 QLoRA",
		batchSize: 1,
		gradientAccumulation: 32,
		maxSequenceLength: 512,
		loraRank: 4,
		maxSteps: 100
	};
	if (vram < 1e4) return {
		supported: true,
		label: "8GB 安全档：0.5B–3B QLoRA",
		reason: "",
		maxParametersB: 3,
		batchSize: 1,
		gradientAccumulation: 16,
		maxSequenceLength: 1024,
		loraRank: 8,
		maxSteps: 300
	};
	if (vram < 16e3) return {
		supported: true,
		label: "12GB 平衡档：不超过 4B QLoRA",
		reason: "",
		maxParametersB: 4,
		batchSize: 1,
		gradientAccumulation: 12,
		maxSequenceLength: 2048,
		loraRank: 16,
		maxSteps: 500
	};
	return {
		supported: true,
		label: "16GB+ 性能档：不超过 7B QLoRA",
		reason: "",
		maxParametersB: 7,
		batchSize: 2,
		gradientAccumulation: 8,
		maxSequenceLength: 4096,
		loraRank: 32,
		maxSteps: 1e3
	};
}
function inferredParameters(value) {
	const matches = [...value.matchAll(/(?:^|[-_ ])(\d+(?:\.\d+)?)b(?:[-_ ]|$)/giu)];
	return Number(matches.at(-1)?.[1] ?? 0);
}
function trainingScriptPath() {
	return process.env.XYAI_TRAINING_SCRIPT ?? (process.resourcesPath === void 0 ? join(process.cwd(), "resources", "training", "xyai_qlora_train.py") : join(process.resourcesPath, "training", "xyai_qlora_train.py"));
}
function bounded(value, min, max, fallback) {
	return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}
function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}
async function pathExists(value) {
	try {
		await stat(value);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region src/local-training-routes.ts
const PREFIX = "/api/xyai/training";
const MAX_BODY = 64 * 1024;
function registerLocalTrainingRoutes(ctx, service = new LocalTrainingService()) {
	return ctx.webServer.register({
		kind: "prefix",
		path: PREFIX,
		handler: async (req, res) => {
			try {
				const url = new URL(req.url ?? "/", "http://local");
				const parts = url.pathname.slice(18).replace(/^\//u, "").split("/").filter(Boolean).map(decodeURIComponent);
				if (parts.length === 1 && parts[0] === "runtime" && req.method === "GET") return reply(res, 200, await service.runtime());
				if (parts.length === 2 && parts[0] === "runtime" && parts[1] === "install" && req.method === "POST") return reply(res, 202, await service.install());
				if (parts.length === 1 && parts[0] === "jobs" && req.method === "GET") return reply(res, 200, await service.list(url.searchParams.get("projectId") ?? void 0));
				if (parts.length === 1 && parts[0] === "jobs" && req.method === "POST") {
					const input = await body(req);
					return reply(res, 201, await service.start(String(input.projectId ?? ""), String(input.assetId ?? ""), numericOptions(input)));
				}
				if (parts.length === 3 && parts[0] === "jobs" && parts[2] === "stop" && req.method === "POST") return reply(res, 200, await service.stop(parts[1]));
				if (parts.length === 3 && parts[0] === "jobs" && parts[2] === "resume" && req.method === "POST") return reply(res, 200, await service.resume(parts[1]));
				if (parts.length === 3 && parts[0] === "jobs" && parts[2] === "log" && req.method === "GET") return reply(res, 200, { log: await service.log(parts[1]) });
				return reply(res, 405, { error: "method-not-allowed" });
			} catch (error) {
				return reply(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
}
function numericOptions(input) {
	const result = {};
	for (const key of [
		"epochs",
		"learningRate",
		"batchSize",
		"gradientAccumulation",
		"maxSequenceLength",
		"loraRank",
		"loraAlpha"
	]) if (typeof input[key] === "number") result[key] = input[key];
	return result;
}
async function body(req) {
	const chunks = [];
	let size = 0;
	for await (const raw of req) {
		const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
		size += chunk.length;
		if (size > MAX_BODY) throw new Error("请求内容过大");
		chunks.push(chunk);
	}
	return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function reply(res, status, value) {
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.end(JSON.stringify(value));
}
//#endregion
//#region src/skill-workspace.ts
/** Stable Cordis plugin name. */
const name = "xyai-skill-workspace";
/** Services required before the routes can register. */
const inject = [
	"webServer",
	"credentials",
	"tools",
	"skills"
];
/** Register the skill workspace service and its HTTP routes. */
function apply(ctx) {
	const service = new SkillWorkspaceService(ctx);
	const connectorInstalls = new ConnectorInstallStore();
	const connectorTools = new ConnectorToolRuntime(ctx, connectorInstalls);
	ctx.effect(async () => {
		await connectorTools.refresh();
		return () => connectorTools.dispose();
	}, "xyai-connectors: runtime tools");
	ctx.effect(() => registerSkillRoutes(ctx, service), "xyai-skill-workspace: routes");
	ctx.effect(() => registerProductionProjectRoutes(ctx), "xyai-production-projects: routes");
	ctx.effect(() => registerConnectorRoutes(ctx, connectorInstalls, void 0, async () => await connectorTools.refresh()), "xyai-connectors: routes");
	const knowledgeIndex = new KnowledgeIndexService(void 0, { deepParser: createLocalKnowledgeParser() });
	const imaGateway = createImaGateway(ctx);
	const cloudDriveGateway = createCloudDriveGateway(ctx);
	const knowledgeAudit = new KnowledgeAuditLog();
	ctx.effect(() => registerKnowledgeBaseRoutes(ctx, void 0, knowledgeIndex, imaGateway, cloudDriveGateway, knowledgeAudit), "xyai-knowledge-bases: routes with tree, background index, ima, cloud drive and audit");
	ctx.effect(() => registerKnowledgeTools(ctx, void 0, void 0, imaGateway), "xyai-knowledge-bases: discovery, cited search and ima tools");
	ctx.effect(() => registerProductionLineRoutes(ctx), "xyai-production-lines: asset graph and handoffs");
	ctx.effect(() => registerOutcomeContractRoutes(ctx), "xyai-outcome-contracts: goal-driven production");
	ctx.effect(() => registerLocalTrainingRoutes(ctx), "xyai-local-training: optional runtime and QLoRA jobs");
}
//#endregion
export { apply, inject, name };

//# sourceMappingURL=skill-workspace.js.map
