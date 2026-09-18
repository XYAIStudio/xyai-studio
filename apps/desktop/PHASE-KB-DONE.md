# PHASE-KB-DONE — 知识库 0.5

- 日期：2026-09-17（CST）
- 范围：`/workspace/xyai-studio-0.5` 箱内实现；无 Windows 打包

## 交付

- [x] `@xyai/knowledge` 包（挂接类型、只读列举、抽取、分块、Ollama embed 可选、关键词+向量检索、**ima 官方 OpenAPI client**、HTTP stub、路径安全断言）
- [x] Main：`KnowledgeHost` + IPC；持久化 `knowledge-stores.json`（clientId/apiKey/knowledgeBaseId）
- [x] UI：开发空间 subtab「知识库」；「挂接 ima」对话框（Client ID / API Key / 拉取知识库列表 / 确认挂接）
- [x] Composer `@`：ima 挂接走 `search_knowledge` → citations；本机走本地索引
- [x] 文档：`KNOWLEDGE.md` + 本文件
- [x] 路径安全 + ima envelope 单测

## 验证

```bash
pnpm install
pnpm --filter @xyai/knowledge test
pnpm typecheck
```

## 已知限制

- PDF 为粗粒度文本刮取（无完整 PDF 引擎）；失败记 warn。
- ima 挂接需用户在 https://ima.qq.com/agent-interface 自备凭证；仅 mock 或凭证不全时 stub。
- 向量库为 jsonl + 内存检索，非独立 vector DB。
