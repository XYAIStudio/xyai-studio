import { describe, expect, it } from 'vitest'
import { evaluateAgentBlueprint } from '../src/xyai-core/agent-production.ts'

describe('four-category agent production contract', () => {
  it('keeps the historic professional-advisor case evidence gate', () => {
    const blueprint = evaluateAgentBlueprint({ productionType: 'advisor', name: '尽调顾问', industry: '能源', description: '提供可复核的尽调结论', productionSpec: { targetUser: '尽调负责人', serviceBoundary: '只给出分析建议，不替代最终决策。', escalationRule: '发现合规、资金或安全风险时必须交由专家复核。', answerStructure: '结论、依据、风险、下一步' }, experience: '[典型案例] A\n专家判定：已通过\n[边界案例] B\n专家判定：已通过\n[反例] C\n专家判定：已通过' })
    expect(blueprint.productionGates.map(gate => gate.id)).toEqual(['advisor-user', 'advisor-boundary', 'advisor-escalation', 'advisor-output', 'advisor-experience', 'advisor-cases'])
  })

  it('rejects cyclic workflow definitions rather than treating them as a prompt', () => {
    expect(() => evaluateAgentBlueprint({ productionType: 'workflow', name: '审批流', industry: '制造', description: '把审批规则变为可执行流程', productionSpec: { trigger: '业务人员提交完整审批申请', owner: '流程责任人', exceptionStrategy: '资料不全时退回申请人并保留处理记录。', retryPolicy: '接口失败可以重试两次，仍失败转人工。', idempotencyRule: '以业务单据编号去重，重复提交返回原结果。', completionSignal: '生成审批回执并写入完成状态。' }, workflow: { nodes: [{ id: 'a', title: '校验', inputSpec: '完整申请单', outputSpec: '完整校验结果', acceptanceCriteria: '字段完整且合法', onFailure: '字段缺失时退回申请人补充完整资料', dependsOn: ['b'] }, { id: 'b', title: '审批', inputSpec: '完整校验结果', outputSpec: '正式审批回执', acceptanceCriteria: '主管审核通过', onFailure: '主管拒绝时退回申请并记录具体原因', dependsOn: ['a'] }] } })).toThrow('循环')
  })
})
