import { DatabaseAdapter } from './adapter';

/**
 * In-memory database adapter for development
 * Uses a simple Map-based storage
 */
export class InMemoryAdapter implements DatabaseAdapter {
  private storage: Map<string, any[]>;
  private connected: boolean = false;

  constructor() {
    this.storage = new Map();
  }

  async connect(): Promise<void> {
    this.connected = true;
    console.log('In-memory database initialized');
  }

  async disconnect(): Promise<void> {
    this.storage.clear();
    this.connected = false;
    console.log('In-memory database cleared');
  }

  async query(sql: string, params?: any[]): Promise<any> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // Simple SQL-like query parser for in-memory storage
    // This is a basic implementation - you can extend it as needed
    const sqlLower = sql.toLowerCase().trim();
    
    if (sqlLower.startsWith('select')) {
      return this.handleSelect(sql, params);
    } else if (sqlLower.startsWith('insert')) {
      return this.handleInsert(sql, params);
    } else if (sqlLower.startsWith('update')) {
      return this.handleUpdate(sql, params);
    } else if (sqlLower.startsWith('delete')) {
      return this.handleDelete(sql, params);
    } else if (sqlLower.startsWith('create table')) {
      return this.handleCreateTable(sql);
    }

    return { rows: [], rowCount: 0 };
  }

  async execute(sql: string, params?: any[]): Promise<any> {
    return this.query(sql, params);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleSelect(sql: string, params?: any[]): any {
    // Extract table name (simplified)
    const tableMatch = sql.match(/from\s+(\w+)/i);
    if (!tableMatch) {
      return { rows: [], rowCount: 0 };
    }

    const tableName = tableMatch[1];
    const rows = this.storage.get(tableName) || [];
    
    // Simple WHERE clause handling (basic implementation)
    if (sql.includes('where') && params) {
      // This is a simplified implementation
      // For production use, consider using a proper in-memory SQL library
      return { rows, rowCount: rows.length };
    }

    return { rows, rowCount: rows.length };
  }

  private handleInsert(sql: string, params?: any[]): any {
    const tableMatch = sql.match(/into\s+(\w+)/i);
    if (!tableMatch || !params) {
      return { rows: [], rowCount: 0 };
    }

    const tableName = tableMatch[1];
    if (!this.storage.has(tableName)) {
      this.storage.set(tableName, []);
    }

    const table = this.storage.get(tableName)!;
    const newRow = { id: table.length + 1, ...params };
    table.push(newRow);

    return { rows: [newRow], rowCount: 1 };
  }

  private handleUpdate(sql: string, params?: any[]): any {
    // Simplified update implementation
    return { rows: [], rowCount: 0 };
  }

  private handleDelete(sql: string, params?: any[]): any {
    // Simplified delete implementation
    return { rows: [], rowCount: 0 };
  }

  private handleCreateTable(sql: string): any {
    // Table creation is handled implicitly when data is inserted
    return { rows: [], rowCount: 0 };
  }
}

