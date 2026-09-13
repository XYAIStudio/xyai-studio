/**
 * Locale-owned copy for @xyai/dsh-agent-forge (client-ui-i18n requires it).
 */
export const en = {
  'forge.agents': 'Forge',
} as const

/** Simplified-Chinese dictionary for the same key set. */
export const zh = {
  'forge.agents': '兵工厂',
} as const

/** The `xyaiAgentForge` namespace key union. */
export type XyaiAgentForgeKey = keyof typeof en
