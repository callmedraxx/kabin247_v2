import { DatabaseAdapter } from '../database/adapter';
import { Airport, AirportSearchParams, AirportListResponse, CreateAirportDTO } from '../models/airport';
import { AirportRepository } from './airport.repository';

export class PostgreSQLAirportRepository implements AirportRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(airport: CreateAirportDTO): Promise<Airport> {
    const query = `
      INSERT INTO airports (
        airport_name, airport_code_iata, airport_code_icao,
        created_at, updated_at
      ) VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *
    `;
    const result = await this.db.query(query, [
      airport.airport_name,
      airport.airport_code_iata || null,
      airport.airport_code_icao || null,
    ]);
    return result.rows[0];
  }

  async findById(id: number): Promise<Airport | null> {
    const query = 'SELECT * FROM airports WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findAll(params: AirportSearchParams): Promise<AirportListResponse> {
    const limit = params.limit || 50;
    const offset = params.offset ?? (params.page && params.limit ? (params.page - 1) * params.limit : 0);
    
    let whereClause = '';
    const queryParams: any[] = [];

    // Build WHERE clause for search
    if (params.search) {
      whereClause = `WHERE (
        airport_name ILIKE $1 OR
        airport_code_iata ILIKE $1 OR
        airport_code_icao ILIKE $1
      )`;
      queryParams.push(`%${params.search}%`);
    }

    // Build ORDER BY clause with SQL injection protection
    const allowedSortFields = ['id', 'airport_name', 'airport_code_iata', 'airport_code_icao', 'created_at', 'updated_at'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'airport_name';
    const sortOrder = params.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}`;

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM airports ${whereClause}`;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Data query
    const limitParam = queryParams.length + 1;
    const offsetParam = queryParams.length + 2;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT * FROM airports
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    return {
      airports: result.rows,
      total,
      page: params.page || Math.floor(offset / limit) + 1,
      limit,
      offset,
    };
  }

  async update(id: number, airport: Partial<CreateAirportDTO>): Promise<Airport | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (airport.airport_name !== undefined) {
      updates.push(`airport_name = $${paramIndex++}`);
      values.push(airport.airport_name);
    }
    if (airport.airport_code_iata !== undefined) {
      updates.push(`airport_code_iata = $${paramIndex++}`);
      values.push(airport.airport_code_iata || null);
    }
    if (airport.airport_code_icao !== undefined) {
      updates.push(`airport_code_icao = $${paramIndex++}`);
      values.push(airport.airport_code_icao || null);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE airports
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    const result = await this.db.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM airports WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async deleteMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const query = `DELETE FROM airports WHERE id IN (${placeholders})`;
    const result = await this.db.query(query, ids);
    return result.rowCount || 0;
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM airports';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total);
  }
}
