# @xyai/adapter-dsh

DeepSeek Harness adapter (**scaffold**).

- Implements the same `AgentRuntime` contract as `@xyai/adapter-codex` (`start` / `stop` / `send`).
- Listed **disabled** in `assembly/profiles/0.5.0-dev.example.json`.
- `send` yields a soft Chinese tip (`HARNESS_STUB`); Studio continues local stream.
- User-facing product must not expose the name “DSH” as a required choice; the router picks engines internally.
