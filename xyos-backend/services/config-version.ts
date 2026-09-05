import { dbGet, dbAll, dbRun } from "../db";

export interface ConfigVersion {
  id: number;
  tenant_id: number;
  config_type: string;
  config_key: string;
  config_value: string | null;
  version: number;
  change_reason: string | null;
  created_by: number | null;
  status: string;
}

// 保存配置版本
export function saveConfigVersion(data: Partial<ConfigVersion>): number {
  const latest = dbGet(
    "SELECT MAX(version) as max_version FROM config_versions WHERE tenant_id = ? AND config_type = ? AND config_key = ?",
    [data.tenant_id || 1, data.config_type, data.config_key]
  ) as any;

  const newVersion = (latest?.max_version || 0) + 1;

  const result = dbRun(
    `INSERT INTO config_versions (tenant_id, config_type, config_key, config_value, version, change_reason, created_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tenant_id || 1,
      data.config_type,
      data.config_key,
      data.config_value || null,
      newVersion,
      data.change_reason || null,
      data.created_by || null,
      data.status || 'active',
    ]
  );

  // 将旧版本标记为inactive
  dbRun(
    "UPDATE config_versions SET status = 'inactive' WHERE tenant_id = ? AND config_type = ? AND config_key = ? AND id != ?",
    [data.tenant_id || 1, data.config_type, data.config_key, result.lastInsertRowid]
  );

  return result.lastInsertRowid;
}

// 获取配置版本历史
export function getConfigVersions(tenantId: number, configType?: string, configKey?: string): ConfigVersion[] {
  let sql = "SELECT * FROM config_versions WHERE tenant_id = ?";
  const params: any[] = [tenantId];

  if (configType) { sql += " AND config_type = ?"; params.push(configType); }
  if (configKey) { sql += " AND config_key = ?"; params.push(configKey); }

  sql += " ORDER BY created_at DESC";
  return dbAll(sql, params) as ConfigVersion[];
}

// 获取当前配置
export function getCurrentConfig(tenantId: number, configType: string, configKey: string): ConfigVersion | undefined {
  return dbGet(
    "SELECT * FROM config_versions WHERE tenant_id = ? AND config_type = ? AND config_key = ? AND status = 'active'",
    [tenantId, configType, configKey]
  ) as ConfigVersion | undefined;
}

// 回滚到指定版本
export function rollbackConfig(tenantId: number, versionId: number): boolean {
  const version = dbGet(
    "SELECT * FROM config_versions WHERE id = ? AND tenant_id = ?",
    [versionId, tenantId]
  ) as ConfigVersion | undefined;

  if (!version) return false;

  // 将当前版本标记为inactive
  dbRun(
    "UPDATE config_versions SET status = 'inactive' WHERE tenant_id = ? AND config_type = ? AND config_key = ? AND status = 'active'",
    [tenantId, version.config_type, version.config_key]
  );

  // 创建新版本，复制回滚目标的值
  const latest = dbGet(
    "SELECT MAX(version) as max_version FROM config_versions WHERE tenant_id = ? AND config_type = ? AND config_key = ?",
    [tenantId, version.config_type, version.config_key]
  ) as any;

  const newVersion = (latest?.max_version || 0) + 1;

  dbRun(
    `INSERT INTO config_versions (tenant_id, config_type, config_key, config_value, version, change_reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      version.config_type,
      version.config_key,
      version.config_value,
      newVersion,
      `回滚到版本 ${version.version}`,
      'active',
    ]
  );

  return true;
}

// 删除配置版本
export function deleteConfigVersion(id: number, tenantId: number): void {
  dbRun("DELETE FROM config_versions WHERE id = ? AND tenant_id = ?", [id, tenantId]);
}

// 获取配置变更统计
export function getConfigStats(tenantId: number): any {
  const stats = dbAll(
    `SELECT config_type, COUNT(*) as count, MAX(version) as latest_version
     FROM config_versions WHERE tenant_id = ?
     GROUP BY config_type`,
    [tenantId]
  ) as any[];

  const recentChanges = dbAll(
    "SELECT * FROM config_versions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10",
    [tenantId]
  ) as ConfigVersion[];

  return {
    by_type: stats,
    recent_changes: recentChanges,
  };
}
