import { DatabaseAdapter } from '../database/adapter';
import { Caterer, CatererSearchParams, CatererListResponse, CreateCatererDTO } from '../models/caterer';
import { CatererRepository } from './caterer.repository';
import { normalizeCatererData } from '../utils/caterer-validation';

export class PostgreSQLCatererRepository implements CatererRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(caterer: CreateCatererDTO): Promise<Caterer> {
    const query = `
      INSERT INTO caterers (
        caterer_name, caterer_number, caterer_email, airport_code_iata,
        airport_code_icao, time_zone, additional_emails, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;
    const result = await this.db.query(query, [
      caterer.caterer_name,
      caterer.caterer_number,
      caterer.caterer_email || null,
      caterer.airport_code_iata || null,
      caterer.airport_code_icao || null,
      caterer.time_zone || null,
      JSON.stringify(caterer.additional_emails || []),
    ]);
    return result.rows[0];
  }

  async findById(id: number): Promise<Caterer | null> {
    const query = 'SELECT * FROM caterers WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findAll(params: CatererSearchParams): Promise<CatererListResponse> {
    const limit = params.limit || 50;
    const offset = params.offset ?? (params.page && params.limit ? (params.page - 1) * params.limit : 0);
    
    let whereClause = '';
    const queryParams: any[] = [];

    // Build WHERE clause for search
    if (params.search) {
      whereClause = `WHERE (
        caterer_name ILIKE $1 OR
        caterer_number ILIKE $1 OR
        caterer_email ILIKE $1 OR
        airport_code_iata ILIKE $1 OR
        airport_code_icao ILIKE $1 OR
        time_zone ILIKE $1
      )`;
      queryParams.push(`%${params.search}%`);
    }

    // Build ORDER BY clause with SQL injection protection
    const allowedSortFields = ['id', 'caterer_name', 'caterer_number', 'caterer_email', 'airport_code_iata', 'airport_code_icao', 'time_zone', 'created_at', 'updated_at'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'id';
    const sortOrder = params.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}`;

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM caterers ${whereClause}`;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Data query
    const limitParam = queryParams.length + 1;
    const offsetParam = queryParams.length + 2;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT * FROM caterers
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    return {
      caterers: result.rows,
      total,
      page: params.page || Math.floor(offset / limit) + 1,
      limit,
      offset,
    };
  }

  async update(id: number, caterer: Partial<CreateCatererDTO>): Promise<Caterer | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (caterer.caterer_name !== undefined) {
      updates.push(`caterer_name = $${paramIndex++}`);
      values.push(caterer.caterer_name);
    }
    if (caterer.caterer_number !== undefined) {
      updates.push(`caterer_number = $${paramIndex++}`);
      values.push(caterer.caterer_number);
    }
    if (caterer.caterer_email !== undefined) {
      updates.push(`caterer_email = $${paramIndex++}`);
      values.push(caterer.caterer_email || null);
    }
    if (caterer.airport_code_iata !== undefined) {
      updates.push(`airport_code_iata = $${paramIndex++}`);
      values.push(caterer.airport_code_iata || null);
    }
    if (caterer.airport_code_icao !== undefined) {
      updates.push(`airport_code_icao = $${paramIndex++}`);
      values.push(caterer.airport_code_icao || null);
    }
    if (caterer.time_zone !== undefined) {
      updates.push(`time_zone = $${paramIndex++}`);
      values.push(caterer.time_zone || null);
    }
    if (caterer.additional_emails !== undefined) {
      updates.push(`additional_emails = $${paramIndex++}`);
      values.push(JSON.stringify(caterer.additional_emails || []));
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE caterers
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    const result = await this.db.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM caterers WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  async deleteMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const query = `DELETE FROM caterers WHERE id IN (${placeholders})`;
    const result = await this.db.query(query, ids);
    return result.rowCount || 0;
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM caterers';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total);
  }

  async findDuplicate(caterer: CreateCatererDTO): Promise<Caterer | null> {
    const normalized = normalizeCatererData(caterer);
    
    const query = `
      SELECT * FROM caterers
      WHERE caterer_name = $1
        AND caterer_number = $2
        AND COALESCE(caterer_email, '') = COALESCE($3, '')
        AND COALESCE(airport_code_iata, '') = COALESCE($4, '')
        AND COALESCE(airport_code_icao, '') = COALESCE($5, '')
        AND COALESCE(time_zone, '') = COALESCE($6, '')
      LIMIT 1
    `;
    const result = await this.db.query(query, [
      normalized.caterer_name,
      normalized.caterer_number,
      normalized.caterer_email || null,
      normalized.airport_code_iata || null,
      normalized.airport_code_icao || null,
      normalized.time_zone || null,
    ]);
    return result.rows[0] || null;
  }
}

