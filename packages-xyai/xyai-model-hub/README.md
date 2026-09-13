---
description: "XYAI model hub: Model Plaza conversation.view plus Host RPC for inspect, scan, mount, download, and measured local-model performance."
kind: "package-reference"
---

# @xyai/dsh-model-hub

English | [中文](README.zh.md)

## Summary

The Host owns the validated `xyai-model-hub` settings namespace — selection strategy (`local-first` / `balanced` / `cloud`), newline-separated catalog (`name|provider|endpoint`), persisted registry, default model id, and cloud key flags — and registers Connection RPC channel `/xyai-model-hub`.

| Family | Endpoints |
| --- | --- |
| environment | `inspect` / `plan` / `prepare` / `start` / `snapshot` |
| scan | `start` / `cancel` / `snapshot` |
| registry | `list` / `register` / `register-batch` / `unmount` / `set-default` |
| downloads | `list` / `start` / `pause` / `resume` / `cancel` / `snapshot` |
| benchmark | `start` / `cancel` / `snapshot` |
| cloud | `providers` / `validate` / `set-key` / `test` (never echoes secrets) |
| recommend | `list` |

`environment/inspect` reads Node `os.*`, optional `nvidia-smi`, llama-server presence, and Ollama `/api/tags`. Scan walks chosen disks plus Ollama, Hugging Face, LM Studio, and XYAI model directories for `.gguf` files, reports progress, and can be cancelled. Register and unmount change Host settings only; original files stay on disk. One-click download fetches an allow-listed GGUF from hf-mirror then huggingface.co with Range resume, size bounds, and GGUF magic, or pulls through Ollama when that API is running. Models without a download source and without Ollama return `errcode: '503'` and stay unavailable. Benchmark measures Ollama TTFT from streaming output and generation rate from provider token statistics. The llama-server probe reports cold-start duration and provider generation rate but leaves TTFT unmeasured because its request is non-streaming. Missing runtimes or observations remain unavailable or null instead of producing substitute numbers. Setting a default writes that model into the catalog for the composer seat.

The browser half renders:

1. **`conversation.view` `xyai-model-plaza`** and **`shell.overlay` `xyai-model-plaza-overlay`** — prepare, discover, local registry (mount → auto-test → default), cloud keys, download tasks.
2. **`settings.section` `xyai-model-hub`** — preference + catalog atomic save.

## Model Experience

None; this package registers UI and Host RPC and adds no model context or tools.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Local chat provider still deferred** — plaza catalog and default id are documents for the composer seat; DSH LLM remains the conversation runtime until a local provider registers.
- **Runtime install is not performed** — prepare inspects llama-server and Ollama; it does not download GPU drivers or fake a successful install.
- **No `./invariant`** — slot registration is observed by the UI-slot registry.
## Runtime readiness and measured fields

Executable discovery reports `installed`, not `ready`. Environment preparation accepts a responding Ollama model-list API or a successful load and generation with an available registered GGUF. Without either check it remains unavailable. Preparation does not install dependencies.

The cloud secret JSON field has the Settings secret role. Redacted Settings descriptors omit its value while Host code can still read it; this is wire redaction, not encryption of the backing settings file.

Ollama TTFT measures the first nonempty streamed response. Generation rate requires positive provider token-count and generation-duration statistics. Missing statistics remain null. A truncated, malformed, error, or empty response fails measurement. Ollama cold-start and context are unmeasured; llama.cpp non-streaming requests leave TTFT unmeasured and report speed only from provider generation timings. Unmeasured display fields say so. The GGUF probe waits for its child process to close after termination.
