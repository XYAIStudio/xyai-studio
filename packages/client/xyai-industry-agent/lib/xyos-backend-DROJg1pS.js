import { fileURLToPath } from "node:url";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
//#region src/builtin-agents.ts
/** Install XYAI Studio's audited sample agents into the local DSH user roots. */
const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/;
function readState(filename) {
	try {
		const parsed = JSON.parse(readFileSync(filename, "utf8"));
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
			const seen = parsed.seen;
			if (Array.isArray(seen) && seen.every((value) => typeof value === "string")) return {
				schemaVersion: 1,
				seen: [...new Set(seen)]
			};
		}
	} catch {}
	return {
		schemaVersion: 1,
		seen: []
	};
}
function writeState(filename, state) {
	mkdirSync(dirname(filename), { recursive: true });
	const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
	renameSync(temporary, filename);
}
function discoverBuiltinPackages(root) {
	if (!existsSync(root)) return [];
	const found = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const packageDir = join(root, entry.name, "package");
		const manifestFile = join(packageDir, "manifest.json");
		if (!existsSync(manifestFile)) continue;
		const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
		if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error(`builtin agent ${entry.name} has an invalid manifest`);
		const record = manifest;
		const id = typeof record.id === "string" ? record.id : "";
		const name = typeof record.name === "string" ? record.name : id;
		if (!PRESET_ID.test(id)) throw new Error(`builtin agent ${entry.name} has invalid DSH preset id ${JSON.stringify(id)}`);
		for (const required of [
			"persona.md",
			join("skill", "SKILL.md"),
			join("knowledge", "知识架构树.md")
		]) if (!existsSync(join(packageDir, required))) throw new Error(`builtin agent ${id} is missing ${required}`);
		found.push({
			packageDir,
			manifest: record,
			id,
			name
		});
	}
	return found.sort((left, right) => left.id.localeCompare(right.id));
}
function atomicDirectory(target, build) {
	if (existsSync(target)) return false;
	mkdirSync(dirname(target), { recursive: true });
	const stage = join(dirname(target), `.${target.split(/[\\/]/).pop()}.xyai-${process.pid}-${Date.now()}`);
	rmSync(stage, {
		recursive: true,
		force: true
	});
	try {
		mkdirSync(stage, { recursive: true });
		build(stage);
		renameSync(stage, target);
		return true;
	} finally {
		rmSync(stage, {
			recursive: true,
			force: true
		});
	}
}
function buildAgentCordis(persona) {
	return [
		"# XYAI Studio 内置示例智能体；复制后可自由修改。",
		"- id: identity",
		"  name: cordis:group",
		"  group: true",
		"  isolate:",
		"    persona: true",
		"  config:",
		"    - id: persona",
		"      name: '@deepseek-ai/dsh-persona'",
		"      config:",
		"        text: |-",
		persona.split("\n").map((line) => line === "" ? "" : `          ${line}`).join("\n"),
		"",
		"- id: skill-filesystem",
		"  name: '@deepseek-ai/dsh-skill-filesystem'",
		"",
		"- id: tool-skill",
		"  name: '@deepseek-ai/dsh-tool-skill'",
		"",
		"- id: tool-fs",
		"  name: '@deepseek-ai/dsh-tool-fs'",
		"",
		"- id: tool-web",
		"  name: '@deepseek-ai/dsh-tool-web'",
		"  config:",
		"    fetch: false",
		"    searchTimeoutMs: 60000",
		""
	].join("\n");
}
function installSkill(pkg, target) {
	return atomicDirectory(target, (stage) => {
		cpSync(join(pkg.packageDir, "skill", "SKILL.md"), join(stage, "SKILL.md"));
		cpSync(join(pkg.packageDir, "knowledge"), join(stage, "knowledge"), { recursive: true });
		if (existsSync(join(pkg.packageDir, "production"))) cpSync(join(pkg.packageDir, "production"), join(stage, "production"), { recursive: true });
		for (const file of ["manifest.json", "persona.md"]) cpSync(join(pkg.packageDir, file), join(stage, file));
	});
}
function installPreset(pkg, target) {
	return atomicDirectory(target, (stage) => {
		const persona = readFileSync(join(pkg.packageDir, "persona.md"), "utf8");
		const description = typeof pkg.manifest.description === "string" ? pkg.manifest.description : "";
		writeFileSync(join(stage, "agent.cordis.yml"), buildAgentCordis(persona), "utf8");
		writeFileSync(join(stage, "preset.yml"), `name: ${JSON.stringify(pkg.name)}\ndescription: ${JSON.stringify(description)}\n`, "utf8");
	});
}
/** Resolve development samples or the clean extraResources copy in a packaged app. */
function resolveBuiltinAgentsRoot(moduleUrl = import.meta.url, resourcesPath = process.resourcesPath) {
	if (resourcesPath !== void 0) {
		const packaged = join(resourcesPath, "builtin-agents");
		if (existsSync(packaged)) return packaged;
	}
	return fileURLToPath(new URL("../examples/production-line-samples", moduleUrl));
}
/**
* Seed missing built-ins exactly once. Existing directories are never overwritten;
* a sample removed after first install stays removed because the state remembers it.
*/
function installBuiltinAgents(options) {
	const packages = discoverBuiltinPackages(options.sourceRoot);
	const state = readState(options.stateFile);
	const seen = new Set(state.seen);
	const results = [];
	for (const pkg of packages) {
		const skillTarget = join(options.dshHome, "skills", pkg.id);
		const presetTarget = join(options.dshHome, ".agent-presets", pkg.id);
		const wasSeen = seen.has(pkg.id);
		const skill = existsSync(skillTarget) ? "preserved" : wasSeen ? "previously-removed" : installSkill(pkg, skillTarget) ? "installed" : "preserved";
		const preset = existsSync(presetTarget) ? "preserved" : wasSeen ? "previously-removed" : installPreset(pkg, presetTarget) ? "installed" : "preserved";
		seen.add(pkg.id);
		results.push({
			id: pkg.id,
			name: pkg.name,
			skill,
			preset
		});
	}
	writeState(options.stateFile, {
		schemaVersion: 1,
		seen: [...seen].sort()
	});
	return results;
}
//#endregion
//#region src/xyos-backend.ts
/** XYAI Studio — XYOS business backend spawn, readiness, and reuse. */
/** 云端业务空间（行业合伙人测试预览版：不占本机空间，体验官方最新版）。 */
const XYAI_CLOUD_ORIGIN = "https://os.cnxy.tech";
/** 本地 XYOS 业务后端默认地址（端口 3030）。 */
const XYOS_ORIGIN = "http://127.0.0.1:3030";
const READINESS_PREFIX = "xyos backend: ";
const READINESS_TIMEOUT_MS = 9e4;
/**
* 解析业务空间模式：
* 1. 环境变量 XYOS_MODE 优先（开发调试）；
* 2. 安装器写入的 install-config.json（用户安装时选择）；
* 3. 默认：存在本地后端目录则 local，否则 cloud。
*/
function resolveXyosMode() {
	if (process.env.XYOS_MODE === "cloud") return "cloud";
	if (process.env.XYOS_MODE === "local") return "local";
	const resourcesPath = typeof process.resourcesPath === "string" ? process.resourcesPath : void 0;
	try {
		const configPath = resourcesPath === void 0 ? void 0 : join(resourcesPath, "install-config.json");
		if (configPath !== void 0 && existsSync(configPath)) {
			const config = JSON.parse(readFileSync(configPath, "utf8"));
			if (config.xyosMode === "cloud") return "cloud";
			if (config.xyosMode === "local") return "local";
		}
	} catch {}
	if (resourcesPath !== void 0 && existsSync(join(resourcesPath, "xyos-backend", "server.ts"))) return "local";
	if (existsSync(join(resolveXyosBackendDir(), "server.ts"))) return "local";
	return "cloud";
}
/**
* 解析 XYOS 本地后端目录：
* 1. 环境变量 XYOS_BACKEND_DIR 优先；
* 2. 打包后 = 安装目录 resources/xyos-backend（二级目录，随安装包分发）；
* 3. 开发期回退到 workspace 根目录下的 xyos-backend 源码。
*/
function resolveXyosBackendDir() {
	const override = process.env.XYOS_BACKEND_DIR;
	if (override) return override;
	if (typeof process.resourcesPath === "string") {
		const packaged = join(process.resourcesPath, "xyos-backend");
		if (existsSync(join(packaged, "server.ts"))) return packaged;
	}
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const candidates = [resolve(moduleDir, "..", "..", "xyos-backend"), resolve(moduleDir, "..", "..", "..", "xyos-backend")];
	for (const dir of candidates) if (existsSync(join(dir, "server.ts"))) return dir;
	return join(process.cwd(), "xyos-backend");
}
/**
* 让本地后端复用桌面端已打包的 DSH 运行时（app.asar.unpacked/node_modules）。
* 后端源码通过 node_modules/@deepseek-ai junction 指向 DSH 部署；打包安装时该
* junction 无法跨机器复制，故在运行时重建一个 junction 指向桌面端自带的
* @deepseek-ai 运行时（含 chokidar 等提升依赖）。这样后端无需重复打包 200MB+ 的
* DSH 生态，也不会与后端自身依赖（express/sql.js 等）产生版本冲突。
*/
function ensureDshRuntimeLink(backendDir) {
	const linkPath = join(backendDir, "node_modules", "@deepseek-ai");
	const target = join(process.resourcesPath ?? "", "app.asar.unpacked", "node_modules", "@deepseek-ai");
	if (!existsSync(target)) return;
	try {
		if (lstatSync(linkPath).isSymbolicLink()) return;
		rmSync(linkPath, {
			recursive: true,
			force: true
		});
	} catch {}
	try {
		symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
	} catch (cause) {
		process.stderr.write(`dsh-plugin-desktop: failed to link DSH runtime for XYOS backend: ${cause instanceof Error ? cause.message : String(cause)}\n`);
	}
}
/** Probe whether 3030 already serves a healthy XYOS backend. */
async function probeHealthyBackend() {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 3e3);
	try {
		const res = await fetch(`${XYOS_ORIGIN}/api/health`, { signal: controller.signal });
		if (!res.ok) return false;
		return (await res.json().catch(() => null))?.status === "ready";
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}
/**
* Start (or reuse) the XYOS backend and resolve once it reports ready.
* The server prints `xyos backend: http://127.0.0.1:3030` on stdout when ready.
* @param nodeExecutable - Node-compatible executable（打包后传 Electron 内嵌 Node）。
* @returns the loopback origin plus a disposer that stops an owned child.
*/
async function startXyosBackend(nodeExecutable = "node") {
	const bridgeToken = process.env.XYOS_BRIDGE_TOKEN ?? randomBytes(32).toString("hex");
	process.env.XYOS_BRIDGE_TOKEN = bridgeToken;
	if (await probeHealthyBackend()) return {
		origin: XYOS_ORIGIN,
		bridgeToken,
		dispose: () => {}
	};
	const backendDir = resolveXyosBackendDir();
	ensureDshRuntimeLink(backendDir);
	const tsxCli = join(backendDir, "node_modules", "tsx", "dist", "cli.mjs");
	if (!existsSync(tsxCli)) throw new Error(`XYOS backend runtime is incomplete: missing ${tsxCli}`);
	const child = spawn(nodeExecutable, [tsxCli, "server.ts"], {
		cwd: backendDir,
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			PORT: "3030",
			JWT_SECRET: process.env.XYOS_JWT_SECRET ?? "xyos-studio-dev-jwt-2026",
			COOKIE_SECRET: process.env.XYOS_COOKIE_SECRET ?? "xyos-studio-dev-cookie-2026",
			AIR_GAP_MODE: process.env.XYOS_AIR_GAP_MODE ?? "false",
			ENABLE_H2A2A2H_SHADOW: process.env.XYOS_ENABLE_H2A2A2H_SHADOW ?? "true",
			PUBLIC_REGISTRATION_ENABLED: process.env.XYOS_PUBLIC_REGISTRATION_ENABLED ?? "true",
			XYOS_BRIDGE_TOKEN: bridgeToken,
			XYAI_BUILTIN_AGENTS_DIR: process.env.XYAI_BUILTIN_AGENTS_DIR ?? resolveBuiltinAgentsRoot()
		},
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		],
		windowsHide: true
	});
	await waitForReadiness(child);
	return {
		origin: XYOS_ORIGIN,
		bridgeToken,
		dispose: () => {
			child.kill("SIGTERM");
		}
	};
}
/** Resolve once the backend stdout emits its readiness line, or reject on timeout/exit. */
function waitForReadiness(child) {
	return new Promise((resolve, reject) => {
		let output = "";
		const settle = (fn) => {
			clearTimeout(timer);
			fn();
		};
		const timer = setTimeout(() => {
			settle(() => reject(/* @__PURE__ */ new Error(`XYOS backend readiness timed out after ${String(READINESS_TIMEOUT_MS)}ms\n${output}`)));
			child.kill("SIGTERM");
		}, READINESS_TIMEOUT_MS);
		child.stdout?.on("data", (chunk) => {
			output = (output + chunk.toString()).slice(-32768);
			if (output.includes(READINESS_PREFIX)) settle(() => resolve());
		});
		child.stderr?.on("data", (chunk) => {
			output = (output + chunk.toString()).slice(-32768);
		});
		child.once("error", (cause) => {
			settle(() => reject(cause));
		});
		child.once("exit", (code, signal) => {
			settle(() => reject(/* @__PURE__ */ new Error(`XYOS backend exited before readiness (code ${String(code)}, signal ${String(signal)})\n${output}`)));
		});
	});
}
//#endregion
export { startXyosBackend as a, resolveXyosMode as i, XYOS_ORIGIN as n, installBuiltinAgents as o, resolveXyosBackendDir as r, resolveBuiltinAgentsRoot as s, XYAI_CLOUD_ORIGIN as t };

//# sourceMappingURL=xyos-backend-DROJg1pS.js.map