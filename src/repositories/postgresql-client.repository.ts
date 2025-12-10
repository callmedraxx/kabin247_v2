import { DatabaseAdapter } from '../database/adapter';
import { Client, ClientSearchParams, ClientListResponse, CreateClientDTO } from '../models/client';
import { ClientRepository } from './client.repository';
import { normalizeClientData } from '../utils/client-validation';

export class PostgreSQLClientRepository implements ClientRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(client: CreateClientDTO): Promise<Client> {
    const query = `
      INSERT INTO clients (
        full_name, full_address, email, contact_number,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `;
    const result = await this.db.query(query, [
      client.full_name,
      client.full_address,
      client.email || null,
      client.contact_number || null,
    ]);
    return result.rows[0];
  }

  async findById(id: number): Promise<Client | null> {
    const query = 'SELECT * FROM clients WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findAll(params: ClientSearchParams): Promise<ClientListResponse> {
    const limit = params.limit || 50;
    const offset = params.offset ?? (params.page && params.limit ? (params.page - 1) * params.limit : 0);
    
    let whereClause = '';
    const queryParams: any[] = [];

    // Build WHERE clause for search
    if (params.search) {
      whereClause = `WHERE (
        full_name ILIKE $1 OR
        full_address ILIKE $1 OR
        email ILIKE $1 OR
        contact_number ILIKE $1 OR
        airport_code ILIKE $1 OR
        fbo_name ILIKE $1
      )`;
      queryParams.push(`%${params.search}%`);
    }

    // Build ORDER BY clause with SQL injection protection
    const allowedSortFields = ['id', 'full_name', 'full_address', 'email', 'contact_number', 'airport_code', 'fbo_name', 'created_at', 'updated_at'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'id';
    const sortOrder = params.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}`;

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM clients ${whereClause}`;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Data query
    const limitParam = queryParams.length + 1;
    const offsetParam = queryParams.length + 2;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT * FROM clients
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    return {
      clients: result.rows,
      total,
      page: params.page || Math.floor(offset / limit) + 1,
      limit,
      offset,
    };
  }

  async update(id: number, client: Partial<CreateClientDTO>): Promise<Client | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (client.full_name !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      values.push(client.full_name);
    }
    if (client.full_address !== undefined) {
      updates.push(`full_address = $${paramIndex++}`);
      values.push(client.full_address);
    }
    if (client.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(client.email || null);
    }
    if (client.contact_number !== undefined) {
      updates.push(`contact_number = $${paramIndex++}`);
      values.push(client.contact_number || null);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE clients
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    const result = await this.db.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM clients WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  async deleteMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const query = `DELETE FROM clients WHERE id IN (${placeholders})`;
    const result = await this.db.query(query, ids);
    return result.rowCount || 0;
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM clients';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total);
  }

  async findDuplicate(client: CreateClientDTO): Promise<Client | null> {
    const normalized = normalizeClientData(client);
    
    const query = `
      SELECT * FROM clients
      WHERE full_name = $1
        AND full_address = $2
        AND COALESCE(email, '') = COALESCE($3, '')
        AND COALESCE(contact_number, '') = COALESCE($4, '')
      LIMIT 1
    `;
    const result = await this.db.query(query, [
      normalized.full_name,
      normalized.full_address,
      normalized.email || null,
      normalized.contact_number || null,
    ]);
    return result.rows[0] || null;
  }
}
