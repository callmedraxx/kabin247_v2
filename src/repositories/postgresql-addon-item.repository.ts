import { DatabaseAdapter } from '../database/adapter';
import { AddonItem, AddonItemSearchParams, AddonItemListResponse, CreateAddonItemDTO, UpdateAddonItemDTO } from '../models/addon-item';
import { AddonItemRepository } from './addon-item.repository';

export class PostgreSQLAddonItemRepository implements AddonItemRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(addonItemData: CreateAddonItemDTO): Promise<AddonItem> {
    // Resolve category ID if provided
    let categoryId: number | null = null;
    if (addonItemData.category) {
      const isNumeric = /^\d+$/.test(addonItemData.category);
      if (isNumeric) {
        categoryId = parseInt(addonItemData.category);
      } else {
        const catQuery = 'SELECT id FROM categories WHERE slug = $1';
        const catResult = await this.db.query(catQuery, [addonItemData.category]);
        if (catResult.rows.length === 0) {
          throw new Error(`Category not found: ${addonItemData.category}`);
        }
        categoryId = catResult.rows[0].id;
      }
    }

    const query = `
      INSERT INTO addon_items (
        name, description, price, category_id, image_url, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      addonItemData.name,
      addonItemData.description || null,
      addonItemData.price,
      categoryId,
      addonItemData.image_url || null,
      addonItemData.is_active !== undefined ? addonItemData.is_active : true,
    ]);

    const addonItem = result.rows[0];
    
    // Get category slug if category_id exists
    if (addonItem.category_id) {
      const catQuery = 'SELECT slug FROM categories WHERE id = $1';
      const catResult = await this.db.query(catQuery, [addonItem.category_id]);
      addonItem.category = catResult.rows[0]?.slug || addonItem.category_id?.toString();
    }

    return addonItem;
  }

  async findById(id: number): Promise<AddonItem | null> {
    const query = 'SELECT * FROM addon_items WHERE id = $1';
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

  async findAll(params: AddonItemSearchParams): Promise<AddonItemListResponse> {
    const limit = params.limit || 50;
    const page = params.page || 1;
    const offset = (page - 1) * limit;
    
    let whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.search) {
      whereConditions.push(`(ai.name ILIKE $${paramIndex} OR ai.description ILIKE $${paramIndex})`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    if (params.category) {
      const isNumeric = /^\d+$/.test(params.category);
      if (isNumeric) {
        whereConditions.push(`ai.category_id = $${paramIndex}`);
        queryParams.push(parseInt(params.category));
      } else {
        whereConditions.push(`c.slug = $${paramIndex}`);
        queryParams.push(params.category);
      }
      paramIndex++;
    }

    if (params.is_active !== undefined) {
      whereConditions.push(`ai.is_active = $${paramIndex}`);
      queryParams.push(params.is_active);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const allowedSortFields = ['id', 'name', 'created_at', 'updated_at'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'created_at';
    const sortOrder = params.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = `ORDER BY ai.${sortBy} ${sortOrder}`;

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM addon_items ai
      ${params.category && !/^\d+$/.test(params.category) ? 'LEFT JOIN categories c ON ai.category_id = c.id' : ''}
      ${whereClause}
    `;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT ai.*, c.slug as category_slug
      FROM addon_items ai
      LEFT JOIN categories c ON ai.category_id = c.id
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
      addon_items: items,
      total,
      page,
      limit,
    };
  }

  async update(id: number, addonItemData: UpdateAddonItemDTO): Promise<AddonItem | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (addonItemData.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(addonItemData.name);
    }
    if (addonItemData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(addonItemData.description || null);
    }
    if (addonItemData.price !== undefined) {
      updates.push(`price = $${paramIndex++}`);
      values.push(addonItemData.price);
    }
    if (addonItemData.category !== undefined) {
      // Resolve category ID if provided
      let categoryId: number | null = null;
      if (addonItemData.category) {
        const isNumeric = /^\d+$/.test(addonItemData.category);
        if (isNumeric) {
          categoryId = parseInt(addonItemData.category);
        } else {
          const catQuery = 'SELECT id FROM categories WHERE slug = $1';
          const catResult = await this.db.query(catQuery, [addonItemData.category]);
          if (catResult.rows.length === 0) {
            throw new Error(`Category not found: ${addonItemData.category}`);
          }
          categoryId = catResult.rows[0].id;
        }
      }
      updates.push(`category_id = $${paramIndex++}`);
      values.push(categoryId);
    }
    if (addonItemData.image_url !== undefined) {
      updates.push(`image_url = $${paramIndex++}`);
      values.push(addonItemData.image_url || null);
    }
    if (addonItemData.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(addonItemData.is_active);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE addon_items
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
    const query = 'DELETE FROM addon_items WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  async deleteMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const query = `DELETE FROM addon_items WHERE id IN (${placeholders})`;
    const result = await this.db.query(query, ids);
    return result.rowCount || 0;
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM addon_items';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total);
  }
}
