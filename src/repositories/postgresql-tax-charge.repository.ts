import { DatabaseAdapter } from '../database/adapter';
import { TaxCharge, TaxChargeSearchParams, TaxChargeListResponse, CreateTaxChargeDTO, UpdateTaxChargeDTO } from '../models/tax-charge';
import { TaxChargeRepository } from './tax-charge.repository';

export class PostgreSQLTaxChargeRepository implements TaxChargeRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(taxChargeData: CreateTaxChargeDTO): Promise<TaxCharge> {
    // Resolve category ID if provided
    let categoryId: number | null = null;
    if (taxChargeData.category) {
      const isNumeric = /^\d+$/.test(taxChargeData.category);
      if (isNumeric) {
        categoryId = parseInt(taxChargeData.category);
      } else {
        const catQuery = 'SELECT id FROM categories WHERE slug = $1';
        const catResult = await this.db.query(catQuery, [taxChargeData.category]);
        if (catResult.rows.length === 0) {
          throw new Error(`Category not found: ${taxChargeData.category}`);
        }
        categoryId = catResult.rows[0].id;
      }
    }

    const query = `
      INSERT INTO tax_charges (
        name, type, rate, is_percentage, applies_to, category_id, location,
        min_amount, max_amount, description, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      taxChargeData.name,
      taxChargeData.type,
      taxChargeData.rate,
      taxChargeData.is_percentage,
      taxChargeData.applies_to,
      categoryId,
      taxChargeData.location || null,
      taxChargeData.min_amount || null,
      taxChargeData.max_amount || null,
      taxChargeData.description || null,
      taxChargeData.is_active !== undefined ? taxChargeData.is_active : true,
    ]);

    const taxCharge = result.rows[0];
    
    // Get category slug if category_id exists
    if (taxCharge.category_id) {
      const catQuery = 'SELECT slug FROM categories WHERE id = $1';
      const catResult = await this.db.query(catQuery, [taxCharge.category_id]);
      taxCharge.category = catResult.rows[0]?.slug || taxCharge.category_id?.toString();
    }

    return taxCharge;
  }

  async findById(id: number): Promise<TaxCharge | null> {
    const query = 'SELECT * FROM tax_charges WHERE id = $1';
    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const item = result.rows[0];
    
    // Get category slug if category_id exists
    if (item.category_id) {
      const catQuery = 'SELECT slug FROM categories WHERE id = $1';
      const catResult = await this.db.query(catQuery, [item.category_id]);
      item.category = catResult.rows[0]?.slug || item.category_id?.toString();
    }

    return item;
  }

  async findAll(params: TaxChargeSearchParams): Promise<TaxChargeListResponse> {
    const limit = params.limit || 50;
    const page = params.page || 1;
    const offset = (page - 1) * limit;
    
    let whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.search) {
      whereConditions.push(`(tc.name ILIKE $${paramIndex} OR tc.description ILIKE $${paramIndex})`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    if (params.type && params.type !== 'all') {
      whereConditions.push(`tc.type = $${paramIndex}`);
      queryParams.push(params.type);
      paramIndex++;
    }

    if (params.applies_to) {
      whereConditions.push(`tc.applies_to = $${paramIndex}`);
      queryParams.push(params.applies_to);
      paramIndex++;
    }

    if (params.is_active !== undefined) {
      whereConditions.push(`tc.is_active = $${paramIndex}`);
      queryParams.push(params.is_active);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const allowedSortFields = ['id', 'name', 'type', 'created_at'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'created_at';
    const sortOrder = params.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = `ORDER BY tc.${sortBy} ${sortOrder}`;

    const countQuery = `SELECT COUNT(*) as total FROM tax_charges tc ${whereClause}`;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT tc.*, c.slug as category_slug
      FROM tax_charges tc
      LEFT JOIN categories c ON tc.category_id = c.id
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    const items = result.rows.map((item: any) => ({
      ...item,
      category: item.category_slug || item.category_id?.toString() || null,
    }));

    return {
      tax_charges: items,
      total,
      page,
      limit,
    };
  }

  async update(id: number, taxChargeData: UpdateTaxChargeDTO): Promise<TaxCharge | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (taxChargeData.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(taxChargeData.name);
    }
    if (taxChargeData.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(taxChargeData.type);
    }
    if (taxChargeData.rate !== undefined) {
      updates.push(`rate = $${paramIndex++}`);
      values.push(taxChargeData.rate);
    }
    if (taxChargeData.is_percentage !== undefined) {
      updates.push(`is_percentage = $${paramIndex++}`);
      values.push(taxChargeData.is_percentage);
    }
    if (taxChargeData.applies_to !== undefined) {
      updates.push(`applies_to = $${paramIndex++}`);
      values.push(taxChargeData.applies_to);
    }
    if (taxChargeData.category !== undefined) {
      // Resolve category ID if provided
      let categoryId: number | null = null;
      if (taxChargeData.category) {
        const isNumeric = /^\d+$/.test(taxChargeData.category);
        if (isNumeric) {
          categoryId = parseInt(taxChargeData.category);
        } else {
          const catQuery = 'SELECT id FROM categories WHERE slug = $1';
          const catResult = await this.db.query(catQuery, [taxChargeData.category]);
          if (catResult.rows.length === 0) {
            throw new Error(`Category not found: ${taxChargeData.category}`);
          }
          categoryId = catResult.rows[0].id;
        }
      }
      updates.push(`category_id = $${paramIndex++}`);
      values.push(categoryId);
    }
    if (taxChargeData.location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(taxChargeData.location || null);
    }
    if (taxChargeData.min_amount !== undefined) {
      updates.push(`min_amount = $${paramIndex++}`);
      values.push(taxChargeData.min_amount || null);
    }
    if (taxChargeData.max_amount !== undefined) {
      updates.push(`max_amount = $${paramIndex++}`);
      values.push(taxChargeData.max_amount || null);
    }
    if (taxChargeData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(taxChargeData.description || null);
    }
    if (taxChargeData.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(taxChargeData.is_active);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE tax_charges
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    const result = await this.db.query(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM tax_charges WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  async deleteMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const query = `DELETE FROM tax_charges WHERE id IN (${placeholders})`;
    const result = await this.db.query(query, ids);
    return result.rowCount || 0;
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM tax_charges';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total);
  }
}
