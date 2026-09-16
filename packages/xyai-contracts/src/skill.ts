/** Skill 装载与作用域契约 */

export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  scope: 'global' | 'session' | 'task';
  entry?: string;
}

export interface SkillLoader {
  list(): Promise<SkillManifest[]>;
  load(id: string): Promise<SkillManifest>;
}
