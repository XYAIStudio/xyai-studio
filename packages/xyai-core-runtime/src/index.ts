export {
  inferTurnCapability,
  isToolCapability,
  type TurnCapability,
} from './infer-capability.js';
export {
  STALL_TIMEOUT_CINDY_MS,
  STALL_TIMEOUT_TOOLS_MS,
  STALL_TIMEOUT_CHAT_MS,
  stallTimeoutForCapability,
  createStallWatchdog,
  watchStall,
  type StallWatchdog,
  type StallWatchdogOptions,
} from './stall-watchdog.js';
export { RuntimeSession, type RuntimeSessionOptions } from './runtime-session.js';
export {
  normalizeGatewayCatalog,
  findCatalogEntry,
  mapCatalogProtocol,
  type CatalogLocalInput,
  type CatalogCustomProviderInput,
  type CatalogCustomModelInput,
  type CatalogBuiltinInput,
  type NormalizeGatewayCatalogInput,
} from './catalog.js';
export {
  planModelGateway,
  inferProtocolFromRef,
} from './gateway.js';
export {
  isKnowledgeSeekingQuery,
  messageHasKnowledgePrefix,
  normalizeKnowledgeHits,
  formatKnowledgePrefix,
  planKnowledgeContext,
  applyKnowledgePrefix,
  resolveKnowledgeContext,
  stubKnowledgeIngest,
  emptyKnowledgeGateway,
  KNOWLEDGE_PREFIX_RE,
  type KnowledgeSourceInput,
  type KnowledgeHitInput,
  type NormalizeKnowledgeHitsInput,
  type KnowledgeContextReason,
  type KnowledgeContextPlan,
  type PlanKnowledgeContextInput,
} from './knowledge.js';

export type {
  SessionFacade,
  PermissionMode,
  AccessMode,
  AgentKind,
  GatewayPlan,
  GatewayLift,
  NormalizedModelEntry,
  CatalogProtocol,
  CatalogSource,
  KnowledgeSourceKind,
  KnowledgeHit,
  KnowledgeQuery,
  KnowledgeGateway,
} from '@xyai/contracts';

export {
  accessModeToPermissionMode,
  permissionModeToAccessMode,
  normalizeAccessMode,
  normalizePermissionMode,
  normalizeAgentKind,
  isAgentKind,
  ACCESS_MODES,
  PERMISSION_MODES,
  AGENT_KINDS,
} from '@xyai/contracts';
