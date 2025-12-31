import { DatabaseAdapter } from '../database/adapter';
import { Client, ClientSearchParams, ClientListResponse, CreateClientDTO } from '../models/client';
import { ClientRepository } from './client.repository';
import { normalizeClientData } from '../utils/client-validation';

export class PostgreSQLClientRepository implements ClientRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(client: CreateClientDTO): Promise<Client> {
    const query = `
      INSERT INTO clients (
        full_name, company_name, full_address, email, contact_number, additional_emails,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `;
    const result = await this.db.query(query, [
      client.full_name,
      client.company_name || null,
      client.full_address,
      client.email || null,
      client.contact_number || null,
      JSON.stringify(client.additional_emails || []),
    ]);
    return result.rows[0];
  }

  async findById(id: number): Promise<Client | null> {
    const query = 'SELECT * FROM clients WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findAll(params: ClientSearchParams): Promise<ClientListResponse> {
    // Ensure limit and offset are valid integers - prevent NaN
    const rawLimit = params.limit;
    const parsedLimit = typeof rawLimit === 'number' && !isNaN(rawLimit) && isFinite(rawLimit) ? rawLimit : 50;
    let limit = Math.max(1, Math.floor(parsedLimit));
    // Final safety check - if limit is still NaN, use default
    if (isNaN(limit) || !isFinite(limit)) {
      limit = 50;
    }
    
    // Calculate offset safely
    let rawOffset: number;
    if (params.offset !== undefined) {
      const parsedOffset = typeof params.offset === 'number' && !isNaN(params.offset) && isFinite(params.offset) ? params.offset : 0;
      rawOffset = parsedOffset;
    } else if (params.page && params.limit) {
      const rawPage = typeof params.page === 'number' && !isNaN(params.page) && isFinite(params.page) ? params.page : 1;
      rawOffset = (rawPage - 1) * parsedLimit;
    } else {
      rawOffset = 0;
    }
    let offset = Math.max(0, Math.floor(rawOffset));
    // Final safety check - if offset is still NaN, use default
    if (isNaN(offset) || !isFinite(offset)) {
      offset = 0;
    }
    
    let whereClause = '';
    const queryParams: any[] = [];

    // Build WHERE clause for search
    if (params.search) {
      whereClause = `WHERE (
        full_name ILIKE $1 OR
        company_name ILIKE $1 OR
        full_address ILIKE $1 OR
        email ILIKE $1 OR
        contact_number ILIKE $1
      )`;
      queryParams.push(`%${params.search}%`);
    }

    // Build ORDER BY clause with SQL injection protection
    const allowedSortFields = ['id', 'full_name', 'company_name', 'full_address', 'email', 'contact_number', 'created_at', 'updated_at'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'id';
    const sortOrder = params.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}`;

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM clients ${whereClause}`;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(String(countResult.rows[0]?.total || '0'), 10) || 0;

    // Data query - ensure limit and offset are valid integers (final check before SQL)
    const limitParam = queryParams.length + 1;
    const offsetParam = queryParams.length + 2;
    // Convert to integers and ensure they're not NaN
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
    const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
    const dataParams = [...queryParams, safeLimit, safeOffset];
    const dataQuery = `
      SELECT * FROM clients
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    // Calculate page safely
    const calculatedPage = safeLimit > 0 ? Math.floor(safeOffset / safeLimit) + 1 : 1;
    const page = (params.page && typeof params.page === 'number' && !isNaN(params.page) && isFinite(params.page)) 
      ? params.page 
      : calculatedPage;

    return {
      clients: result.rows,
      total,
      page: Number.isInteger(page) && page > 0 ? page : 1,
      limit: safeLimit,
      offset: safeOffset,
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
    if (client.company_name !== undefined) {
      updates.push(`company_name = $${paramIndex++}`);
      values.push(client.company_name || null);
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
    if (client.additional_emails !== undefined) {
      updates.push(`additional_emails = $${paramIndex++}`);
      values.push(JSON.stringify(client.additional_emails || []));
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
