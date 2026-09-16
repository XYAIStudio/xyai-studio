# @xyai/adapter-codex

AgentRuntime adapter for OpenAI Codex CLI (`codex exec --json`).

Pinned to **`@openai/codex@0.151.0`** so the native optional platform package matches a known CLI layout.

## Modes

| Mode | When |
|------|------|
| **Real** | Native binary resolved and `XYAI_CODEX_MOCK` unset |
| **Mock** | `forceMock: true`, or `XYAI_CODEX_MOCK=1`, or binary missing |

```ts
import { createCodexAdapter, resolveCodexBinary } from '@xyai/adapter-codex';

const adapter = createCodexAdapter(); // prefers real
const mock = createCodexAdapter({ forceMock: true });
```

## Binary resolution

1. `CodexAdapterOptions.binaryPath` / `XYAI_CODEX_BIN` (must exist)
2. Platform optional package via `@openai/codex` (e.g. `@openai/codex-win32-x64` → `vendor/<triple>/bin/codex[.exe]`)
3. `codex` / `codex.exe` on `PATH`

## Real exec flags

```
codex exec --json --ephemeral --skip-git-repo-check -s read-only -C <cwd> "<prompt>"
```

Prompt is a **single argv** (spawn args array — never a joined ArgumentList string).

## Env

| Variable | Effect |
|----------|--------|
| `XYAI_CODEX_BIN` | Absolute path to native binary |
| `XYAI_CODEX_MOCK=1` | Force mock path |
| `XYAI_CODEX_TIMEOUT_MS` | Kill spawn after N ms (default 180000) |

## Windows real smoke

```bash
# authenticated Codex CLI required
pnpm --filter desktop smoke
```

CI / unauthenticated Linux:

```bash
XYAI_CODEX_MOCK=1 pnpm --filter desktop smoke
```
