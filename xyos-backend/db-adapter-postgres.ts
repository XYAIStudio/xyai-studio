/*
 * XYOS V4.5 — PostgreSQL 适配器
 * 需要安装: npm install pg
 * 通过环境变量 DB_DIALECT=postgres 启用
 */

import { DbAdapter, DbAdapterConfig, QueryResult } from './db-adapter';

let PgClient: any = null;

export class PostgresAdapter implements DbAdapter {
  dialect: 'postgres' = 'postgres';
  private config: DbAdapterConfig;
  private pool: any = null;
  private client: any = null;
  private connected: boolean = false;

  constructor(config: DbAdapterConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      PgClient = require('pg');
      const { Pool } = PgClient;
      this.pool = new Pool({
        host: this.config.host || 'localhost',
        port: this.config.port || 5432,
        user: this.config.username || 'postgres',
        password: this.config.password || 'postgres',
        database: this.config.database || 'xyos',
        max: 20,
        idleTimeoutMillis: 30000,
      });
      this.client = await this.pool.connect();
      this.connected = true;
      console.log('[DB-Adapter] PostgreSQL connected');
    } catch (err) {
      console.error('[DB-Adapter] PostgreSQL connection failed:', err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.release();
      this.client = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.connected = false;
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    this.ensureConnected();
    const result = await this.client.query(sql, params || []);
    return { rows: result.rows || [], rowCount: result.rowCount || 0 };
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    this.ensureConnected();
    const result = await this.client.query(sql, params || []);
    return {
      rows: [],
      rowCount: result.rowCount || 0,
      lastInsertId: result.rows?.[0]?.id,
    };
  }

  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    this.ensureConnected();
    await this.client.query('BEGIN');
    try {
      for (const stmt of statements) {
        await this.client.query(stmt.sql, stmt.params || []);
      }
      await this.client.query('COMMIT');
    } catch (err) {
      await this.client.query('ROLLBACK');
      throw err;
    }
  }

  async beginTransaction(): Promise<void> {
    this.ensureConnected();
    await this.client.query('BEGIN');
  }

  async commit(): Promise<void> {
    this.ensureConnected();
    await this.client.query('COMMIT');
  }

  async rollback(): Promise<void> {
    this.ensureConnected();
    await this.client.query('ROLLBACK');
  }

  isConnected(): boolean { return this.connected; }

  escapeIdentifier(name: string): string { return `"${name}"`; }

  getPlaceholder(index: number): string { return `$${index}`; }

  private ensureConnected(): void {
    if (!this.connected || !this.client) {
      throw new Error('[DB-Adapter] PostgreSQL not connected');
    }
  }
}
