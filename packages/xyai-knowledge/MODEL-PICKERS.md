# Local model pickers (`ollama-kb.ts`)

| Picker | Used by | Behavior |
|--------|---------|----------|
| `pickEmbedModel` | Parse (chunk embeddings), search query embed | Prefer nomic/bge/minilm; **null** when only chat models exist |
| `pickFastChatModel` / `pickFastestLocalModel` | **Parse silent summarize**, distill | Exclude `mmproj-*` / embed / projector; sort by `sizeHint` (270m &lt; 1b &lt; 1.7b &lt; …) |
| `pickChatModel` | alias → `pickFastChatModel` | same |

## Parse flow

1. Probe Ollama + list tags.
2. If **no** chat and **no** embed → error `NO_LOCAL_MODEL_HINT` (do not fake success).
3. If embed → embed each text chunk.
4. If chat → `ollamaSummarize` per file → summary chunk titled「本地模型摘要」.
5. UI banner: `正在用本地模型 {chatModel} 静默解析`.

`startLocalParse` returns **immediately** (`running: true`); progress via IPC.
