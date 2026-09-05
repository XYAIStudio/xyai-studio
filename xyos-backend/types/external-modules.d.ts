declare module "pdfkit" {
  const PDFDocument: any;
  export default PDFDocument;
}

declare module "pg" {
  export interface QueryResult<T = Record<string, unknown>> { rows: T[]; rowCount: number | null }
  export interface PoolClient { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>; release(): void }
  export class Pool { constructor(options?: Record<string, unknown>); connect(): Promise<PoolClient>; end(): Promise<void> }
}
