import { DatabaseAdapter } from '../database/adapter';
import { FBO, FBOSearchParams, FBOListResponse, CreateFBODTO } from '../models/fbo';
import { FBORepository } from './fbo.repository';

export class PostgreSQLFBORepository implements FBORepository {
  constructor(private db: DatabaseAdapter) {}

  async create(fbo: CreateFBODTO): Promise<FBO> {
    const query = `
      INSERT INTO fbos (
        fbo_name, fbo_email, fbo_phone,
        created_at, updated_at
      ) VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *
    `;
    const result = await this.db.query(query, [
      fbo.fbo_name,
      fbo.fbo_email || null,
      fbo.fbo_phone || null,
    ]);
    return result.rows[0];
  }

  async findById(id: number): Promise<FBO | null> {
    const query = 'SELECT * FROM fbos WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findAll(params: FBOSearchParams): Promise<FBOListResponse> {
    const limit = params.limit || 50;
    const offset = params.page && params.limit ? (params.page - 1) * params.limit : 0;
    
    let whereClause = '';
    const queryParams: any[] = [];

    // Build WHERE clause for search
    if (params.search) {
      whereClause = `WHERE (
        fbo_name ILIKE $1 OR
        fbo_email ILIKE $1 OR
        fbo_phone ILIKE $1
      )`;
      queryParams.push(`%${params.search}%`);
    }

    // Build ORDER BY clause with SQL injection protection
    const allowedSortFields = ['id', 'fbo_name', 'fbo_email', 'fbo_phone', 'created_at', 'updated_at'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'fbo_name';
    const sortOrder = params.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}`;

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM fbos ${whereClause}`;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Data query
    const limitParam = queryParams.length + 1;
    const offsetParam = queryParams.length + 2;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT * FROM fbos
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    return {
      fbos: result.rows,
      total,
      page: params.page || Math.floor(offset / limit) + 1,
      limit,
    };
  }

  async update(id: number, fbo: Partial<CreateFBODTO>): Promise<FBO | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (fbo.fbo_name !== undefined) {
      updates.push(`fbo_name = $${paramIndex++}`);
      values.push(fbo.fbo_name);
    }
    if (fbo.fbo_email !== undefined) {
      updates.push(`fbo_email = $${paramIndex++}`);
      values.push(fbo.fbo_email || null);
    }
    if (fbo.fbo_phone !== undefined) {
      updates.push(`fbo_phone = $${paramIndex++}`);
      values.push(fbo.fbo_phone || null);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE fbos
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    const result = await this.db.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM fbos WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM fbos';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total);
  }
}
