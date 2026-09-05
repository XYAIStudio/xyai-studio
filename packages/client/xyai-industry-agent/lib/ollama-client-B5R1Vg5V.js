import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { homedir } from "node:os";
//#region src/ollama-client.ts
/** Freework Ollama 客户端：与 Ollama API 交互（模型列表、下载、删除、健康检查）。 */
/** Ollama API 客户端。 */
var OllamaClient = class {
	endpoint;
	constructor(endpoint = "http://localhost:11434") {
		this.endpoint = endpoint;
	}
	/** 获取已安装模型列表。 */
	async listModels() {
		try {
			return ((await this.get("/api/tags")).models ?? []).map((model) => ({
				name: model.name,
				size: model.size,
				modifiedAt: new Date(model.modified_at).getTime(),
				details: model.details
			}));
		} catch {
			return this.listManifestModels();
		}
	}
	/** Ollama 未运行时从其本地 manifest 目录恢复可选择的已安装模型。 */
	listManifestModels() {
		const root = join(homedir(), ".ollama", "models", "manifests");
		if (!existsSync(root)) return [];
		const files = [];
		const visit = (directory) => {
			for (const entry of readdirSync(directory, { withFileTypes: true })) {
				const target = join(directory, entry.name);
				if (entry.isDirectory()) visit(target);
				else if (entry.isFile()) files.push(target);
			}
		};
		try {
			visit(root);
		} catch {
			return [];
		}
		return files.flatMap((file) => {
			const parts = relative(root, file).split(sep).filter(Boolean);
			if (parts.length < 4) return [];
			const tag = parts.at(-1);
			const namespaceStart = parts[1] === "library" ? 2 : 1;
			const model = parts.slice(namespaceStart, -1).join("/");
			if (tag === void 0 || model === "") return [];
			return [{
				name: `${model}:${tag}`,
				size: 0,
				modifiedAt: 0,
				details: void 0
			}];
		});
	}
	/** 获取模型详情。 */
	async showModel(name) {
		const response = await this.post("/api/show", { name });
		return {
			name,
			parameters: response.details?.parameter_size,
			family: response.details?.family,
			quantization: response.details?.quantization_level,
			contextLength: response.model_info?.["llama.context_length"],
			template: response.template,
			system: response.system
		};
	}
	/** 将独立 GGUF 文件注册为 Ollama 可调用模型。 */
	async importGguf(model, filePath) {
		await this.post("/api/create", {
			model,
			from: filePath,
			stream: false
		});
	}
	/** 拉取模型（流式进度）。 */
	async *pullModel(name) {
		const response = await fetch(`${this.endpoint}/api/pull`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name,
				stream: true
			})
		});
		if (!response.ok) throw new Error(`Ollama pull 失败：${response.status} ${response.statusText}`);
		const reader = response.body?.getReader();
		if (reader === void 0) throw new Error("无法读取响应流");
		const decoder = new TextDecoder();
		let buffer = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					if (line.trim() === "") continue;
					try {
						const data = JSON.parse(line);
						yield {
							status: data.status,
							...data.completed !== void 0 ? { completed: data.completed } : {},
							...data.total !== void 0 ? { total: data.total } : {},
							...data.completed !== void 0 && data.total !== void 0 ? { percent: Math.round(data.completed / data.total * 100) } : {}
						};
					} catch {}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
	/** 删除模型。 */
	async deleteModel(name) {
		await this.delete("/api/delete", { name });
	}
	/** 检查 Ollama 服务健康状态。 */
	async healthCheck() {
		try {
			return (await fetch(`${this.endpoint}/`, { signal: AbortSignal.timeout(3e3) })).ok;
		} catch {
			return false;
		}
	}
	/** 单次补全(知识库深度解析等宿主批处理使用);非 200 或超时抛错,由调用方回退。 */
	async complete(model, system, prompt, options) {
		const response = await fetch(`${this.endpoint}/api/chat`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model,
				stream: false,
				messages: [{
					role: "system",
					content: system
				}, {
					role: "user",
					content: prompt
				}],
				options: {
					temperature: options?.temperature ?? .2,
					num_predict: options?.maxTokens ?? 900
				}
			}),
			signal: AbortSignal.timeout(options?.timeoutMs ?? 15e4)
		});
		if (!response.ok) throw new Error(`Ollama 补全失败(HTTP ${String(response.status)})`);
		const value = await response.json();
		return typeof value.message?.content === "string" ? value.message.content : "";
	}
	/** 发送 GET 请求。 */
	async get(path) {
		const response = await fetch(`${this.endpoint}${path}`, { signal: AbortSignal.timeout(1e4) });
		if (!response.ok) throw new Error(`Ollama API 错误：${response.status} ${response.statusText}`);
		return response.json();
	}
	/** 发送 POST 请求。 */
	async post(path, body) {
		const response = await fetch(`${this.endpoint}${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(3e4)
		});
		if (!response.ok) throw new Error(`Ollama API 错误：${response.status} ${response.statusText}`);
		return response.json();
	}
	/** 发送 DELETE 请求。 */
	async delete(path, body) {
		const response = await fetch(`${this.endpoint}${path}`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(1e4)
		});
		if (!response.ok) throw new Error(`Ollama API 错误：${response.status} ${response.statusText}`);
	}
};
//#endregion
export { OllamaClient as t };

//# sourceMappingURL=ollama-client-B5R1Vg5V.js.map