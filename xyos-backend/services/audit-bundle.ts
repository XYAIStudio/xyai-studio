/**
 * V0.80 R3 知识快照、证据包与撤销服务
 *
 * 1. KnowledgeSnapshot: 知识库定期快照
 * 2. EvidenceBundle: 链式哈希证据包（内容直存，防序列化失真）
 * 3. RevocationService: 全局撤销操作日志
 */

import { dbGet, dbAll, dbRun } from "../db";
import crypto from "crypto";

// ============================================================
// 1. 知识快照
// ============================================================

export function createKnowledgeSnapshot(tenantId: number, type: "manual" | "scheduled" = "manual"): number {
  const files = dbAll("SELECT id, original_name, file_type, file_size, status FROM knowledge_files WHERE tenant_id = ?", [tenantId]);
  const notes = dbAll("SELECT id, title, tags, source FROM knowledge_notes WHERE tenant_id = ?", [tenantId]);
  const state = JSON.stringify({ files, notes, timestamp: new Date().toISOString() });
  const checksum = crypto.createHash("sha256").update(state).digest("hex").slice(0, 16);
  const r = dbRun("INSERT INTO knowledge_snapshots (tenant_id, snapshot_type, state_json, checksum) VALUES (?,?,?,?)", [tenantId, type, state, checksum]);
  return r.lastInsertRowid;
}

export function listSnapshots(tenantId: number) {
  return dbAll("SELECT id, tenant_id, snapshot_type, checksum, created_at FROM knowledge_snapshots WHERE tenant_id = ? ORDER BY created_at DESC", [tenantId]);
}

export function getSnapshot(snapshotId: number, tenantId: number) {
  return dbGet("SELECT * FROM knowledge_snapshots WHERE id = ? AND tenant_id = ?", [snapshotId, tenantId]);
}

export function diffSnapshots(idA: number, idB: number, tenantId: number): { added: number; removed: number; changed: number } {
  const a = getSnapshot(idA, tenantId) as any;
  const b = getSnapshot(idB, tenantId) as any;
  if (!a || !b) throw new Error("快照不存在");
  const sa = JSON.parse(a.state_json), sb = JSON.parse(b.state_json);
  const idsA = new Set(sa.files.map((f: any) => f.id));
  const idsB = new Set(sb.files.map((f: any) => f.id));
  return {
    added: [...idsB].filter(id => !idsA.has(id)).length,
    removed: [...idsA].filter(id => !idsB.has(id)).length,
    changed: [...idsA].filter(id => idsB.has(id)).filter(id => {
      const fa = sa.files.find((x: any) => x.id === id);
      const fb = sb.files.find((x: any) => x.id === id);
      return fa && fb && (fa.file_size !== fb.file_size || fa.status !== fb.status);
    }).length,
  };
}

// ============================================================
// 2. 证据包（链式哈希）
// ============================================================

export interface EvidenceItem {
  type: string; timestamp: string; actor: string;
  action: string; target: string; details: Record<string, unknown>;
}

/**
 * 创建证据包。
 * 将 items 序列化为 JSON，连同描述、前驱哈希一起计算 SHA-256。
 * 内容不可变——后续验证时只需重算哈希比对。
 */
export function createEvidenceBundle(tenantId: number, description: string, items: EvidenceItem[]): string {
  const last = dbGet("SELECT bundle_hash FROM evidence_bundles WHERE tenant_id = ? ORDER BY id DESC LIMIT 1", [tenantId]) as any;
  const previousHash = last?.bundle_hash ?? null;
  const timestamp = new Date().toISOString();

  // 将 items + 元数据序列化为不可变内容
  const content = JSON.stringify({ description, items, previousHash, timestamp });
  const bundleHash = crypto.createHash("sha256").update(content).digest("hex");

  // 存一条记录（content 和 hash 一起存，验证时直接比对）
  dbRun(
    "INSERT INTO evidence_bundles (tenant_id, description, bundle_hash, previous_hash, content, created_by, created_at) VALUES (?,?,?,?,?,?,?)",
    [tenantId, description, bundleHash, previousHash, content, 0, timestamp]
  );

  return bundleHash;
}

/**
 * 验证证据包：从 content 重算哈希，与 bundle_hash 比对
 */
export function verifyEvidenceBundle(bundleHash: string): { valid: boolean; chainBrokenAt?: string } {
  const bundle = dbGet("SELECT * FROM evidence_bundles WHERE bundle_hash = ?", [bundleHash]) as any;
  if (!bundle) return { valid: false, chainBrokenAt: "not_found" };

  // 前驱链验证
  if (bundle.previous_hash) {
    const prev = dbGet("SELECT id FROM evidence_bundles WHERE bundle_hash = ?", [bundle.previous_hash]);
    if (!prev) return { valid: false, chainBrokenAt: bundle.previous_hash };
  }

  // 重算哈希
  const recomputed = crypto.createHash("sha256").update(bundle.content).digest("hex");
  return { valid: recomputed === bundleHash };
}

/**
 * 获取证据包内容（解析 JSON）
 */
export function getEvidenceBundle(bundleHash: string): { description: string; items: EvidenceItem[]; previousHash: string | null; timestamp: string } | null {
  const bundle = dbGet("SELECT * FROM evidence_bundles WHERE bundle_hash = ?", [bundleHash]) as any;
  if (!bundle) return null;
  const parsed = JSON.parse(bundle.content);
  return {
    description: parsed.description,
    items: parsed.items,
    previousHash: parsed.previousHash,
    timestamp: parsed.timestamp,
  };
}

// ============================================================
// 3. 撤销服务
// ============================================================

export function recordRevocation(entityType: string, entityId: number, reason: string, userId: number, tenantId: number): number {
  const r = dbRun("INSERT INTO revocations (entity_type, entity_id, reason, reverted_by, tenant_id) VALUES (?,?,?,?,?)", [entityType, entityId, reason, userId, tenantId]);
  return r.lastInsertRowid;
}

export function isRevoked(entityType: string, entityId: number): boolean {
  return !!dbGet("SELECT id FROM revocations WHERE entity_type = ? AND entity_id = ?", [entityType, entityId]);
}

export function listRevocations(tenantId: number) {
  return dbAll("SELECT * FROM revocations WHERE tenant_id = ? ORDER BY reverted_at DESC LIMIT 100", [tenantId]);
}
