-- V0.80 R3 知识快照、证据包与撤销服务

-- 知识快照表
CREATE TABLE IF NOT EXISTS knowledge_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  snapshot_type TEXT DEFAULT 'manual',
  state_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 证据包元数据
CREATE TABLE IF NOT EXISTS evidence_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  description TEXT,
  bundle_hash TEXT UNIQUE NOT NULL,
  previous_hash TEXT,
  content TEXT NOT NULL,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 证据项
CREATE TABLE IF NOT EXISTS evidence_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bundle_hash TEXT NOT NULL REFERENCES evidence_bundles(bundle_hash),
  item_type TEXT NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  details_json TEXT DEFAULT '{}',
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 撤销记录
CREATE TABLE IF NOT EXISTS revocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  reason TEXT,
  reverted_by INTEGER,
  tenant_id INTEGER NOT NULL,
  reverted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
