/*
 * XYOS V4.5 — 达梦 DM8 数据库适配器
 * 需要安装: npm install dmdb
 * 通过环境变量 DB_DIALECT=dameng 启用
 */

import { DbAdapter, DbAdapterConfig, QueryResult } from './db-adapter';

// 达梦数据库驱动（可选依赖，运行时加载）
let DmClient: any = null;

export class DamengAdapter implements DbAdapter {
  dialect: 'dameng' = 'dameng';
  private config: DbAdapterConfig;
  private connection: any = null;
  private connected: boolean = false;

  constructor(config: DbAdapterConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      DmClient = require('dmdb');
      this.connection = await DmClient.connect({
        host: this.config.host || 'localhost',
        port: this.config.port || 5236,
        user: this.config.username || 'SYSDBA',
        password: this.config.password || 'SYSDBA',
        database: this.config.database || 'XYOS',
        schema: this.config.schema || 'XYOS',
      });
      this.connected = true;
      console.log('[DB-Adapter] Dameng DM8 connected');
    } catch (err) {
      console.error('[DB-Adapter] Dameng connection failed:', err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    this.connected = false;
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    this.ensureConnected();
    const result = await this.connection.execute(sql, params || []);
    return {
      rows: result.rows || [],
      rowCount: result.rows?.length || 0,
    };
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    this.ensureConnected();
    const result = await this.connection.execute(sql, params || [], { autoCommit: true });
    return {
      rows: [],
      rowCount: result.rowsAffected || 0,
      lastInsertId: result.lastRowid,
    };
  }

  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    this.ensureConnected();
    await this.connection.execute('BEGIN');
    try {
      for (const stmt of statements) {
        await this.connection.execute(stmt.sql, stmt.params || []);
      }
      await this.connection.execute('COMMIT');
    } catch (err) {
      await this.connection.execute('ROLLBACK');
      throw err;
    }
  }

  async beginTransaction(): Promise<void> {
    this.ensureConnected();
    await this.connection.execute('BEGIN');
  }

  async commit(): Promise<void> {
    this.ensureConnected();
    await this.connection.execute('COMMIT');
  }

  async rollback(): Promise<void> {
    this.ensureConnected();
    await this.connection.execute('ROLLBACK');
  }

  isConnected(): boolean {
    return this.connected;
  }

  escapeIdentifier(name: string): string {
    return `"${name}"`;
  }

  getPlaceholder(index: number): string {
    return `:${index}`;
  }

  private ensureConnected(): void {
    if (!this.connected || !this.connection) {
      throw new Error('[DB-Adapter] Dameng not connected');
    }
  }
}
