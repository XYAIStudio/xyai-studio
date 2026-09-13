# @xyai/dsh-product-base

The XYAI Studio base product bundle: one Cordis patch layer that mounts the five
core local-capability plugins over the `@deepseek-ai/dsh-web-app` composition.

- `xyai-brand-pack` - brand engine (name, colors, logo, vision) driving the
  sidebar and hero brand slots.
- `xyai-dev-shell` - development-space shell (Workbench navigation only).
- `xyai-composer` - additive composer controls (capability menu, voice input,
  harness status).
- `xyai-model-hub` - Model Plaza (OS inspect, GGUF scan/mount, Ollama pull,
  measured local-model performance).
- `xyai-knowledge` - local knowledge (mount, parse, distill, `knowledge_search`).

Collaboration (`ai-employees`), commercial plugins (`online-auth`, `tenancy`,
`commerce`), and experimental Agent Forge intentionally stay out of this bundle:
they live in `product-collab`, `product-online`, and `product-forge` so an
experimental-API or online-service failure cannot block the base desktop from
starting. The Desktop seed mounts this bundle directly after the built-in
desktop bundle list.

Commercial plugins mount from `@xyai/dsh-product-online` (full web profile /
optional desktop install), never from `DESKTOP_PROFILE_BUNDLES`. Agent Forge
mounts only from `@xyai/dsh-product-forge` (explicit opt-in).