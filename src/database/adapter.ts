/**
 * Database adapter interface
 * Allows switching between PostgreSQL and in-memory storage
 */
export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string, params?: any[]): Promise<any>;
  execute(sql: string, params?: any[]): Promise<any>;
  isConnected(): boolean;
}

