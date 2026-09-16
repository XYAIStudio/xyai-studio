/** 高风险操作审批契约 */

export type ApprovalDecision = 'approved' | 'denied' | 'deferred';

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  taskId?: string;
  action: string;
  detail: string;
  risk: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface ApprovalResolution {
  requestId: string;
  decision: ApprovalDecision;
  resolvedAt: string;
  note?: string;
}

export interface ApprovalPolicy {
  evaluate(request: ApprovalRequest): Promise<ApprovalDecision | 'ask'>;
}
