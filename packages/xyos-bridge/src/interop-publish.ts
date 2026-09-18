/**
 * Map Studio interop assets → OpenXYOS official import bodies.
 * Agents: POST /api/xyai/agents/import (talent status=recruited, reserve employees).
 * Knowledge: POST /api/xyai/knowledge/import (knowledge_files folder=/ + notes).
 */

export type InteropPublishAsset = {
  id: string;
  kind: string;
  name: string;
  description?: string;
  payload?: Record<string, unknown>;
};

export type TalentUpsertRow = {
  tenant_id: number;
  talent_type: 'ai';
  name: string;
  avatar_emoji: string;
  skills: string;
  category: string;
  description: string;
  source: 'studio';
  rating: number;
  status: 'recruited';
  agent_type: string;
  capabilities: string;
  provider: string;
  integration_type: string;
};

export type ReserveEmployeeUpsertRow = {
  company_id: number;
  name: string;
  role: string;
  agent_type: string;
  employee_type: 'ai';
  skills: string;
  avatar_emoji: string;
  status: 'active';
  employment_category: 'reserve';
  description: string;
  tenant_id: number;
  source: string;
};

export type AgentPublishPlan = {
  agentType: string;
  interopId: string;
  talent: TalentUpsertRow;
  employee: ReserveEmployeeUpsertRow;
  capabilitiesObj: Record<string, unknown>;
};

export type AgentImportBody = {
  name: string;
  role: string;
  title: string;
  description: string;
  positioning: string;
  industry: string;
  agent_type: string;
  skills: string[];
  capabilities: string[];
  avatar_emoji: string;
  employee_type: 'ai';
  external_id: string;
  source_id: string;
  studio_id: string;
  asset: InteropPublishAsset;
};

export type KnowledgeImportBody = {
  name: string;
  description: string;
  external_id: string;
  source_id: string;
  studio_id: string;
  payload: Record<string, unknown>;
  asset: InteropPublishAsset;
};

const DEFAULT_TENANT = 1;

export function safeAgentSlug(raw: string): string {
  const ascii = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return ascii || 'agent';
}

/** Stable unique agent_type from interop asset id (idempotent across re-push). */
export function deriveAgentTypeFromInteropId(interopId: string): string {
  return `xyai-${safeAgentSlug(interopId)}`;
}

function asText(value: unknown, fallback = ''): string {
  const out = String(value ?? '').trim();
  return out || fallback;
}

function listFromPayload(
  payload: Record<string, unknown> | undefined,
  keys: string[],
): string[] {
  if (!payload) return [];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.map((s) => String(s).trim()).filter(Boolean);
    }
  }
  return [];
}

function skillsFromPayload(payload: Record<string, unknown> | undefined): string {
  return listFromPayload(payload, ['skills', 'capabilities']).join(',');
}

/**
 * Build upsert rows matching OpenXYOS official Studio import:
 * talent_pool source=studio status=recruited; employees reserve source=studio:{id}.
 */
export function buildAgentPublishPlan(
  asset: InteropPublishAsset,
  opts?: { tenantId?: number },
): AgentPublishPlan {
  const tenantId =
    Number.isInteger(opts?.tenantId) && (opts!.tenantId as number) > 0
      ? (opts!.tenantId as number)
      : DEFAULT_TENANT;
  const payload = asset.payload && typeof asset.payload === 'object' ? asset.payload : {};
  const agentType = deriveAgentTypeFromInteropId(asset.id);
  const name = asText(asset.name, '未命名智能体');
  const description = asText(
    asset.description,
    asText(payload.subtitle, asText(payload.positioning, 'XYAI Studio 推送的 AI 智能助手')),
  );
  const skills = skillsFromPayload(payload) || '通用助手';
  const category = asText(payload.category, asText(payload.industry, 'AI智能助手'));
  const emoji = asText(payload.avatar_emoji, asText(payload.emoji, '🤖'));
  const role = asText(payload.role, category);

  const capabilitiesObj: Record<string, unknown> = {
    schema: 'openxyos.studio-agent.v1',
    interop_id: asset.id,
    source: 'studio',
    agentId: payload.agentId ?? null,
    payload,
  };

  const talent: TalentUpsertRow = {
    tenant_id: tenantId,
    talent_type: 'ai',
    name,
    avatar_emoji: emoji,
    skills,
    category,
    description,
    source: 'studio',
    rating: 5,
    status: 'recruited',
    agent_type: agentType,
    capabilities: JSON.stringify(capabilitiesObj),
    provider: 'studio',
    integration_type: 'studio-interop',
  };

  const employee: ReserveEmployeeUpsertRow = {
    company_id: 1,
    name,
    role,
    agent_type: agentType,
    employee_type: 'ai',
    skills,
    avatar_emoji: emoji,
    status: 'active',
    employment_category: 'reserve',
    description,
    tenant_id: tenantId,
    source: `studio:${asset.id}`,
  };

  return { agentType, interopId: asset.id, talent, employee, capabilitiesObj };
}

/** Official flattened POST body for `/api/xyai/agents/import`. */
export function buildAgentImportBody(asset: InteropPublishAsset): AgentImportBody {
  const plan = buildAgentPublishPlan(asset);
  const payload = asset.payload && typeof asset.payload === 'object' ? asset.payload : {};
  const skills = listFromPayload(payload, ['skills', 'capabilities']);
  const capabilities = listFromPayload(payload, ['capabilities', 'skills']);
  return {
    name: plan.talent.name,
    role: plan.employee.role,
    title: plan.employee.role,
    description: plan.talent.description,
    positioning: asText(payload.positioning, asText(payload.subtitle)),
    industry: asText(payload.industry, asText(payload.category)),
    agent_type: plan.agentType,
    skills: skills.length ? skills : plan.talent.skills.split(',').filter(Boolean),
    capabilities: capabilities.length ? capabilities : skills,
    avatar_emoji: plan.talent.avatar_emoji,
    employee_type: 'ai',
    external_id: asset.id,
    source_id: asset.id,
    studio_id: asset.id,
    asset,
  };
}

/** Official flattened POST body for `/api/xyai/knowledge/import`. */
export function buildKnowledgeImportBody(asset: InteropPublishAsset): KnowledgeImportBody {
  const payload = asset.payload && typeof asset.payload === 'object' ? asset.payload : {};
  return {
    name: asText(asset.name, '未命名知识库'),
    description: asText(asset.description, asText(payload.subtitle)),
    external_id: asset.id,
    source_id: asset.id,
    studio_id: asset.id,
    payload,
    asset,
  };
}

/** SQL shapes used by OpenXYOS upsert (for contract tests). */
export const TALENT_UPSERT_SQL = {
  selectByExternalId:
    "SELECT id, status FROM talent_pool WHERE tenant_id = ? AND source = 'studio' AND external_id = ?",
  update: `UPDATE talent_pool SET talent_type = 'ai', name = ?, avatar_emoji = ?, skills = ?, category = ?,
    description = ?, source = 'studio', rating = ?, status = 'recruited', capabilities = ?,
    provider = ?, integration_type = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?`,
  insert: `INSERT INTO talent_pool
    (tenant_id, talent_type, name, avatar_emoji, skills, category, description, source, rating, status,
     agent_type, capabilities, provider, integration_type, external_id)
    VALUES (?, 'ai', ?, ?, ?, ?, ?, 'studio', ?, 'recruited', ?, ?, ?, 'studio-interop', ?)`,
} as const;

export const RESERVE_EMPLOYEE_UPSERT_SQL = {
  selectBySource:
    "SELECT id FROM employees WHERE tenant_id = ? AND source = ?",
  update: `UPDATE employees SET name = ?, role = ?, employee_type = 'ai', skills = ?, avatar_emoji = ?,
    status = 'active', employment_category = 'reserve', description = ?
    WHERE id = ? AND tenant_id = ?`,
  insert: `INSERT INTO employees
    (company_id, name, role, agent_type, employee_type, skills, avatar_emoji, status, employment_category, description, tenant_id, source)
    VALUES (?, ?, ?, ?, 'ai', ?, ?, 'active', 'reserve', ?, ?, ?)`,
} as const;
