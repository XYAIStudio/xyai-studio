/**
 * XYAI UI Shell 占位包 — 完整 Electron Renderer / 单 chrome 尚未落地。
 * 0.5 M1 目标：薄壳 + Codex 对话路径；本包仅导出占位元数据。
 */

export interface UiShellPlaceholder {
  id: 'xyai-ui-shell';
  status: 'placeholder';
  note: string;
}

export const UI_SHELL_PLACEHOLDER: UiShellPlaceholder = {
  id: 'xyai-ui-shell',
  status: 'placeholder',
  note: 'Minimal placeholder — no full UI yet. Electron thin host comes later.',
};

export function getUiShellStatus(): UiShellPlaceholder {
  return UI_SHELL_PLACEHOLDER;
}
