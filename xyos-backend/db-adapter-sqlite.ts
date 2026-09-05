/*
 * XYOS V4.5 — SQLite 适配器（默认）
 * 基于现有 sql.js 实现，包装为 DbAdapter 接口
 */

import { DbAdapter, DbAdapterConfig, QueryResult } from './db-adapter';

// 引用现有的数据库模块
let dbInstance: any = null;

export class SqliteAdapter implements DbAdapter {
  dialect: 'sqlite' = 'sqlite';
  private config: DbAdapterConfig;
  private connected: boolean = false;

  constructor(config: DbAdapterConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // 复用现有的 initDatabase()
    const { initDatabase } = await import('./db');
    await initDatabase();
    this.connected = true;
    console.log('[DB-Adapter] SQLite connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('[DB-Adapter] SQLite disconnected');
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    const db = await this.getDb();
    try {
      const stmt = db.prepare(sql);
      if (params && params.length > 0) {
        stmt.bind(params);
      }
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return { rows, rowCount: rows.length };
    } catch (err) {
      console.error('[DB-Adapter] Query error:', err);
      throw err;
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    const db = await this.getDb();
    try {
      db.run(sql, params);
      const lastInsertId = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] as number;
      const changes = db.getRowsModified();
      return { rows: [], rowCount: changes, lastInsertId };
    } catch (err) {
      console.error('[DB-Adapter] Execute error:', err);
      throw err;
    }
  }

  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    const db = await this.getDb();
    try {
      db.run("BEGIN TRANSACTION");
      for (const stmt of statements) {
        db.run(stmt.sql, stmt.params);
      }
      db.run("COMMIT");
    } catch (err) {
      db.run("ROLLBACK");
      throw err;
    }
  }

  async beginTransaction(): Promise<void> {
    const db = await this.getDb();
    db.run("BEGIN TRANSACTION");
  }

  async commit(): Promise<void> {
    const db = await this.getDb();
    db.run("COMMIT");
  }

  async rollback(): Promise<void> {
    const db = await this.getDb();
    db.run("ROLLBACK");
  }

  isConnected(): boolean {
    return this.connected;
  }

  escapeIdentifier(name: string): string {
    return `"${name}"`;
  }

  getPlaceholder(index: number): string {
    return '?';
  }

  private async getDb(): Promise<any> {
    if (!dbInstance) {
      const dbModule = await import('./db');
      dbInstance = dbModule.getDb ? dbModule.getDb() : (dbModule as any).db;
    }
    return dbInstance;
  }
}
