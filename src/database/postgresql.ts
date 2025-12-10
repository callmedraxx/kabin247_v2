import { Pool, PoolClient } from 'pg';
import { DatabaseAdapter } from './adapter';

interface PostgreSQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export class PostgreSQLAdapter implements DatabaseAdapter {
  private pool: Pool | null = null;
  private config: PostgreSQLConfig;

  constructor(config: PostgreSQLConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      console.log('PostgreSQL connected successfully');
    } catch (error) {
      console.error('PostgreSQL connection error:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('PostgreSQL disconnected');
    }
  }

  async query(sql: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return this.pool.query(sql, params);
  }

  async execute(sql: string, params?: any[]): Promise<any> {
    return this.query(sql, params);
  }

  isConnected(): boolean {
    return this.pool !== null;
  }
}

