/** Connection protocol and durable employee documents owned by the XYAI AI Team plugin. */

/** Host/browser RPC channel for AI Team operations. */
export const AI_TEAM_CHANNEL = '/xyai-ai-team'

/** Employee configuration that becomes the teammate's initial working prompt. */
export interface EmployeeSettings {
  /** Concrete role and expected outputs. */
  instructions: string
  /** Stable project facts carried into fresh teammate sessions. */
  memory: string
  /** DSH skill names the teammate should prefer. */
  skills: string[]
  /** Scheduled responsibilities shown in the employee editor. */
  routines: string[]
  /** External systems this employee may use. */
  integrations: string[]
  /** Knowledge domains used for roster filtering. */
  knowledge: string[]
  /** Tool families expected for this role. */
  tools: string[]
}

/** One locally managed or marketplace-provided AI employee. */
export interface EmployeeRecord {
  id: string
  name: string
  category: string
  description: string
  source: 'builtin' | 'local' | 'market'
  revision: number
  published: EmployeeSettings
  draft?: EmployeeSettings
}

/** Point-in-time employee library returned with a compare-and-set revision. */
export interface EmployeeLibrary {
  revision: number
  employees: EmployeeRecord[]
}

/** Result of starting selected employees in one DSH Agent Team. */
export interface TeamStartResult {
  started: string[]
  existing: string[]
  failed: Array<{ employeeId: string; message: string }>
}

/** One durable team outcome awaiting acceptance or an external sync provider. */
export interface TeamOutcome {
  id: string
  sessionId: string
  revision: number
  title: string
  content: string
  status: 'draft' | 'returned' | 'accepted'
  sync: 'not_requested'
  receipt?: string
}

/** Uniform business envelope returned inside the Connection result. */
export type AiTeamAnswer<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }
