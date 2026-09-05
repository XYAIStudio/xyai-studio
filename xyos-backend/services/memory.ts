import { dbGet, dbAll, dbRun } from "../db";
import { FEATURE_FLAGS } from "../config/features";

export interface MemoryItem {
  id: number;
  agent_id: number;
  memory_type: string;
  content: string;
  reasoning_content?: string;
  importance_score: number;
  context_json?: string;
  tenant_id: number;
  created_at: string;
  expires_at?: string;
}

// ==================== 短期记忆 ====================

// 保存短期记忆
export function saveShortMemory(
  agentId: number,
  memoryType: string,
  content: string,
  reasoning?: string,
  context?: any,
  tenantId: number = 1
): number {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const importance = calculateImportance(memoryType, content);
  
  const result = dbRun(
    `INSERT INTO agent_short_memory (agent_id, memory_type, content, reasoning_content, importance_score, context_json, tenant_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [agentId, memoryType, content, reasoning || null, importance, context ? JSON.stringify(context) : null, tenantId, expiresAt]
  );
  
  return result.lastInsertRowid;
}

// 获取短期记忆列表
export function getShortMemories(agentId: number, limit: number = 20, tenantId: number = 1): MemoryItem[] {
  return dbAll(
    `SELECT * FROM agent_short_memory 
     WHERE agent_id = ? AND tenant_id = ? AND expires_at > datetime('now')
     ORDER BY created_at DESC LIMIT ?`,
    [agentId, tenantId, limit]
  ) as MemoryItem[];
}

// 获取所有短期记忆（用于Dream整合）
export function getAllExpiredShortMemories(tenantId: number = 1): MemoryItem[] {
  return dbAll(
    `SELECT * FROM agent_short_memory 
     WHERE tenant_id = ? AND expires_at <= datetime('now')
     ORDER BY importance_score DESC`,
    [tenantId]
  ) as MemoryItem[];
}

// 删除短期记忆
export function deleteShortMemory(id: number): void {
  dbRun("DELETE FROM agent_short_memory WHERE id = ?", [id]);
}

// ==================== 长期记忆 ====================

// 保存长期记忆
export function saveLongMemory(
  agentId: number,
  memoryType: string,
  content: string,
  importance: number = 50,
  sourceIds?: string,
  tenantId: number = 1
): number {
  const result = dbRun(
    `INSERT INTO agent_long_memory (agent_id, memory_type, content, importance_score, source_ids, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [agentId, memoryType, content, importance, sourceIds || null, tenantId]
  );
  
  return result.lastInsertRowid;
}

// 获取长期记忆列表
export function getLongMemories(agentId: number, limit: number = 50, tenantId: number = 1): MemoryItem[] {
  return dbAll(
    `SELECT * FROM agent_long_memory 
     WHERE agent_id = ? AND tenant_id = ?
     ORDER BY importance_score DESC, created_at DESC LIMIT ?`,
    [agentId, tenantId, limit]
  ) as MemoryItem[];
}

// 搜索记忆（关键词匹配）
export function searchMemories(agentId: number, query: string, limit: number = 10, tenantId: number = 1): MemoryItem[] {
  const shortMemories = dbAll(
    `SELECT *, 'short' as source FROM agent_short_memory 
     WHERE agent_id = ? AND tenant_id = ? AND content LIKE ? AND expires_at > datetime('now')
     ORDER BY importance_score DESC LIMIT ?`,
    [agentId, tenantId, `%${query}%`, limit]
  ) as any[];
  
  const longMemories = dbAll(
    `SELECT *, 'long' as source FROM agent_long_memory 
     WHERE agent_id = ? AND tenant_id = ? AND content LIKE ?
     ORDER BY importance_score DESC LIMIT ?`,
    [agentId, tenantId, `%${query}%`, limit]
  ) as any[];
  
  // 合并并按重要性排序
  return [...shortMemories, ...longMemories]
    .sort((a, b) => b.importance_score - a.importance_score)
    .slice(0, limit);
}

// ==================== 重要性评分 ====================

// 计算记忆重要性（0-100）
export function calculateImportance(memoryType: string, content: string): number {
  let score = 0;
  
  // 因素1：记忆类型权重
  const typeWeights: Record<string, number> = {
    'decision': 40,
    'error_learn': 45,
    'success_case': 35,
    'task_context': 25,
    'conversation': 10,
    'observation': 20,
  };
  score += typeWeights[memoryType] || 15;
  
  // 因素2：内容长度（越长可能越重要）
  if (content.length > 200) score += 10;
  if (content.length > 500) score += 10;
  
  // 因素3：包含关键决策词
  const decisionWords = ['决定', '确认', '通过', '方案', '结论', '重要', '关键', '紧急'];
  for (const word of decisionWords) {
    if (content.includes(word)) score += 5;
  }
  
  // 因素4：包含数字/数据
  if (/\d+/.test(content)) score += 5;
  
  return Math.min(100, Math.max(0, score));
}

// ==================== Dream记忆整合 ====================

export interface DreamReport {
  memoriesScanned: number;
  memoriesPromoted: number;
  memoriesArchived: number;
  memoriesDeleted: number;
  report: string;
}

// 执行Dream整合
export function runDreamCycle(tenantId: number = 1): DreamReport {
  let scanned = 0;
  let promoted = 0;
  let archived = 0;
  let deleted = 0;
  
  // 1. 扫描过期的短期记忆
  const expiredMemories = getAllExpiredShortMemories(tenantId);
  scanned = expiredMemories.length;
  
  for (const memory of expiredMemories) {
    // 2. 高重要性记忆晋升到长期记忆
    if (memory.importance_score >= 50) {
      saveLongMemory(
        memory.agent_id,
        memory.memory_type,
        memory.content,
        memory.importance_score,
        String(memory.id),
        tenantId
      );
      promoted++;
    }
    
    // 3. 删除过期记忆
    deleteShortMemory(memory.id);
    deleted++;
  }
  
  // 4. 清理低重要性的长期记忆（90天未访问且重要性<30）
  const oldLongMemories = dbAll(
    `SELECT * FROM agent_long_memory 
     WHERE tenant_id = ? AND importance_score < 30 
     AND (last_accessed IS NULL OR last_accessed < datetime('now', '-90 days'))`,
    [tenantId]
  ) as any[];
  
  for (const mem of oldLongMemories) {
    dbRun("DELETE FROM agent_long_memory WHERE id = ?", [mem.id]);
    archived++;
  }
  
  // 5. 生成报告
  const report = `Dream整合完成：扫描${scanned}条记忆，晋升${promoted}条到长期记忆，归档${archived}条低价值记忆，清理${deleted}条过期记忆`;
  
  // 6. 记录日志
  dbRun(
    `INSERT INTO dream_logs (trigger_type, memories_scanned, memories_promoted, memories_archived, memories_deleted, report, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['scheduled', scanned, promoted, archived, deleted, report, tenantId]
  );
  
  return { memoriesScanned: scanned, memoriesPromoted: promoted, memoriesArchived: archived, memoriesDeleted: deleted, report };
}

// 获取Dream日志
export function getDreamLogs(tenantId: number = 1, limit: number = 20): any[] {
  return dbAll(
    "SELECT * FROM dream_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?",
    [tenantId, limit]
  );
}

// ==================== 统计 ====================

export function getMemoryStats(agentId: number, tenantId: number = 1): any {
  const shortCount = dbGet(
    "SELECT COUNT(*) as c FROM agent_short_memory WHERE agent_id = ? AND tenant_id = ? AND expires_at > datetime('now')",
    [agentId, tenantId]
  ) as any;
  
  const longCount = dbGet(
    "SELECT COUNT(*) as c FROM agent_long_memory WHERE agent_id = ? AND tenant_id = ?",
    [agentId, tenantId]
  ) as any;
  
  const avgImportance = dbGet(
    "SELECT AVG(importance_score) as avg FROM agent_long_memory WHERE agent_id = ? AND tenant_id = ?",
    [agentId, tenantId]
  ) as any;
  
  return {
    short_term_count: shortCount?.c || 0,
    long_term_count: longCount?.c || 0,
    avg_importance: Math.round(avgImportance?.avg || 0),
  };
}

// ═══════════════════════════════════════════════════════════
// V4.3 向量记忆（语义搜索）
// ═══════════════════════════════════════════════════════════

// 简单的文本向量化：基于 TF-IDF 关键词权重生成稀疏向量
// 生产环境可替换为 embedding API（如 OpenAI text-embedding-3-small）
interface SparseVector {
  dims: number[];
  vals: number[];
}

/** 中文分词（简化版，基于字符 bigram） */
function tokenize(text: string): string[] {
  // 移除标点和空白
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ");
  const words: string[] = [];
  
  // 提取连续的中文/英文/数字片段
  const segments = cleaned.split(/\s+/).filter(s => s.length > 0);
  
  for (const seg of segments) {
    if (/^[\u4e00-\u9fa5]+$/.test(seg)) {
      // 中文：bigram 分词
      for (let i = 0; i < seg.length - 1; i++) {
        words.push(seg.slice(i, i + 2));
      }
      // 也保留单字
      if (seg.length <= 4) words.push(seg);
    } else {
      // 英文/数字：小写后加入
      words.push(seg.toLowerCase());
    }
  }
  
  return words;
}

/** 构建词汇表 */
function buildVocabulary(documents: string[]): Map<string, number> {
  const vocab = new Map<string, number>();
  let idx = 0;
  for (const doc of documents) {
    const tokens = tokenize(doc);
    for (const token of tokens) {
      if (!vocab.has(token)) {
        vocab.set(token, idx++);
      }
    }
  }
  return vocab;
}

/** 计算 TF-IDF 稀疏向量 */
function textToVector(text: string, vocab: Map<string, number>, idf: Map<string, number>): SparseVector {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  
  const dims: number[] = [];
  const vals: number[] = [];
  
  const totalTokens = tokens.length || 1;
  
  for (const [token, count] of tf) {
    const dim = vocab.get(token);
    if (dim === undefined) continue;
    
    const tfVal = count / totalTokens;
    const idfVal = idf.get(token) || 1;
    const tfidf = tfVal * Math.log(idfVal + 1);
    
    dims.push(dim);
    vals.push(tfidf);
  }
  
  return { dims, vals };
}

/** 余弦相似度 */
function cosineSimilarity(a: SparseVector, b: SparseVector): number {
  const aMap = new Map<number, number>();
  for (let i = 0; i < a.dims.length; i++) {
    aMap.set(a.dims[i], a.vals[i]);
  }
  
  let dotProduct = 0;
  let aNorm = 0;
  let bNorm = 0;
  
  for (let i = 0; i < a.vals.length; i++) {
    aNorm += a.vals[i] * a.vals[i];
  }
  for (let i = 0; i < b.vals.length; i++) {
    bNorm += b.vals[i] * b.vals[i];
    const aVal = aMap.get(b.dims[i]) || 0;
    dotProduct += aVal * b.vals[i];
  }
  
  if (aNorm === 0 || bNorm === 0) return 0;
  return dotProduct / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

/**
 * 语义搜索记忆（基于文本相似度）
 * V4.3 向量记忆：不再仅依赖关键词 LIKE 匹配，
 * 而是计算查询与每条记忆的文本相似度
 */
export function semanticSearchMemories(
  agentId: number,
  query: string,
  limit: number = 10,
  tenantId: number = 1
): MemoryItem[] {
  if (!FEATURE_FLAGS.ENABLE_VECTOR_MEMORY) {
    // Fallback 到关键词搜索
    return searchMemories(agentId, query, limit, tenantId);
  }

  // 获取候选记忆
  const shortMemories = dbAll(
    `SELECT *, 'short' as source FROM agent_short_memory 
     WHERE agent_id = ? AND tenant_id = ? AND expires_at > datetime('now')
     ORDER BY importance_score DESC LIMIT 100`,
    [agentId, tenantId]
  ) as any[];
  
  const longMemories = dbAll(
    `SELECT *, 'long' as source FROM agent_long_memory 
     WHERE agent_id = ? AND tenant_id = ?
     ORDER BY importance_score DESC LIMIT 100`,
    [agentId, tenantId]
  ) as any[];

  const allMemories = [...shortMemories, ...longMemories];
  if (allMemories.length === 0) return [];

  // 构建词汇表和 IDF
  const documents = allMemories.map((m: any) => m.content || "");
  documents.push(query); // 查询也加入词汇表
  const vocab = buildVocabulary(documents);
  
  // 计算 IDF
  const docCount = documents.length;
  const df = new Map<string, number>();
  for (const doc of documents) {
    const tokens = new Set(tokenize(doc));
    for (const token of tokens) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [token, count] of df) {
    idf.set(token, docCount / (count + 1));
  }

  // 查询向量
  const queryVec = textToVector(query, vocab, idf);

  // 计算每条记忆与查询的相似度
  const scored = allMemories.map((m: any) => ({
    memory: m as MemoryItem,
    score: cosineSimilarity(queryVec, textToVector(m.content || "", vocab, idf)),
  }));

  // 按相似度降序排列
  scored.sort((a, b) => b.score - a.score);

  // 过滤掉相似度过低的（< 0.05）
  return scored
    .filter(s => s.score > 0.05)
    .slice(0, limit)
    .map(s => ({ ...s.memory, importance_score: Math.round(s.score * 100) }));
}

/** 批量语义去重：检查新记忆是否与已有记忆高度相似 */
export function deduplicateMemory(
  agentId: number,
  content: string,
  threshold: number = 0.85,
  tenantId: number = 1
): MemoryItem | null {
  const candidates = dbAll(
    `SELECT *, 'long' as source FROM agent_long_memory 
     WHERE agent_id = ? AND tenant_id = ?
     ORDER BY created_at DESC LIMIT 50`,
    [agentId, tenantId]
  ) as any[];

  if (candidates.length === 0) return null;

  const documents = candidates.map((c: any) => c.content || "");
  documents.push(content);
  const vocab = buildVocabulary(documents);
  const idf = new Map<string, number>();
  for (const token of vocab.keys()) {
    idf.set(token, 1);
  }

  const newVec = textToVector(content, vocab, idf);

  for (const candidate of candidates) {
    const candVec = textToVector(candidate.content || "", vocab, idf);
    const sim = cosineSimilarity(newVec, candVec);
    if (sim >= threshold) {
      return candidate as MemoryItem;
    }
  }

  return null;
}
