/**
 * Runtime Provider: dsh（DeepSeek Harness 真实执行）
 *
 * 通过 `dsh --profile headless` 启动一次真实的 agent 会话：
 *   - 凭证来自 $DSH_HOME/.credentials.yaml（DEEPSEEK_API_KEY），无需在本模块内联密钥
 *   - 模型默认 deepseek-v4-flash（headless profile 内置），可经 DSH_MODEL/req.model 覆盖
 *   - 工作区 = DSH_CWD（默认 runtime-workspace/runs/<ts>）
 *   - 会话以 JSONL 持久化于 $DSH_HOME/sessions
 *
 * 接口隔离：本文件是业务层接触 DSH 的唯一边界。
 */
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import { RuntimeAdapter, RunRequest, RunResult, RunEvent } from "./types";

const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(RUNTIME_DIR, "../..");

export interface DshRuntimePaths { binPath: string; harnessDir: string; workspaceRoot: string; eventPatchFile: string; sourceMode: boolean }

/**
 * 优先使用安装包/后端 node_modules 内的发布版 DSH CLI；只有开发调试时才回退 monorepo 源码。
 * 这样安装到任意盘符、任意用户名后都不依赖开发机 E:\\XYOSStudio 路径。
 */
export function resolveDshRuntimePaths(): DshRuntimePaths {
  const explicitBin = process.env.XYOS_DSH_BIN?.trim();
  const packagedBin = path.join(BACKEND_DIR, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  const harnessDir = process.env.XYOS_DSH_HARNESS?.trim() || path.resolve(BACKEND_DIR, "..", "deepseek-harness");
  const sourceBin = path.join(harnessDir, "apps", "cli", "src", "bin.ts");
  const binPath = explicitBin || (fs.existsSync(packagedBin) ? packagedBin : sourceBin);
  return {
    binPath,
    harnessDir: binPath === sourceBin ? harnessDir : path.dirname(binPath),
    workspaceRoot: process.env.XYOS_RUNTIME_WORKSPACE?.trim() || path.join(os.homedir(), ".xyai-studio", "runtime-workspace"),
    eventPatchFile: process.env.XYOS_DSH_EVENT_PATCH?.trim() || path.join(RUNTIME_DIR, "dsh-stream-patch.cordis.yml"),
    sourceMode: binPath.endsWith(".ts"),
  };
}

function safeRoute(value: string | undefined, fallback: string): string {
  const route = value?.trim() || fallback;
  return /^[A-Za-z0-9._-]{1,120}$/.test(route) ? route : fallback;
}

function createResolvedEventPatch(templateFile: string, provider: string, model: string): { file: string; dispose: () => void } | null {
  const moduleFile = path.join(path.dirname(templateFile), "dsh-event-stream.ts");
  if (!fs.existsSync(templateFile) || !fs.existsSync(moduleFile)) return null;
  const template = fs.readFileSync(templateFile, "utf8");
  const moduleUrl = pathToFileURL(moduleFile).href;
  const eventPatch = template.replace("'./dsh-event-stream.ts'", `'${moduleUrl}'`);
  if (eventPatch === template) return null;
  // 运行使用独立的临时 settings 文档，避免用户全局旧默认模型覆盖本次显式选择；凭据仍从用户 DSH_HOME 读取。
  const settingsFile = path.join(os.tmpdir(), `xyai-dsh-settings-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.yaml`);
  fs.writeFileSync(settingsFile, `agent-default-model:\n  provider: ${provider}\n  model: ${model}\n`, "utf8");
  const settingsPath = JSON.stringify(settingsFile.replace(/\\/g, "/"));
  const rendered = `${eventPatch.trimEnd()}\n- id: settings\n  config:\n    path: ${settingsPath}\n    watch: false\n- id: agent-default-model\n  config:\n    provider: ${provider}\n    model: ${model}\n`;
  const file = path.join(os.tmpdir(), `xyai-dsh-event-patch-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.yml`);
  fs.writeFileSync(file, rendered, "utf8");
  return { file, dispose: () => {
    for (const target of [file, settingsFile]) try { fs.unlinkSync(target); } catch { /* 临时文件已不存在 */ }
  } };
}

function defaultCwd(): string {
  const dir = path.join(resolveDshRuntimePaths().workspaceRoot, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 从工具调用参数里抽出一行可读摘要（read→路径，pwsh→命令，web_search→查询…） */
function summarizeToolArgs(name: string, argsJson?: string): string {
  let args: any = {};
  try { args = argsJson ? JSON.parse(argsJson) : {}; } catch { return name; }
  const pick = (keys: string[]) => {
    for (const k of keys) if (typeof args[k] === "string" && args[k]) return args[k];
    return "";
  };
  const file = pick(["file_path", "path", "pattern", "target", "pathname", "include"]);
  const cmd = pick(["command", "cmd", "script"]);
  const query = pick(["query", "prompt", "description", "question", "objective", "content"]);
  const short = (s: string, n = 120) => (s.length > n ? s.slice(0, n) + "…" : s);
  if (file) return short(file);
  if (cmd) return short(cmd);
  if (query) return short(query);
  return name;
}

/** 从 tool/result 数据里抽出一行结果摘要 */
function summarizeToolResult(data: any): string {
  if (!data) return "";
  const content = data.content ?? data.output ?? data.result?.content ?? data.result;
  const raw = typeof content === "string" ? content
    : Array.isArray(content) ? content.map(part => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : typeof part?.content === "string" ? part.content : "").filter(Boolean).join(" ")
    : typeof content?.text === "string" ? content.text
    : typeof content?.output === "string" ? content.output
    : "";
  return raw.slice(0, 240).replace(/\s+/g, " ").trim();
}

function summarizeAssistantMessage(data: any): string {
  const parts = Array.isArray(data?.message?.content) ? data.message.content
    : Array.isArray(data?.content) ? data.content
    : [];
  // 与 DSH headless 的正式输出规则一致：只收集 text block，禁止把
  // reasoning block 当作用户可见结果写入节点证据和验收报告。
  const text = parts.map((part: any) => typeof part === "string" ? part : part?.type === "text" && typeof part.text === "string" ? part.text : "").join(" ");
  const fallback = typeof data?.text === "string" ? data.text : typeof data?.content === "string" ? data.content : "";
  // 最终回复常同时包含整条生产线的多个节点。保留足够文本供 Runtime
  // 将 N1-N5、scope-report 或多成员贡献分别绑定到节点；显示层再自行截断。
  return (text || fallback).slice(0, 20_000).replace(/\s+/g, " ").trim();
}

export class DshAdapter implements RuntimeAdapter {
  readonly id = "dsh" as const;
  readonly name = "DeepSeek Harness（真实执行）";
  readonly description =
    "调用 DeepSeek Harness headless agent：真实模型 + bash/文件/子代理工具，JSONL 会话持久化";
  readonly capabilities = ["execute", "tools", "subagent", "persistence", "events", "evidence"];

  getHealth(): { ready: boolean; message: string; details?: Record<string, unknown> } {
    const runtime = resolveDshRuntimePaths();
    const { binPath, harnessDir, workspaceRoot, eventPatchFile } = runtime;
    const harnessExists = fs.existsSync(binPath);
    const patchExists = fs.existsSync(eventPatchFile) && fs.existsSync(path.join(path.dirname(eventPatchFile), "dsh-event-stream.ts"));
    const workspaceReady = fs.existsSync(workspaceRoot) || (() => {
      try { fs.mkdirSync(workspaceRoot, { recursive: true }); return true; } catch { return false; }
    })();
    const ready = harnessExists && workspaceReady;
    return {
      ready,
      message: ready
        ? `DSH headless 可用${patchExists ? "，事件流 patch 已启用。" : "，但事件流 patch 缺失，将只能记录进程级事件。"}`
        : `DSH headless 不可用：${harnessExists ? "" : `缺少 ${binPath}`} ${workspaceReady ? "" : `工作区不可写 ${workspaceRoot}`}`.trim(),
      details: {
        harnessDir,
        binPath,
        harnessExists,
        workspaceRoot,
        workspaceReady,
        eventPatchFile,
        patchExists,
        sourceMode: runtime.sourceMode,
      },
    };
  }

  async execute(req: RunRequest): Promise<RunResult> {
    const events: RunEvent[] = [];
    const startedAt = new Date().toISOString();
    const push = (type: RunEvent["type"], message?: string, data?: Record<string, unknown>) => {
      events.push({ type, at: new Date().toISOString(), message, data });
    };

    const cwd = req.cwd || defaultCwd();
    const runtime = resolveDshRuntimePaths();
    const { binPath } = runtime;
    if (!fs.existsSync(binPath)) {
      return {
        status: "failed",
        output: "",
        events,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: `DSH harness 不存在: ${binPath}（设置 XYOS_DSH_HARNESS）`,
        evidence: { cwd },
      };
    }

    const modelProvider = safeRoute(req.modelProvider || process.env.XYOS_DSH_PROVIDER, "deepseek-official");
    const selectedModel = safeRoute(req.model || process.env.XYOS_DSH_MODEL, "deepseek-v4-flash");
    const resolvedPatch = createResolvedEventPatch(runtime.eventPatchFile, modelProvider, selectedModel);
    const usePatch = resolvedPatch !== null;
    const args = [...(runtime.sourceMode ? ["--import", "tsx/esm", binPath] : [binPath]), "--profile", "headless"];
    if (resolvedPatch) args.push("--patch", resolvedPatch.file);
    args.push(req.task);
    const timeoutMs = req.timeoutMs || 120000;
    // 事件流文件：tail 后把 tool/call 等过程实时推给调用方（业务空间群聊）
    const eventFile = req.onStep
      ? path.join(os.tmpdir(), `dsh-events-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`)
      : null;

    push("started", `启动 DSH headless agent（cwd=${cwd}${usePatch ? "，事件流已启用" : ""}）`);
    events.push({
      type: "progress",
      at: new Date().toISOString(),
      message: "等待 agent 输出…",
      data: { model: req.model || "deepseek-v4-flash(默认)" },
    });

    const result = await new Promise<RunResult>((resolve) => {
      const child = spawn(process.execPath, args, {
        // CLI 脚本使用绝对路径启动；进程 cwd 必须是本次受控工作区，否则 read/glob 会误落到 dsh/lib 安装目录。
        cwd,
        env: {
          ...process.env,
          DSH_CWD: cwd,
          DSH_MODEL_PROVIDER: modelProvider,
          DSH_MODEL: selectedModel,
          ...(eventFile ? { DSH_EVENT_STREAM: eventFile } : {}),
        },
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let eventOffset = 0;
      let assistantObserved = false;
      let eventTimer: ReturnType<typeof setInterval> | null = null;

      const drainEventStream = () => {
        if (!eventFile || !req.onStep) return;
        try {
          if (!fs.existsSync(eventFile)) return;
          const full = fs.readFileSync(eventFile, "utf8");
          const buf = full.slice(eventOffset);
          if (!buf) return;
          eventOffset = full.length;
          for (const line of buf.split("\n")) {
            if (!line.trim()) continue;
            let ev: any;
            try { ev = JSON.parse(line); } catch { continue; }
            if (ev.type === "tool/call" && ev.data?.name) {
              req.onStep({ kind: "tool_call", name: ev.data.name, text: summarizeToolArgs(ev.data.name, ev.data.arguments) });
            } else if (ev.type === "tool/result") {
              const t = summarizeToolResult(ev.data);
              req.onStep({ kind: "tool_result", name: ev.data?.name, text: t || "工具已返回结果（未提供可读文本摘要）" });
            } else if (ev.type === "assistant/message") {
              const t = summarizeAssistantMessage(ev.data);
              if (t) {
                assistantObserved = true;
                req.onStep({ kind: "assistant", text: t });
              }
            }
          }
        } catch { /* 事件 tail 失败不阻断 */ }
      };

      const finish = (status: RunResult["status"], extra: Partial<RunResult>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (eventTimer) clearInterval(eventTimer);
        // 子进程退出意味着写端已关闭；清理文件前必须读取最后一个轮询间隔内的尾部事件。
        drainEventStream();
        // 极少数短会话会在事件 patch 落下 assistant/message 前结束，但 stdout
        // 已包含完整最终回复。用 stdout 补一条 assistant 证据，避免成功结果成为孤证。
        if (req.onStep && !assistantObserved && stdout.trim()) {
          assistantObserved = true;
          req.onStep({ kind: "assistant", text: stdout.trim().slice(0, 20_000) });
        }
        if (eventFile) { try { fs.unlinkSync(eventFile); } catch { /* 忽略 */ } }
        resolve({
          status,
          output: stdout.trim(),
          events,
          startedAt,
          finishedAt: new Date().toISOString(),
          evidence: { cwd },
          ...extra,
        });
      };

      // 实时 tail 事件流：把 DSH 的 read/edit/pwsh 等工具过程推给调用方
      if (eventFile && req.onStep) {
        eventTimer = setInterval(drainEventStream, 400);
      }

      const timer = setTimeout(() => {
        push("failed", `超时（${timeoutMs}ms），终止进程`);
        child.kill();
        finish("failed", { error: `DSH agent 超时（>${timeoutMs}ms）` });
      }, timeoutMs);

      child.stdout.on("data", (d) => {
        stdout += d.toString();
        // 只保留事件摘要，不把全部输出灌入内存
        if (events.length < 12) {
          push("progress", d.toString().split("\n")[0].slice(0, 120));
        }
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (err) => {
        push("failed", `进程启动失败: ${err.message}`);
        finish("failed", { error: err.message });
      });
      child.on("close", (code) => {
        if (code === 0) {
          push("succeeded", "DSH agent 执行完成");
          finish("succeeded", {});
        } else {
          push("failed", `DSH agent 退出码 ${code}`);
          finish("failed", {
            error: stderr.trim().slice(-2000) || `DSH agent 退出码 ${code}`,
          });
        }
      });
    });

    resolvedPatch?.dispose();
    return result;
  }
}
