/*
 * XYOS V4.5 — 版本信息管理
 * 集中管理版本号、构建信息、升级路径
 */

export interface VersionInfo {
  /** 语义化版本号 */
  semver: string;
  /** 版本代号 */
  codename: string;
  /** 发布日期 */
  releaseDate: string;
  /** 功能集版本 */
  featureVersion: string;
  /** 构建号 */
  buildNumber: number;
  /** Git commit hash */
  gitHash: string;
  /** 是否预发布版本 */
  isPrerelease: boolean;
}

export interface UpgradePath {
  from: string;
  to: string;
  migrations: string[];
  requiredFeatures: string[];
  breakingChanges: string[];
}

/**
 * 当前版本信息
 */
export const CURRENT_VERSION: VersionInfo = {
  semver: '4.5.2',
  codename: 'BranchControl',
  releaseDate: '2026-06-27',
  featureVersion: 'v4.5',
  buildNumber: 452,
  gitHash: process.env.GIT_HASH || 'unknown',
  isPrerelease: false,
};

/**
 * 版本历史
 */
export const VERSION_HISTORY: VersionInfo[] = [
  {
    semver: '4.0.0',
    codename: 'Origin',
    releaseDate: '2025-01-01',
    featureVersion: 'v4.0',
    buildNumber: 400,
    gitHash: 'unknown',
    isPrerelease: false,
  },
  {
    semver: '4.1.0',
    codename: 'HITL',
    releaseDate: '2025-03-15',
    featureVersion: 'v4.1',
    buildNumber: 410,
    gitHash: 'unknown',
    isPrerelease: false,
  },
  {
    semver: '4.2.0',
    codename: 'MCP',
    releaseDate: '2025-04-20',
    featureVersion: 'v4.2',
    buildNumber: 420,
    gitHash: 'unknown',
    isPrerelease: false,
  },
  {
    semver: '4.3.0',
    codename: 'Agent',
    releaseDate: '2025-05-15',
    featureVersion: 'v4.3',
    buildNumber: 430,
    gitHash: 'unknown',
    isPrerelease: false,
  },
  {
    semver: '4.4.0',
    codename: 'Harmony',
    releaseDate: '2025-06-10',
    featureVersion: 'v4.4',
    buildNumber: 440,
    gitHash: 'unknown',
    isPrerelease: false,
  },
  CURRENT_VERSION,
];

/**
 * 升级路径定义
 * 从低版本升级到高版本需要执行的迁移脚本
 */
export const UPGRADE_PATHS: UpgradePath[] = [
  {
    from: '4.0.0',
    to: '4.1.0',
    migrations: ['001_add_pending_reviews.sql'],
    requiredFeatures: ['ENABLE_HUMAN_IN_THE_LOOP'],
    breakingChanges: [],
  },
  {
    from: '4.1.0',
    to: '4.2.0',
    migrations: ['002_add_mcp_connections.sql', '003_add_mcp_tool_call_logs.sql'],
    requiredFeatures: ['ENABLE_MCP_SERVER', 'ENABLE_MCP_CLIENT'],
    breakingChanges: [],
  },
  {
    from: '4.2.0',
    to: '4.3.0',
    migrations: ['004_add_memory_vectors.sql', '005_add_agent_reasoning_logs.sql'],
    requiredFeatures: ['ENABLE_VECTOR_MEMORY', 'ENABLE_STREAMING'],
    breakingChanges: [],
  },
  {
    from: '4.3.0',
    to: '4.4.0',
    migrations: [], // V4.4 主要是端侧变更，后端无数据库变更
    requiredFeatures: ['ENABLE_NATIVE_BRIDGE', 'ENABLE_OFFLINE_MODE'],
    breakingChanges: [],
  },
  {
    from: '4.4.0',
    to: '4.5.0',
    migrations: ['006_add_schema_migrations.sql', '007_add_db_adapter_config.sql'],
    requiredFeatures: ['ENABLE_DB_ADAPTER', 'ENABLE_PRIVATE_DEPLOY'],
    breakingChanges: ['数据库方言切换需要数据迁移'],
  },
];

/**
 * 获取从指定版本升级到当前版本需要的迁移列表
 */
export function getUpgradeMigrations(fromVersion: string): string[] {
  const migrations: string[] = [];
  let currentFrom = fromVersion;

  for (const path of UPGRADE_PATHS) {
    if (path.from === currentFrom) {
      migrations.push(...path.migrations);
      currentFrom = path.to;
      if (currentFrom === CURRENT_VERSION.semver) break;
    }
  }

  return migrations;
}

/**
 * 获取版本升级路径中的破坏性变更
 */
export function getBreakingChanges(fromVersion: string): string[] {
  const changes: string[] = [];
  let currentFrom = fromVersion;

  for (const path of UPGRADE_PATHS) {
    if (path.from === currentFrom) {
      changes.push(...path.breakingChanges);
      currentFrom = path.to;
      if (currentFrom === CURRENT_VERSION.semver) break;
    }
  }

  return changes;
}

/**
 * 比较版本号
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersion(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (partsA[i] < partsB[i]) return -1;
    if (partsA[i] > partsB[i]) return 1;
  }
  return 0;
}

/**
 * 检查是否需要升级
 */
export function needsUpgrade(currentDbVersion: string): boolean {
  return compareVersion(currentDbVersion, CURRENT_VERSION.semver) < 0;
}

export default CURRENT_VERSION;
