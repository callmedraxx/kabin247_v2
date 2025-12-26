import { DatabaseAdapter } from '../database/adapter';
import { User, CreateUserDTO, UpdateUserDTO } from '../models/user';
import { UserRepository } from './user.repository';
import argon2 from 'argon2';

/**
 * Helper function to safely parse JSON from database
 * PostgreSQL JSONB columns return objects directly, not strings
 */
function safeParsePermissions(value: any): any {
  if (value === null || value === undefined) {
    return null;
  }
  // If already an object (from JSONB), return as-is
  if (typeof value === 'object') {
    return value;
  }
  // If it's a string, parse it
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      // If parsing fails, return null or throw based on requirement
      throw new Error(`Failed to parse permissions JSON: ${error}`);
    }
  }
  return value;
}

export class PostgreSQLUserRepository implements UserRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(user: CreateUserDTO): Promise<User> {
    const passwordHash = await argon2.hash(user.password);
    
    const query = `
      INSERT INTO users (
        email, password_hash, role, is_active, permissions,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `;
    const result = await this.db.query(query, [
      user.email,
      passwordHash,
      user.role,
      true,
      user.permissions ? JSON.stringify(user.permissions) : null,
    ]);
    
    const row = result.rows[0];
    return {
      ...row,
      permissions: safeParsePermissions(row.permissions),
    };
  }

  async findById(id: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.db.query(query, [id]);
    if (!result.rows[0]) return null;
    
    const row = result.rows[0];
    return {
      ...row,
      permissions: safeParsePermissions(row.permissions),
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await this.db.query(query, [email]);
    if (!result.rows[0]) return null;
    
    const row = result.rows[0];
    return {
      ...row,
      permissions: safeParsePermissions(row.permissions),
    };
  }

  async findAll(): Promise<User[]> {
    const query = 'SELECT * FROM users ORDER BY created_at DESC';
    const result = await this.db.query(query);
    return result.rows.map((row: any) => ({
      ...row,
      permissions: safeParsePermissions(row.permissions),
    }));
  }

  async update(id: number, user: UpdateUserDTO): Promise<User | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (user.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(user.email);
    }
    if (user.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(user.is_active);
    }
    if (user.permissions !== undefined) {
      updates.push(`permissions = $${paramIndex++}`);
      values.push(user.permissions ? JSON.stringify(user.permissions) : null);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    const result = await this.db.query(query, values);
    if (!result.rows[0]) return null;
    
    const row = result.rows[0];
    return {
      ...row,
      permissions: safeParsePermissions(row.permissions),
    };
  }

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    const query = 'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2';
    await this.db.query(query, [passwordHash, id]);
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM users';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total, 10);
  }

  async adminExists(): Promise<boolean> {
    const query = "SELECT COUNT(*) as total FROM users WHERE role = 'ADMIN'";
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total, 10) > 0;
  }

  async countAdmins(): Promise<number> {
    const query = "SELECT COUNT(*) as total FROM users WHERE role = 'ADMIN'";
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total, 10);
  }
}

