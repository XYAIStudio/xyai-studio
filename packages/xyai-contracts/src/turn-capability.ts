/**
 * Text-inferred turn need. PermissionMode / accessMode must not change this.
 * `chat` = streaming dialogue; `tools` = create/write/install; `planning` = long-task plan.
 */
export type TurnCapability = 'chat' | 'tools' | 'planning';

/**
 * @param need Text-inferred turn capability
 * @returns Whether the turn may use a write/tool runtime
 */
export function isToolCapability(need: TurnCapability): boolean {
  return need === 'tools' || need === 'planning';
}
