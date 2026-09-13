---
description: "XYAI knowledge providers for local extraction, Ollama distillation, ima metadata browsing, and conversation retrieval."
kind: "package-reference"
---

# @xyai/dsh-knowledge

English | [中文](README.zh.md)

## Summary

The Host mounts local directories as read-only sources, extracts supported documents, and writes text plus structured semantic artifacts beneath `$DSH_HOME/xyai-studio/knowledge/v1/<mount-id>`. It measures installed Ollama models with real generation requests and selects the highest measured throughput; if no model responds, extracted text remains available with the `extracted` state instead of being reported as distilled.

The ima provider validates credentials through the official OpenAPI, stores each mount's credentials in the DSH credential provider, and persists file metadata only. The Client browses cloud folders lazily without parsing them. During a `knowledge_search` call, empty ima highlights are hydrated from the provider's signed content URL, parsed in memory for supported text, PDF, and DOCX content, and returned as bounded excerpts through DSH's logged tool path. Cloud bodies are not persisted as local knowledge artifacts.

The Client contributes DSH settings, conversation, and shell-overlay entries. Its overview, local mount wizard, ima connection wizard, source details, file status, previews, refresh, rename, and detach actions call authenticated Host RPC operations.

## Configuration

`artifactRoot` overrides the application-owned artifact root; an empty value selects `$DSH_HOME/xyai-studio/knowledge/v1`. `maxFileBytes` and `maxFiles` bound one scan. Directory traversal has no application depth limit, rejects symbolic paths, and remains subject to operating-system path and permission limits.

`ollamaEndpoint`, `benchmarkTimeoutMs`, `modelTimeoutMs`, `distillChunkChars`, and `maxBenchmarkModels` control real local-model execution. `cloudEndpoint`, `cloudTimeoutMs`, `cloudPageSize`, `cloudContentBytes`, and `cloudHydrateLimit` control ima calls and bounded on-demand content reads. The defaults target local Ollama and `https://ima.qq.com/openapi/wiki/v1`.

Supported local files are UTF text families (`.txt`, `.md`, `.json`, `.csv`), DOCX body text, and PDFs with an extractable text layer. Each semantic JSON artifact records the source fingerprint, selected model and measurement, timestamp, and chunk summaries, keywords, topics, entities, and questions.

## Operations

| Operation | Behavior |
| --- | --- |
| `precheck` / `mountLocal` | Validate a readable directory and create an owner-marked application artifact directory. |
| `scan` / `retry` | Reconcile local files, extract text, measure local models, and distill changed or unfinished documents. |
| `tree` / `preview` | Browse one local directory level and read owned extracted or semantic artifacts. |
| `imaTest` / `mountIma` | Validate credentials, list visible libraries, and persist one metadata-only mount. |
| `refreshIma` / `cloudList` | Refresh root metadata or browse one cloud folder without downloading file content. |
| `rename` / `unmount` | Update or remove a registration; local sources and artifacts remain, while detached ima credentials are removed. |

## Model Experience

`knowledge_search` is model-visible and logged by the DSH tool runtime. Local results come from application-owned extracted text. ima results first use remote search highlights; when ima returns only matching file names, the same reads supported matched files through temporary signed URLs and extracts bounded excerpts in memory. Tool output identifies the provider, mount, document, title, source location, and source snippet.

#### KV Cache effect

Each search result enters the active model context as ordinary tool-result text. Result size is limited to twenty hits with a bounded snippet per local hit; ima controls its returned page.

## Security and lifecycle

Source directories are never written, moved, or deleted. Every artifact read and write rechecks the owner marker and path containment. Credentials never cross the Client snapshot or settings document. Scans serialize mutations, yield between files, persist document progress, and settle before plugin disposal.

## Limitations

Local retrieval is substring matching over extracted text. OCR, image-only PDFs, Office formats other than DOCX, embeddings, vector ranking, filesystem watching, and owner-verified artifact deletion are not included. Real ima acceptance requires credentials issued for the target account, and local distillation requires a running Ollama service with at least one responding model.
