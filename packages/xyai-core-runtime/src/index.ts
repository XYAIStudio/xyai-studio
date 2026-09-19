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
