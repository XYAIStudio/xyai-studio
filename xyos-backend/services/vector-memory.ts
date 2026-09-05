/**
 * XYOS V4.3 — 向量记忆服务
 * 
 * 提供语义记忆检索能力，方案分层：
 * 1. 纯本地（默认）：基于 TF-IDF 文本相似度，已在 memory.ts 中实现
 * 2. 外部向量数据库（可选）：通过 VECTOR_DB_URL 连接 Qdrant/Chroma
 * 
 * 本文件为独立封装，提供统一的向量记忆操作接口
 */
import { FEATURE_FLAGS } from "../config/features";
import { 
  semanticSearchMemories, 
  deduplicateMemory, 
  searchMemories, 
  MemoryItem,
  saveShortMemory,
  saveLongMemory,
} from "./memory";

export interface VectorSearchResult {
  /** 记忆条目 */
  memory: MemoryItem;
  /** 相似度分数 (0-1) */
  score: number;
}

export interface VectorMemoryConfig {
  /** 向量数据库 URL（可选） */
  vectorDbUrl?: string;
  /** 向量数据库类型 */
  vectorDbType?: "qdrant" | "chroma" | "local";
  /** Embedding 模型 */
  embeddingModel?: string;
  /** 搜索返回数量 */
  topK?: number;
  /** 最低相似度阈值 */
  minScore?: number;
}

// ==================== 向量记忆管理器 ====================

export class VectorMemoryManager {
  private config: VectorMemoryConfig;
  private initialized = false;

  constructor(config: VectorMemoryConfig = {}) {
    this.config = {
      vectorDbUrl: process.env.VECTOR_DB_URL || "",
      vectorDbType: (process.env.VECTOR_DB_TYPE as any) || "local",
      embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      topK: 10,
      minScore: 0.05,
      ...config,
    };
  }

  /** 初始化（连接外部向量数据库等） */
  async init(): Promise<void> {
    if (this.initialized) return;

    if (this.config.vectorDbUrl && this.config.vectorDbType !== "local") {
      try {
        // 尝试连接外部向量数据库
        await this.testConnection();
        console.log(`[VectorMemory] 已连接到外部向量数据库: ${this.config.vectorDbType} @ ${this.config.vectorDbUrl}`);
      } catch (err: any) {
        console.warn(`[VectorMemory] 外部向量数据库连接失败，回退到本地模式: ${err.message}`);
        this.config.vectorDbType = "local";
      }
    }

    this.initialized = true;
  }

  /** 测试外部向量数据库连接 */
  private async testConnection(): Promise<void> {
    if (!this.config.vectorDbUrl) {
      throw new Error("未配置向量数据库地址");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      // Qdrant 健康检查
      if (this.config.vectorDbType === "qdrant") {
        const resp = await fetch(`${this.config.vectorDbUrl}/health`, {
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error(`Qdrant 健康检查失败: ${resp.status}`);
      }
      // Chroma 心跳检查
      else if (this.config.vectorDbType === "chroma") {
        const resp = await fetch(`${this.config.vectorDbUrl}/api/v1/heartbeat`, {
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error(`Chroma 心跳检查失败: ${resp.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /** 语义搜索 */
  async search(
    agentId: number,
    query: string,
    tenantId: number = 1
  ): Promise<VectorSearchResult[]> {
    await this.init();

    if (!FEATURE_FLAGS.ENABLE_VECTOR_MEMORY) {
      // Fallback 到关键词搜索
      const memories = searchMemories(agentId, query, this.config.topK || 10, tenantId);
      return memories.map((m) => ({ memory: m, score: 0.5 }));
    }

    // 使用 TF-IDF 语义搜索（memory.ts 中的实现）
    const memories = semanticSearchMemories(
      agentId,
      query,
      this.config.topK || 10,
      tenantId
    );

    return memories.map((m) => ({
      memory: m,
      score: m.importance_score / 100,
    }));
  }

  /** 保存记忆并建立向量索引 */
  async saveMemory(
    agentId: number,
    memoryType: string,
    content: string,
    reasoning?: string,
    context?: any,
    tenantId: number = 1
  ): Promise<number> {
    await this.init();

    // 去重检查
    const duplicate = deduplicateMemory(agentId, content, 0.85, tenantId);
    if (duplicate) {
      console.log(`[VectorMemory] 检测到重复记忆，跳过保存: ${content.slice(0, 50)}...`);
      return duplicate.id;
    }

    // 保存短期记忆
    const memoryId = saveShortMemory(
      agentId,
      memoryType,
      content,
      reasoning,
      context,
      tenantId
    );

    // 外部向量数据库索引（如果已连接）
    if (this.config.vectorDbType !== "local" && this.config.vectorDbUrl) {
      try {
        await this.indexToExternal(memoryId, content, tenantId);
      } catch (err: any) {
        console.warn(`[VectorMemory] 外部索引失败: ${err.message}`);
      }
    }

    return memoryId;
  }

  /** 将内容索引到外部向量数据库 */
  private async indexToExternal(
    memoryId: number,
    content: string,
    tenantId: number
  ): Promise<void> {
    // 这里预留外部向量数据库的索引接口
    // 实际实现取决于具体选择的向量数据库
    if (this.config.vectorDbType === "qdrant") {
      // await qdrantClient.upsert("memories", {
      //   id: memoryId,
      //   vector: await this.getEmbedding(content),
      //   payload: { memoryId, tenantId, content: content.slice(0, 1000) },
      // });
    }
  }

  /** 获取 Embedding（预留） */
  async getEmbedding(text: string): Promise<number[]> {
    // 简化实现：使用字符哈希生成伪向量
    // 生产环境应替换为真实的 embedding API
    const hash = this.simpleHash(text);
    const vector: number[] = [];
    for (let i = 0; i < 384; i++) {
      // 使用简单的正弦变换生成 384 维向量
      vector.push(Math.sin(hash * (i + 1) * 0.01) * 0.5);
    }
    return vector;
  }

  /** 简单哈希函数 */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

// ==================== 便捷函数 ====================

let defaultManager: VectorMemoryManager | null = null;

/** 获取默认向量记忆管理器 */
export function getVectorMemoryManager(): VectorMemoryManager {
  if (!defaultManager) {
    defaultManager = new VectorMemoryManager();
  }
  return defaultManager;
}

/** 语义搜索（便捷函数） */
export async function vectorSearch(
  agentId: number,
  query: string,
  tenantId: number = 1
): Promise<VectorSearchResult[]> {
  const manager = getVectorMemoryManager();
  return manager.search(agentId, query, tenantId);
}

/** 保存记忆并索引（便捷函数） */
export async function vectorSave(
  agentId: number,
  memoryType: string,
  content: string,
  reasoning?: string,
  context?: any,
  tenantId: number = 1
): Promise<number> {
  const manager = getVectorMemoryManager();
  return manager.saveMemory(agentId, memoryType, content, reasoning, context, tenantId);
}

export default {
  VectorMemoryManager,
  getVectorMemoryManager,
  vectorSearch,
  vectorSave,
};
