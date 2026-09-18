import { describe, expect, it } from 'vitest';
import {
  buildAgentPublishPlan,
  deriveAgentTypeFromInteropId,
  RESERVE_EMPLOYEE_UPSERT_SQL,
  TALENT_UPSERT_SQL,
} from './interop-publish.js';

describe('interop agent publish mapping', () => {
  it('derives stable unique agent_type from interop id', () => {
    expect(deriveAgentTypeFromInteropId('interop-ABC_123')).toBe(
      'xyai-interop-abc-123',
    );
    expect(deriveAgentTypeFromInteropId('interop-ABC_123')).toBe(
      deriveAgentTypeFromInteropId('interop-ABC_123'),
    );
  });

  it('maps agent asset to talent_pool + reserve employee rows', () => {
    const plan = buildAgentPublishPlan({
      id: 'interop-general-01',
      kind: 'agent',
      name: '通用智能体',
      description: 'AI智能助手',
      payload: { agentId: 'agent-general', skills: ['对话', '总结'] },
    });
    expect(plan.agentType).toBe('xyai-interop-general-01');
    expect(plan.talent.source).toBe('xyai-studio');
    expect(plan.talent.talent_type).toBe('ai');
    expect(plan.talent.status).toBe('available');
    expect(plan.talent.agent_type).toBe(plan.agentType);
    expect(plan.talent.tenant_id).toBe(1);
    expect(plan.talent.skills).toContain('对话');
    const caps = JSON.parse(plan.talent.capabilities) as {
      interop_id: string;
      schema: string;
    };
    expect(caps.interop_id).toBe('interop-general-01');
    expect(caps.schema).toBe('xyai.interop-agent.v1');

    expect(plan.employee.employee_type).toBe('ai');
    expect(plan.employee.employment_category).toBe('reserve');
    expect(plan.employee.status).toBe('active');
    expect(plan.employee.agent_type).toBe(plan.agentType);
    expect(plan.employee.company_id).toBe(1);
  });

  it('SQL contract includes talent status available and reserve category', () => {
    expect(TALENT_UPSERT_SQL.insert).toContain("'xyai-studio'");
    expect(TALENT_UPSERT_SQL.insert).toContain("'available'");
    expect(TALENT_UPSERT_SQL.insert).toContain('agent_type');
    expect(RESERVE_EMPLOYEE_UPSERT_SQL.insert).toContain("'reserve'");
    expect(RESERVE_EMPLOYEE_UPSERT_SQL.insert).toContain("'ai'");
    expect(RESERVE_EMPLOYEE_UPSERT_SQL.selectByAgentType).toContain(
      "employment_category = 'reserve'",
    );
  });
});
