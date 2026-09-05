/**
 * V1.00 R5 高可用集群服务
 *
 * 组件：
 * 1. ClusterRegistry — 实例注册与发现
 * 2. HealthAggregator — 聚合多实例健康状态
 * 3. FailoverManager — 故障检测与转移
 * 4. LeaderElection — 简单 leader 选举（基于数据库锁）
 */

import { dbRun, dbGet, dbAll } from "../db";

// ============================================================
// 1. 集群实例注册
// ============================================================

export interface ClusterNode {
  id: number;
  instance_id: string;
  host: string;
  port: number;
  role: "leader" | "follower";
  status: "online" | "degraded" | "offline";
  last_heartbeat: string;
  metrics_json: string;
}

const INSTANCE_ID = `${process.env.HOSTNAME || "node"}-${process.pid}-${Date.now()}`;
const HEARTBEAT_INTERVAL = 5000; // 5 秒

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 注册当前实例到集群
 */
export function registerNode(host: string, port: number): void {
  dbRun(
    `INSERT OR REPLACE INTO cluster_nodes (instance_id, host, port, role, status, last_heartbeat)
     VALUES (?, ?, ?, 'follower', 'online', CURRENT_TIMESTAMP)`,
    [INSTANCE_ID, host, port]
  );

  // 启动心跳
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  }
}

function sendHeartbeat(): void {
  dbRun(
    "UPDATE cluster_nodes SET last_heartbeat = CURRENT_TIMESTAMP, status = 'online' WHERE instance_id = ?",
    [INSTANCE_ID]
  );
}

/**
 * 注销当前实例
 */
export function deregisterNode(): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  dbRun("UPDATE cluster_nodes SET status = 'offline' WHERE instance_id = ?", [INSTANCE_ID]);
}

/**
 * 列出集群中所有在线节点
 */
export function listOnlineNodes(): ClusterNode[] {
  // 标记超时节点为离线（30 秒无心跳）
  dbRun(
    "UPDATE cluster_nodes SET status = 'offline' WHERE status != 'offline' AND last_heartbeat < datetime('now', '-30 seconds')"
  );
  return dbAll(
    "SELECT * FROM cluster_nodes WHERE status IN ('online', 'degraded') ORDER BY role DESC, last_heartbeat DESC"
  ) as ClusterNode[];
}

// ============================================================
// 2. 健康聚合器
// ============================================================

export interface AggregatedHealth {
  totalNodes: number;
  onlineNodes: number;
  degradedNodes: number;
  clusterStatus: "healthy" | "degraded" | "critical";
  leaderPresent: boolean;
  averageResponseMs: number;
}

/**
 * 聚合集群健康状态
 */
export function aggregateHealth(): AggregatedHealth {
  const nodes = listOnlineNodes();
  const online = nodes.filter(n => n.status === "online");
  const degraded = nodes.filter(n => n.status === "degraded");

  let clusterStatus: AggregatedHealth["clusterStatus"] = "healthy";
  if (online.length === 0) clusterStatus = "critical";
  else if (degraded.length > 0 || online.length < 2) clusterStatus = "degraded";

  // 计算平均响应时间（从 metrics_json 中提取）
  let totalMs = 0, countMs = 0;
  for (const n of online) {
    try {
      const m = JSON.parse(n.metrics_json || "{}");
      if (m.avgResponseMs) { totalMs += m.avgResponseMs; countMs++; }
    } catch {}
  }

  return {
    totalNodes: nodes.length,
    onlineNodes: online.length,
    degradedNodes: degraded.length,
    clusterStatus,
    leaderPresent: nodes.some(n => n.role === "leader" && n.status === "online"),
    averageResponseMs: countMs > 0 ? Math.round(totalMs / countMs) : 0,
  };
}

// ============================================================
// 3. 故障转移
// ============================================================

/**
 * 检测 leader 是否存活，必要时触发选举
 */
export function checkAndFailover(): { action: "none" | "election" | "recovery"; details: string } {
  const nodes = listOnlineNodes();
  const leader = nodes.find(n => n.role === "leader");

  if (!leader || leader.status === "offline") {
    // Leader 消失 → 选新 leader
    const candidate = nodes.find(n => n.status === "online" && n.instance_id !== leader?.instance_id);
    if (candidate) {
      dbRun("UPDATE cluster_nodes SET role = 'follower' WHERE role = 'leader'");
      dbRun("UPDATE cluster_nodes SET role = 'leader' WHERE instance_id = ?", [candidate.instance_id]);
      return { action: "election", details: `新 leader 当选: ${candidate.instance_id}` };
    }
    return { action: "none", details: "无可用的候选节点" };
  }

  return { action: "none", details: "集群正常" };
}

// ============================================================
// 4. Leader 选举（简化：基于最早在线时间）
// ============================================================

/**
 * 触发选举：在线时间最早的节点成为 leader
 */
export function electLeader(): string | null {
  const online = dbAll(
    "SELECT instance_id FROM cluster_nodes WHERE status = 'online' ORDER BY last_heartbeat ASC LIMIT 1"
  ) as { instance_id: string }[];

  if (online.length === 0) return null;

  // 重置所有角色
  dbRun("UPDATE cluster_nodes SET role = 'follower' WHERE role = 'leader'");
  // 设置新 leader
  dbRun("UPDATE cluster_nodes SET role = 'leader' WHERE instance_id = ?", [online[0].instance_id]);

  return online[0].instance_id;
}

/**
 * 获取当前 leader
 */
export function getLeader(): ClusterNode | null {
  return dbGet(
    "SELECT * FROM cluster_nodes WHERE role = 'leader' AND status = 'online'"
  ) as ClusterNode | null;
}
