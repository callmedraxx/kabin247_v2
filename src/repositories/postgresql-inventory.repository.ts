import { DatabaseAdapter } from '../database/adapter';
import { InventoryItem, InventorySearchParams, InventoryListResponse, CreateInventoryItemDTO, UpdateInventoryItemDTO } from '../models/inventory';
import { InventoryRepository } from './inventory.repository';

export class PostgreSQLInventoryRepository implements InventoryRepository {
  constructor(private db: DatabaseAdapter) {}

  private calculateStatus(item: any): 'in_stock' | 'low_stock' | 'out_of_stock' {
    if (item.current_stock === 0) {
      return 'out_of_stock';
    }
    if (item.current_stock <= item.min_stock_level) {
      return 'low_stock';
    }
    return 'in_stock';
  }

  async create(inventoryItemData: CreateInventoryItemDTO): Promise<InventoryItem> {
    const query = `
      INSERT INTO inventory_items (
        item_name, category, current_stock, min_stock_level, max_stock_level,
        unit, unit_price, supplier, location, notes, last_updated, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), NOW())
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      inventoryItemData.item_name,
      inventoryItemData.category,
      inventoryItemData.current_stock,
      inventoryItemData.min_stock_level,
      inventoryItemData.max_stock_level,
      inventoryItemData.unit,
      inventoryItemData.unit_price || null,
      inventoryItemData.supplier || null,
      inventoryItemData.location || null,
      inventoryItemData.notes || null,
    ]);

    const item = result.rows[0];
    item.status = this.calculateStatus(item);
    return item;
  }

  async findById(id: number): Promise<InventoryItem | null> {
    const query = 'SELECT * FROM inventory_items WHERE id = $1';
    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const item = result.rows[0];
    item.status = this.calculateStatus(item);
    return item;
  }

  async findAll(params: InventorySearchParams): Promise<InventoryListResponse> {
    const limit = params.limit || 50;
    const page = params.page || 1;
    const offset = (page - 1) * limit;
    
    let whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.search) {
      whereConditions.push(`(
        item_name ILIKE $${paramIndex} OR 
        supplier ILIKE $${paramIndex} OR 
        location ILIKE $${paramIndex} OR
        category ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    if (params.category) {
      whereConditions.push(`category = $${paramIndex}`);
      queryParams.push(params.category);
      paramIndex++;
    }

    if (params.status && params.status !== 'all') {
      // Status is calculated, so we need to filter in application logic
      // For now, we'll filter after fetching
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const allowedSortFields = ['item_name', 'current_stock', 'last_updated', 'created_at'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'last_updated';
    const sortOrder = params.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}`;

    const countQuery = `SELECT COUNT(*) as total FROM inventory_items ${whereClause}`;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT * FROM inventory_items
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    // Calculate status and filter by status if needed
    let items = result.rows.map((item: any) => ({
      ...item,
      status: this.calculateStatus(item),
    }));

    if (params.status && params.status !== 'all') {
      items = items.filter((item: any) => item.status === params.status);
    }

    return {
      inventory_items: items,
      total,
      page,
      limit,
    };
  }

  async update(id: number, inventoryItemData: UpdateInventoryItemDTO): Promise<InventoryItem | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (inventoryItemData.item_name !== undefined) {
      updates.push(`item_name = $${paramIndex++}`);
      values.push(inventoryItemData.item_name);
    }
    if (inventoryItemData.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(inventoryItemData.category);
    }
    if (inventoryItemData.current_stock !== undefined) {
      updates.push(`current_stock = $${paramIndex++}`);
      values.push(inventoryItemData.current_stock);
      updates.push(`last_updated = NOW()`);
    }
    if (inventoryItemData.min_stock_level !== undefined) {
      updates.push(`min_stock_level = $${paramIndex++}`);
      values.push(inventoryItemData.min_stock_level);
    }
    if (inventoryItemData.max_stock_level !== undefined) {
      updates.push(`max_stock_level = $${paramIndex++}`);
      values.push(inventoryItemData.max_stock_level);
    }
    if (inventoryItemData.unit !== undefined) {
      updates.push(`unit = $${paramIndex++}`);
      values.push(inventoryItemData.unit);
    }
    if (inventoryItemData.unit_price !== undefined) {
      updates.push(`unit_price = $${paramIndex++}`);
      values.push(inventoryItemData.unit_price || null);
    }
    if (inventoryItemData.supplier !== undefined) {
      updates.push(`supplier = $${paramIndex++}`);
      values.push(inventoryItemData.supplier || null);
    }
    if (inventoryItemData.location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(inventoryItemData.location || null);
    }
    if (inventoryItemData.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(inventoryItemData.notes || null);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE inventory_items
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

  async updateStock(id: number, stock: number, notes?: string): Promise<InventoryItem | null> {
    const updates: string[] = [`current_stock = $1`, `last_updated = NOW()`, `updated_at = NOW()`];
    const values: any[] = [stock];
    let paramIndex = 2;

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }

    values.push(id);

    const query = `
      UPDATE inventory_items
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
    const query = 'DELETE FROM inventory_items WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  async deleteMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const query = `DELETE FROM inventory_items WHERE id IN (${placeholders})`;
    const result = await this.db.query(query, ids);
    return result.rowCount || 0;
  }

  async findLowStock(status?: 'low_stock' | 'out_of_stock'): Promise<InventoryItem[]> {
    const query = 'SELECT * FROM inventory_items';
    const result = await this.db.query(query);
    
    const items = result.rows.map((item: any) => ({
      ...item,
      status: this.calculateStatus(item),
    }));

    if (status) {
      return items.filter((item: any) => item.status === status);
    }

    return items.filter((item: any) => item.status === 'low_stock' || item.status === 'out_of_stock');
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM inventory_items';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total);
  }
}
