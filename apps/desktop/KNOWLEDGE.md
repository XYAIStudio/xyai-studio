# 知识库（XYAI Studio 0.5）

## 能力

0. **文件预览（本机）**：点击文件列表中的相对路径/文件名，右侧预览区显示「简介」（静默 LLM 摘要块或首段提取）+「原文/预览」（本地 office 预览：PDF iframe、DOCX mammoth、XLSX SheetJS、MD/TXT/代码）。旧版 `.doc` 提示另存为 `.docx`。IPC：`kbPreviewFile` → `xyai:kb-preview-file`（路径必须在 mount `sourceRoot` 内）。


1. **本机目录挂接**：选择目录后递归列出可解析文件（txt/md/pdf/docx/csv/json/html 等）。
2. **静默解析**：后台队列解析；若本机 Ollama 可用则尝试 embedding（否则纯关键词）。**绝不修改/删除源文件**；索引只写入用户选择的 `indexRoot/<kbId>/`（`chunks.jsonl`、`meta.json`、`audit.jsonl`）。
3. **解析状态**：queued / progress / done / failed / warn；**停止**会在当前文件完成后生效，不留下半成品最终索引（按文件 staging→commit）。
4. **云端 KB**：
   - **ima（官方 OpenAPI）**：`POST https://ima.qq.com/openapi/wiki/v1/<action>`，请求头 `ima-openapi-clientid` / `ima-openapi-apikey`。挂接时保存 Client ID + API Key + 所选 `knowledgeBaseId`（仅 userData）。列表走 `get_knowledge_list`；对话 `@` 检索走 `search_knowledge`（`highlight_content` → 引用）。凭证在 https://ima.qq.com/agent-interface 获取。仅当用户显式启用 mock 或凭证不完整时回退 stub。
   - **HTTP**：通用远程列表；无 baseUrl 时 stub。
5. **对话 `@`**：Composer 可 `@` 已挂接知识库；发送前检索并注入上下文。未 `@` 时，检索型 chat/tools 回合由 Core `planKnowledgeContext` 在 Session `send` 上自动附加本机+云命中；无挂接或 `你好` 为空操作。
6. **引用**：助手气泡展示「引用文件链接」；点击 `shell.openPath` / 外链，右键「在文件夹中显示」。

## 持久化

| 路径 | 内容 |
|---|---|
| `userData/knowledge-stores.json` | mounts + defaultIndexRoot（含 ima clientId/apiKey/knowledgeBaseId） |
| `<indexRoot>/<kbId>/chunks.jsonl` | 分块 |
| `<indexRoot>/<kbId>/meta.json` | 索引元数据 |
| `<indexRoot>/<kbId>/audit.jsonl` | 取消等审计 |

## IPC（preload → main）

`kbGetState` · `kbPreviewFile` · `kbMountLocal` · `kbMountCloud` · `kbMountIma` · `kbListImaBases` · `kbUnmount` · `kbListFiles` · `kbListCloud` · `kbStartParse` · `kbStopParse` · `kbParseJob` · `kbSetIndexDir` · `kbPickDirectory` · `kbSearch` · `kbGetCitations` · `kbOpenCitation` · `onKbParseProgress`

## 包

- `@xyai/knowledge` — 列表/抽取/分块/检索/ima-client/HTTP/路径安全
- `apps/desktop/src/main/knowledge/` — KnowledgeHost + IPC
- UI：开发空间 → 「知识库」subtab；对话 Composer `@ 知识库`

## 安全

源路径只读；`assertNotSourceWrite` / `assertIndexWriteAllowed` 阻止对源树的 write/unlink/rename。单测见 `packages/xyai-knowledge/src/path-safety.test.ts` 与 `ima-client.test.ts`。

## 检索兜底（0.5）

- 关键词 / embedding 均未命中、但索引中已有 chunks 时，自动 **overview 兜底**：注入该库前 N 个片段，避免「已 @ 知识库却空检索」。
- 中文查询：除空白分词外，对连续汉字做整段 + bigram 打分，并提升「整句子串命中」权重。
- 对话侧一旦选中 kbIds：始终附带「已挂载知识库」系统块；若库无索引，则写入 `formatEmptyIndexNote`（从未解析 → 「请先完成解析」；已解析但 `chunks.jsonl` 为空 → 「解析未产生可检索正文，请重新解析或换可读文件」），并 `transcript.appendError`，**绝不静默丢弃**。
- `.docx` 抽取走 ZIP 中央目录 + method 8 raw DEFLATE（Office OOXML）；抽不到可检索正文时文件记失败、顶栏「完成」不计该文件，不把警告当成已索引。

## UX（0.5 深化）

- 顶栏已移除状态条（`MOCK · …`）与主题 chip；保留「关于我们」。
- **本机挂接**：选目录后自动选中并立即列出文件 + 子目录树；索引目录默认 userData，不阻塞列目录。
- **解析状态（中文）**：已解析 / 待解析 / 正在解析 / 无法解析（由解析任务 + 索引 meta 映射；挂接后、解析前可解析文件为待解析，不支持扩展名为无法解析）。
- **开始解析**：只读源文件；索引写入 `indexRoot/<kbId>/`；嵌入优先本机 Ollama 最快可用 embed；蒸馏摘要优先最快 chat 模型。
- **蒸馏成果保存**：可选目录；取消则不另存，解析仍只更新索引。无 Ollama 时写纯文本摘录并标注。
- **HTTP 挂接**：模态框（名称 / baseUrl / apiKey / listPath / stub 勾选）；有 baseUrl 真实列表，stub 仅用户勾选。
- **ima**：挂接后自动列文件；刷新可用；对话 `@` 检索仍走 search。
