/**
 * XYAI Studio desktop — 全局亮/暗主题偏好（K-001 / W-107）。
 *
 * 偏好写入本机 userData，并同步到 DSH `$DSH_HOME/settings.yaml` 的 `ui-theme.preference`，
 * 以便开发空间（IndustryAgent 工作台）与 Founders 面板共用同一选择。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 主题偏好：手动亮色 / 手动暗色 / 跟随系统。 */
export type XyaiThemePreference = 'light' | 'dark' | 'system'

/** 主题状态快照（供 shell / Founders / DSH 广播）。 */
export interface XyaiThemeState {
  readonly preference: XyaiThemePreference
  readonly dark: boolean
}

const PREFERENCE_FILE = 'xyai-theme-preference.json'

/** 工作台欢迎页在暗色主题下的对比度修复（覆盖 IndustryAgent 硬编码浅色）。 */
export const XYAI_WELCOME_DARK_CSS = `
body[data-ds-dark-theme] .xyai-home-welcome-title { color: #e8eef7 !important; }
body[data-ds-dark-theme] .xyai-home-welcome-badge {
  border-color: #2c394b !important;
  color: #a8b6c8 !important;
  background: #161e2a !important;
}
body[data-ds-dark-theme] .xyai-home-context { color: #b7c5d6 !important; }
body[data-ds-dark-theme] .xyai-home-context span:before { border-color: #8b9bb0 !important; }
body[data-ds-dark-theme] .xyai-home-context span+span:before {
  background: #3d83ef !important;
  border-color: #3d83ef !important;
}
body[data-ds-dark-theme] .xyai-home-composer.welcome {
  border-color: #2c394b !important;
  background: #161e2a !important;
  box-shadow: 0 4px 18px rgba(0, 0, 0, .42) !important;
}
body[data-ds-dark-theme] .xyai-home-composer-caption {
  color: #9aa9bd !important;
  opacity: 1 !important;
}
body[data-ds-dark-theme] .xyai-home-composer.welcome textarea {
  color: #e8eef7 !important;
  background: transparent !important;
  caret-color: #8fb8f2 !important;
}
body[data-ds-dark-theme] .xyai-home-composer.welcome textarea::placeholder {
  color: #7f8da2 !important;
}
body[data-ds-dark-theme] .xyai-home-composer.welcome .xyai-home-composer-footer {
  border-top-color: #2c394b !important;
}
body[data-ds-dark-theme] .xyai-home-composer.welcome .xyai-home-composer-footer span {
  color: #9aa9bd !important;
}
body[data-ds-dark-theme] .xyai-home-guide.welcome .xyai-home-guide-card {
  border-color: #2c394b !important;
  background: #1a2332 !important;
}
body[data-ds-dark-theme] .xyai-home-guide.welcome .xyai-home-guide-card:hover {
  border-color: #4d8bf0 !important;
  background: #1e2a3d !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .45) !important;
}
body[data-ds-dark-theme] .xyai-home-guide.welcome .xyai-home-guide-card small {
  color: #8fb8f2 !important;
}
body[data-ds-dark-theme] .xyai-home-guide.welcome .xyai-home-guide-card strong {
  color: #e8eef7 !important;
}
body[data-ds-dark-theme] .xyai-home-guide.welcome .xyai-home-guide-card span {
  color: #b7c5d6 !important;
}
body[data-ds-dark-theme] .xyai-home-card {
  border-color: #2c394b !important;
  background: #1a2332 !important;
  color: #dbe4ef !important;
}
body[data-ds-dark-theme] .xyai-home-card h3,
body[data-ds-dark-theme] .xyai-home-card b { color: #e8eef7 !important; }
body[data-ds-dark-theme] .xyai-home-card p { color: #b7c5d6 !important; opacity: 1 !important; }
body[data-ds-dark-theme] .xyai-home-action {
  border-color: #2c394b !important;
  color: #dbe4ef !important;
}
body[data-ds-dark-theme] .xyai-home-action:hover {
  background: #243044 !important;
}
`

/** 弹层/浮层实底：暗色下用深色不透明面，避免白底刺眼与半透明糊字。 */
export const XYAI_SURFACE_HARDEN_CSS = `
body {
  --dsw-alias-bg-layer-2: #ffffff !important;
  --dsw-alias-bg-layer-3: #ffffff !important;
  --dsw-alias-bg-mask-1: rgba(15, 23, 42, 0.78) !important;
  --dsw-alias-bg-mask-2: rgba(15, 23, 42, 0.5) !important;
  --dsw-mask-blur: none !important;
}
body[data-ds-dark-theme] {
  --dsw-alias-bg-layer-2: #1a2332 !important;
  --dsw-alias-bg-layer-3: #243044 !important;
  --dsw-alias-bg-mask-1: rgba(0, 0, 0, 0.78) !important;
  --dsw-alias-bg-mask-2: rgba(0, 0, 0, 0.55) !important;
  --dsw-mask-blur: none !important;
}
`

/**
 * 校验偏好字面量。
 * @param value - 任意输入。
 * @returns 合法偏好；非法时回退 system。
 */
export function normalizeThemePreference(value: unknown): XyaiThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

/**
 * 按偏好与系统外观解析是否暗色。
 * @param preference - 用户偏好。
 * @param systemDark - 系统是否暗色（nativeTheme.shouldUseDarkColors）。
 */
export function resolveThemeDark(preference: XyaiThemePreference, systemDark: boolean): boolean {
  if (preference === 'dark') return true
  if (preference === 'light') return false
  return systemDark
}

/**
 * 循环切换：system → light → dark → system。
 * @param preference - 当前偏好。
 */
export function cycleThemePreference(preference: XyaiThemePreference): XyaiThemePreference {
  if (preference === 'system') return 'light'
  if (preference === 'light') return 'dark'
  return 'system'
}

/**
 * 顶栏切换钮文案。
 * @param state - 当前主题状态。
 */
export function themeToggleLabel(state: XyaiThemeState): string {
  if (state.preference === 'system') return state.dark ? '☀️ 跟随·暗' : '🌙 跟随·亮'
  return state.dark ? '☀️ 亮色' : '🌙 暗色'
}

/**
 * 顶栏切换钮 title。
 * @param state - 当前主题状态。
 */
export function themeToggleTitle(state: XyaiThemeState): string {
  const mode = state.preference === 'system' ? '跟随系统' : (state.preference === 'dark' ? '手动暗色' : '手动亮色')
  return `外观：${mode}（当前${state.dark ? '暗色' : '亮色'}）。点击切换：跟随系统 → 亮色 → 暗色`
}

/**
 * 从 userData 读取偏好。
 * @param userDataPath - Electron app.getPath('userData')。
 */
export function loadThemePreference(userDataPath: string): XyaiThemePreference {
  const path = join(userDataPath, PREFERENCE_FILE)
  if (!existsSync(path)) return 'system'
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { preference?: unknown }
    return normalizeThemePreference(raw.preference)
  } catch {
    return 'system'
  }
}

/**
 * 将偏好写入 userData。
 * @param userDataPath - Electron userData 目录。
 * @param preference - 要持久化的偏好。
 */
export function saveThemePreference(userDataPath: string, preference: XyaiThemePreference): void {
  mkdirSync(userDataPath, { recursive: true })
  writeFileSync(join(userDataPath, PREFERENCE_FILE), `${JSON.stringify({ preference }, null, 2)}\n`, 'utf8')
}

/**
 * 把偏好写入 DSH settings.yaml（热重载驱动 ui-theme）。
 * 仅改写/插入 `ui-theme.preference`，尽量保留其余内容。
 * @param dshHome - `$DSH_HOME`。
 * @param preference - 主题偏好。
 */
export function syncDshThemePreference(dshHome: string, preference: XyaiThemePreference): void {
  mkdirSync(dshHome, { recursive: true })
  const path = join(dshHome, 'settings.yaml')
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  let text: string
  if (/^ui-theme:\s*$/m.test(existing) || /^ui-theme:\s*\n(?:[ \t]+.+\n)*/m.test(existing)) {
    if (/^(ui-theme:\s*\n(?:[ \t]+.+\n)*)/m.test(existing)) {
      text = existing.replace(
        /^(ui-theme:\s*\n)((?:[ \t]+.+\n)*)/m,
        (_block, head: string, body: string) => {
          if (/^[ \t]+preference:\s*(light|dark|system)\s*$/m.test(body)) {
            return head + body.replace(/^[ \t]+preference:\s*(light|dark|system)\s*$/m, `  preference: ${preference}`)
          }
          return `${head}  preference: ${preference}\n${body}`
        },
      )
    } else {
      text = existing.replace(/^ui-theme:\s*$/m, `ui-theme:\n  preference: ${preference}`)
    }
  } else if (existing.trim() === '') {
    text = `ui-theme:\n  preference: ${preference}\n`
  } else {
    text = `${existing.replace(/\s*$/, '')}\n\nui-theme:\n  preference: ${preference}\n`
  }
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8')
}

/**
 * 在 DSH 渲染进程立即应用明暗（不等待 settings 热重载）。
 * @param dark - 是否暗色。
 * @param preference - 偏好字面量（写入 dataset 便于调试）。
 */
export function dshApplyThemeScript(dark: boolean, preference: XyaiThemePreference): string {
  return `(() => {
    const dark = ${dark ? 'true' : 'false'};
    const preference = ${JSON.stringify(preference)};
    try {
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      document.body.toggleAttribute('data-ds-dark-theme', dark);
      document.documentElement.dataset.xyaiThemePreference = preference;
      window.dispatchEvent(new CustomEvent('xyai-studio:theme-change', { detail: { preference, dark } }));
    } catch (error) {
      console.warn('[XYAI] theme apply failed', error);
    }
  })()`
}
