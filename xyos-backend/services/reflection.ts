import { dbGet, dbAll, dbRun } from "../db";

export interface Reflection {
  id: number;
  tenant_id: number;
  employee_id: number;
  task_id: number | null;
  reflection_type: string;
  success_factors: string | null;
  failure_reasons: string | null;
  knowledge_gaps: string | null;
  improvement_plans: string | null;
  extracted_skills: string | null;
  learned_knowledge: string | null;
  importance_score: number;
}

export interface Skill {
  id: number;
  tenant_id: number;
  employee_id: number;
  skill_name: string;
  skill_category: string | null;
  proficiency_level: number;
  usage_count: number;
  success_rate: number;
  last_used_at: string | null;
}

// 创建反思记录
export function createReflection(data: Partial<Reflection>): number {
  const result = dbRun(
    `INSERT INTO reflections (tenant_id, employee_id, task_id, reflection_type, success_factors, failure_reasons, knowledge_gaps, improvement_plans, extracted_skills, learned_knowledge, importance_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tenant_id || 1,
      data.employee_id,
      data.task_id || null,
      data.reflection_type || 'task_completion',
      data.success_factors || null,
      data.failure_reasons || null,
      data.knowledge_gaps || null,
      data.improvement_plans || null,
      data.extracted_skills || null,
      data.learned_knowledge || null,
      data.importance_score || 50,
    ]
  );
  return result.lastInsertRowid;
}

// 获取反思记录列表
export function getReflections(tenantId: number, filters?: { employee_id?: number; reflection_type?: string }): Reflection[] {
  let sql = "SELECT * FROM reflections WHERE tenant_id = ?";
  const params: any[] = [tenantId];

  if (filters?.employee_id) { sql += " AND employee_id = ?"; params.push(filters.employee_id); }
  if (filters?.reflection_type) { sql += " AND reflection_type = ?"; params.push(filters.reflection_type); }

  sql += " ORDER BY importance_score DESC, created_at DESC";
  return dbAll(sql, params) as Reflection[];
}

// 获取反思记录详情
export function getReflection(id: number, tenantId: number): Reflection | undefined {
  return dbGet("SELECT * FROM reflections WHERE id = ? AND tenant_id = ?", [id, tenantId]) as Reflection | undefined;
}

// 删除反思记录
export function deleteReflection(id: number, tenantId: number): void {
  dbRun("DELETE FROM reflections WHERE id = ? AND tenant_id = ?", [id, tenantId]);
}

// 添加技能
export function addSkill(data: Partial<Skill>): number {
  const existing = dbGet(
    "SELECT id FROM employee_skill_stats WHERE employee_id = ? AND skill_name = ? AND tenant_id = ?",
    [data.employee_id, data.skill_name, data.tenant_id || 1]
  ) as Skill | undefined;

  if (existing) {
    dbRun(
      "UPDATE employee_skill_stats SET usage_count = usage_count + 1, proficiency_level = MIN(10, proficiency_level + 1), last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [existing.id]
    );
    return existing.id;
  }

  const result = dbRun(
    `INSERT INTO employee_skill_stats (tenant_id, employee_id, skill_name, skill_category, proficiency_level, usage_count, success_rate, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tenant_id || 1,
      data.employee_id,
      data.skill_name,
      data.skill_category || null,
      data.proficiency_level || 1,
      data.usage_count || 1,
      data.success_rate || 100,
      new Date().toISOString(),
    ]
  );
  return result.lastInsertRowid;
}

// 获取员工技能列表
export function getEmployeeSkills(employeeId: number, tenantId: number): Skill[] {
  return dbAll(
    "SELECT * FROM employee_skill_stats WHERE employee_id = ? AND tenant_id = ? ORDER BY proficiency_level DESC, usage_count DESC",
    [employeeId, tenantId]
  ) as Skill[];
}

// 获取所有技能（按类别分组）
export function getAllSkills(tenantId: number): any[] {
  const skills = dbAll(
    "SELECT * FROM employee_skill_stats WHERE tenant_id = ? ORDER BY skill_category, proficiency_level DESC",
    [tenantId]
  ) as Skill[];

  const grouped: Record<string, Skill[]> = {};
  for (const skill of skills) {
    const category = skill.skill_category || '未分类';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(skill);
  }

  return Object.entries(grouped).map(([category, items]) => ({
    category,
    skills: items,
    count: items.length,
    avgProficiency: Math.round(items.reduce((a, b) => a + b.proficiency_level, 0) / items.length),
  }));
}

// 更新技能使用
export function useSkill(skillId: number, tenantId: number, success: boolean): void {
  const skill = dbGet("SELECT * FROM employee_skill_stats WHERE id = ? AND tenant_id = ?", [skillId, tenantId]) as Skill | undefined;
  if (!skill) return;

  const newSuccessRate = success
    ? (skill.success_rate * skill.usage_count + 100) / (skill.usage_count + 1)
    : (skill.success_rate * skill.usage_count) / (skill.usage_count + 1);

  dbRun(
    "UPDATE employee_skill_stats SET usage_count = usage_count + 1, success_rate = ?, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
    [Math.round(newSuccessRate), skillId, tenantId]
  );
}

// 删除技能
export function deleteSkill(id: number, tenantId: number): void {
  dbRun("DELETE FROM employee_skill_stats WHERE id = ? AND tenant_id = ?", [id, tenantId]);
}

// 获取员工反思统计
export function getReflectionStats(employeeId: number, tenantId: number): any {
  const stats = dbGet(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN reflection_type = 'task_completion' THEN 1 ELSE 0 END) as task_reflections,
            SUM(CASE WHEN reflection_type = 'error_learning' THEN 1 ELSE 0 END) as error_reflections,
            AVG(importance_score) as avg_importance
     FROM reflections WHERE employee_id = ? AND tenant_id = ?`,
    [employeeId, tenantId]
  ) as any;

  const skillCount = dbGet(
    "SELECT COUNT(*) as count, AVG(proficiency_level) as avg_level FROM employee_skill_stats WHERE employee_id = ? AND tenant_id = ?",
    [employeeId, tenantId]
  ) as any;

  return {
    total_reflections: stats?.total || 0,
    task_reflections: stats?.task_reflections || 0,
    error_reflections: stats?.error_reflections || 0,
    avg_importance: Math.round(stats?.avg_importance || 0),
    skill_count: skillCount?.count || 0,
    avg_skill_level: Math.round(skillCount?.avg_level || 0),
  };
}
