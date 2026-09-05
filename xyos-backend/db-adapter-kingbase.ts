/*
 * V0.60 R1 — 金仓 KingbaseES V9 数据库适配器
 *
 * 基于 pg.Pool（KingbaseES V9 原生兼容 PostgreSQL wire-protocol）。
 * 需要安装: npm install pg
 * 通过环境变量 DB_DIALECT=kingbase 启用。
 */

import { Pool, PoolClient, QueryResult as PgQueryResult } from "pg";
import type { DbAdapter, DbAdapterConfig, QueryResult } from "./db-adapter";

export class KingbaseAdapter implements DbAdapter {
  readonly dialect: "kingbase" = "kingbase";

  private pool: Pool | null = null;
  private config: DbAdapterConfig;
  private initialized = false;

  constructor(config: DbAdapterConfig) {
    this.config = {
      host: "localhost",
      port: 54321, // Kingbase 默认端口
      database: "kingbase",
      username: "system",
      password: "",
      schema: "xyos",
      connectionTimeout: 10000,
      ...config,
    };
  }

  async connect(): Promise<void> {
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: this.config.connectionTimeout ?? 10000,
    });

    // 连接验证
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("SELECT 1");
      // 设置 search_path 到指定 schema
      if (this.config.schema && this.config.schema !== "public") {
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.config.schema}`);
        await client.query(`SET search_path TO ${this.config.schema}, public`);
      }
    } finally {
      client.release();
    }

    this.initialized = true;
    console.log("[DB-Adapter] KingbaseES V9 connected (via pg)");
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.initialized = false;
  }

  // ============================================================
  // 核心数据操作
  // ============================================================

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const result = await this.executeQuery(sql, params);
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount ?? 0 };
  }

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const result = await this.executeQuery(sql, params);
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
      lastInsertId: result.rows?.[0]?.id as number | undefined,
    };
  }

  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    const client = await this.acquireClient();
    try {
      await client.query("BEGIN");
      for (const stmt of statements) {
        await client.query(stmt.sql, stmt.params ?? []);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async beginTransaction(): Promise<void> {
    await this.executeQuery("BEGIN");
  }

  async commit(): Promise<void> {
    await this.executeQuery("COMMIT");
  }

  async rollback(): Promise<void> {
    await this.executeQuery("ROLLBACK");
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  isConnected(): boolean {
    return this.initialized && this.pool !== null;
  }

  escapeIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  getPlaceholder(index: number): string {
    return `$${index}`;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private async executeQuery(sql: string, params: unknown[] = []): Promise<PgQueryResult> {
    const client = await this.acquireClient();
    try {
      return await client.query(sql, params);
    } finally {
      client.release();
    }
  }

  private async acquireClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error("[DB-Adapter] Kingbase not connected. Call connect() first.");
    }
    return this.pool.connect();
  }
}
