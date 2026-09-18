import { describe, expect, it } from 'vitest';
import {
  buildAgentImportBody,
  buildAgentPublishPlan,
  buildKnowledgeImportBody,
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

  it('maps agent asset to recruited studio talent + reserve employee', () => {
    const plan = buildAgentPublishPlan({
      id: 'interop-general-01',
      kind: 'agent',
      name: '通用智能体',
      description: 'AI智能助手',
      payload: { agentId: 'agent-general', skills: ['对话', '总结'] },
    });
    expect(plan.agentType).toBe('xyai-interop-general-01');
    expect(plan.talent.source).toBe('studio');
    expect(plan.talent.talent_type).toBe('ai');
    expect(plan.talent.status).toBe('recruited');
    expect(plan.talent.integration_type).toBe('studio-interop');
    expect(plan.talent.agent_type).toBe(plan.agentType);
    expect(plan.talent.tenant_id).toBe(1);
    expect(plan.talent.skills).toContain('对话');
    const caps = JSON.parse(plan.talent.capabilities) as {
      interop_id: string;
      schema: string;
    };
    expect(caps.interop_id).toBe('interop-general-01');
    expect(caps.schema).toBe('openxyos.studio-agent.v1');

    expect(plan.employee.employee_type).toBe('ai');
    expect(plan.employee.employment_category).toBe('reserve');
    expect(plan.employee.status).toBe('active');
    expect(plan.employee.source).toBe('studio:interop-general-01');
    expect(plan.employee.agent_type).toBe(plan.agentType);
  });

  it('builds official flattened agent import body', () => {
    const body = buildAgentImportBody({
      id: 'interop-general-01',
      kind: 'agent',
      name: '通用智能体',
      description: 'AI智能助手',
      payload: { agentId: 'agent-general', skills: ['对话'] },
    });
    expect(body.name).toBe('通用智能体');
    expect(body.external_id).toBe('interop-general-01');
    expect(body.source_id).toBe('interop-general-01');
    expect(body.studio_id).toBe('interop-general-01');
    expect(body.employee_type).toBe('ai');
    expect(body.skills).toContain('对话');
    expect(body.asset.id).toBe('interop-general-01');
  });

  it('builds official knowledge import body', () => {
    const body = buildKnowledgeImportBody({
      id: 'kb-policy-01',
      kind: 'knowledge-mount',
      name: '政策库',
      description: '内部政策',
      payload: { kbId: 'kb-local-1', mountKind: 'local', sourceRoot: '/docs' },
    });
    expect(body.name).toBe('政策库');
    expect(body.external_id).toBe('kb-policy-01');
    expect(body.payload.kbId).toBe('kb-local-1');
    expect(body.asset.kind).toBe('knowledge-mount');
  });

  it('SQL contract uses studio source and recruited status', () => {
    expect(TALENT_UPSERT_SQL.insert).toContain("'studio'");
    expect(TALENT_UPSERT_SQL.insert).toContain("'recruited'");
    expect(TALENT_UPSERT_SQL.insert).toContain('external_id');
    expect(TALENT_UPSERT_SQL.insert).toContain('studio-interop');
    expect(RESERVE_EMPLOYEE_UPSERT_SQL.insert).toContain("'reserve'");
    expect(RESERVE_EMPLOYEE_UPSERT_SQL.insert).toContain("'ai'");
    expect(RESERVE_EMPLOYEE_UPSERT_SQL.selectBySource).toContain('source = ?');
  });
});
