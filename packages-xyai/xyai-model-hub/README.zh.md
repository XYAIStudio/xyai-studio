---
description: "XYAI 模型广场：conversation.view 全页 + Host RPC，覆盖检测、扫描、挂载、下载与本地模型性能实测。"
kind: "package-reference"
---

# @xyai/dsh-model-hub

[English](README.md) | 中文

## 概述

Host 拥有经校验的 `xyai-model-hub` 设置命名空间——选择策略（`local-first` / `balanced` / `cloud`）、按行分隔的模型目录（`名称|类型|endpoint`）、持久化登记表、默认模型 id 与云端凭据标记——并注册 Connection RPC 通道 `/xyai-model-hub`。

| 族 | 端点 |
| --- | --- |
| environment | `inspect` / `plan` / `prepare` / `start` / `snapshot` |
| scan | `start` / `cancel` / `snapshot` |
| registry | `list` / `register` / `register-batch` / `unmount` / `set-default` |
| downloads | `list` / `start` / `pause` / `resume` / `cancel` / `snapshot` |
| benchmark | `start` / `cancel` / `snapshot` |
| cloud | `providers` / `validate` / `set-key` / `test`（不回显密钥） |
| recommend | `list` |

`environment/inspect` 读取 Node `os.*`、可选 `nvidia-smi`、llama-server 是否存在，以及 Ollama `/api/tags`。扫描覆盖所选磁盘以及 Ollama、Hugging Face、LM Studio 与 XYAI 模型目录中的 `.gguf` 文件，报告进度，并可取消。登记与解除挂载只改 Host 设置，不移动或删除原文件。一键下载按白名单从 hf-mirror 再 huggingface.co 拉取 GGUF（Range 续传、体积上下限、GGUF 文件头），或在 Ollama API 可用时执行 pull。没有下载源且 Ollama 未运行时返回 `errcode: '503'`，状态为不可用。性能测试从 Ollama 流式输出测量 TTFT，并从提供方 token 统计计算生成速度。llama-server 探测报告冷启动时长和提供方生成速度，但由于请求是非流式的，TTFT 保持未测。缺少运行时或观测值时保持不可用或 null，不生成替代数字。设为默认会把该模型写入目录，供输入区读取。

浏览器半渲染：

1. **`conversation.view` `xyai-model-plaza`** 与 **`shell.overlay` `xyai-model-plaza-overlay`** — 环境准备、发现、本地登记（挂载 → 自动测试 → 设默认）、云端 Key、下载任务。
2. **`settings.section` `xyai-model-hub`** — preference + catalog 原子保存。

## 模型体验

无。本包只注册 UI 与 Host RPC，不增加模型上下文或工具。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

- **本地对话 Provider 仍未接线** — 广场目录与默认 id 仍是供输入区读取的文档；在本地 provider 注册前，会话继续走 DSH LLM。
- **不执行运行时安装** — 准备流程只检查 llama-server 与 Ollama；不下载显卡驱动，也不假装安装成功。
- **未发布 `./invariant`** — slot 注册由 UI 插槽注册表观测。
## 运行就绪与实测字段

发现可执行文件仅表示 installed，不表示 ready。环境准备只接受有效响应的 Ollama 模型列表接口，或已登记 GGUF 的实际加载和生成检查通过；否则保持不可用。准备操作不负责安装依赖。

云端密钥 JSON 字段使用 Settings secret 标记。设置脱敏描述不包含其原文，Host 仍可读取；这是传输脱敏，不是底层设置文件加密。

Ollama 首字延迟来自首段非空流式输出，生成速度必须来自有效的正数 token 统计与生成耗时。缺失统计保持 null；截断、格式错误、错误或空响应使测量失败。Ollama 冷启动和上下文保持未测；llama.cpp 非流式请求不报告首字延迟，只在提供生成耗时统计时报告速度。未测指标明确标注。GGUF 探测结束会终止并等待子进程退出。
