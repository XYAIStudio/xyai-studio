# Chat layout fix — composer 同宽 + right sidebar resize

- Date: 2026-09-17 (CST)
- Scope: `/workspace/xyai-studio-0.5` desktop renderer only; no Windows pack

## Changes

- **Composer 同宽**: `.composer { align-items: stretch }`, `.composer-card` / `.transcript-col` drop `max-width: 760px` → full width of `.chat-center` / transcript glass panel.
- **Right sidebar resize**: `.chat-resize-handle` between center and right wrap; drag sets `--right-sidebar-width`; persist `localStorage` key `xyai.rightSidebar.width`.
- Collapsed sidebar still hides aside + handle; capsule / `#primary-action` untouched.

## Widths

| Token | Value |
|---|---|
| default | 280px |
| min (right) | 180px |
| max (right) | 480px |
| min (chat-center) | 280px |

## Files

- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/chat/right-sidebar.ts`
