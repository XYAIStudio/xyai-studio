/**
 * Map Studio interop agent assets → OpenXYOS talent_pool / reserve employees shape.
 * Pure helpers (no DB / fetch) for unit tests and shared docs with OpenXYOS route.
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
  source: 'xyai-studio';
  rating: number;
  status: 'available';
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
};

export type AgentPublishPlan = {
  agentType: string;
  interopId: string;
  talent: TalentUpsertRow;
  employee: ReserveEmployeeUpsertRow;
  capabilitiesObj: Record<string, unknown>;
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

function skillsFromPayload(payload: Record<string, unknown> | undefined): string {
  if (!payload) return '';
  if (typeof payload.skills === 'string') return payload.skills.trim();
  if (Array.isArray(payload.skills)) {
    return payload.skills.map((s) => String(s).trim()).filter(Boolean).join(',');
  }
  if (Array.isArray(payload.capabilities)) {
    return payload.capabilities.map((s) => String(s).trim()).filter(Boolean).join(',');
  }
  return '';
}

/**
 * Build upsert rows for talent_pool + reserve employees from an interop agent asset.
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
    schema: 'xyai.interop-agent.v1',
    interop_id: asset.id,
    source: 'xyai-studio',
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
    source: 'xyai-studio',
    rating: 5,
    status: 'available',
    agent_type: agentType,
    capabilities: JSON.stringify(capabilitiesObj),
    provider: 'XYAI Studio',
    integration_type: 'xyai-interop-v1',
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
  };

  return { agentType, interopId: asset.id, talent, employee, capabilitiesObj };
}

/** SQL shapes used by OpenXYOS upsert (for contract tests). */
export const TALENT_UPSERT_SQL = {
  selectByAgentType:
    "SELECT id, status FROM talent_pool WHERE tenant_id = ? AND agent_type = ?",
  selectByInteropCap:
    "SELECT id, status FROM talent_pool WHERE tenant_id = ? AND capabilities LIKE ?",
  update: `UPDATE talent_pool SET talent_type = 'ai', name = ?, avatar_emoji = ?, skills = ?, category = ?,
    description = ?, source = 'xyai-studio', rating = ?, status = 'available', capabilities = ?,
    provider = ?, integration_type = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?`,
  insert: `INSERT INTO talent_pool
    (tenant_id, talent_type, name, avatar_emoji, skills, category, description, source, rating, status,
     agent_type, capabilities, provider, integration_type)
    VALUES (?, 'ai', ?, ?, ?, ?, ?, 'xyai-studio', ?, 'available', ?, ?, ?, ?)`,
} as const;

export const RESERVE_EMPLOYEE_UPSERT_SQL = {
  selectByAgentType:
    "SELECT id FROM employees WHERE tenant_id = ? AND agent_type = ? AND employment_category = 'reserve'",
  update: `UPDATE employees SET name = ?, role = ?, employee_type = 'ai', skills = ?, avatar_emoji = ?,
    status = 'active', employment_category = 'reserve', description = ?
    WHERE id = ? AND tenant_id = ?`,
  insert: `INSERT INTO employees
    (company_id, name, role, agent_type, employee_type, skills, avatar_emoji, status, employment_category, description, tenant_id)
    VALUES (?, ?, ?, ?, 'ai', ?, ?, 'active', 'reserve', ?, ?)`,
} as const;
