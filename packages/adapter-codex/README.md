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
3. npm global vendor, including Windows `…/@openai/codex-win32-x64/vendor/…/codex.exe`
4. `PATH` — on Windows `codex.exe` is preferred over the npm `codex.cmd` shim

Missing binary / spawn / ENOENT map to Chinese **soft** payloads (`CODEX_BIN_MISSING`, `SPAWN_ERROR`, `ENOENT`, `MOCK_WITHOUT_FORCE`). The Studio host may then continue the same turn on local Ollama stream.

## Real exec flags

```
codex exec --json --ephemeral --skip-git-repo-check -s <sandbox> -C <cwd> \
  [-a never] [--add-dir <dir>…] [--config key=value…] \
  [--oss --local-provider ollama] [-m <model>] "<prompt>"
```

Studio tool turns use `-s workspace-write -a never` (accessMode `full` → `danger-full-access`), cwd = `userData/workspace`, and `--add-dir userData/personalize`. Custom OpenAI-compatible brains (DeepSeek etc.) inject `OPENAI_API_KEY` plus `--config model_provider=xyai` / `model_providers.xyai.base_url`.

Local OSS (`session.oss`):

```
codex exec --json … --oss --local-provider ollama -m <bare-name>
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
