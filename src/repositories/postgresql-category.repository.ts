import { DatabaseAdapter } from '../database/adapter';
import { Category, CategorySearchParams, CategoryListResponse, CreateCategoryDTO, UpdateCategoryDTO } from '../models/category';
import { CategoryRepository } from './category.repository';

export class PostgreSQLCategoryRepository implements CategoryRepository {
  constructor(private db: DatabaseAdapter) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async create(categoryData: CreateCategoryDTO): Promise<Category> {
    const slug = categoryData.slug || this.generateSlug(categoryData.name);
    
    // Check if slug exists
    const existing = await this.findBySlug(slug);
    if (existing) {
      throw new Error(`Category with slug "${slug}" already exists`);
    }

    const query = `
      INSERT INTO categories (
        name, slug, description, image_url, icon, display_order, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      categoryData.name,
      slug,
      categoryData.description || null,
      categoryData.image_url || null,
      categoryData.icon || null,
      categoryData.display_order,
      categoryData.is_active !== undefined ? categoryData.is_active : true,
    ]);

    const category = result.rows[0];
    category.item_count = 0; // Will be calculated
    return category;
  }

  async findById(id: number): Promise<Category | null> {
    const query = 'SELECT * FROM categories WHERE id = $1';
    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const category = result.rows[0];
    // Calculate item_count
    const countQuery = 'SELECT COUNT(*) as count FROM menu_items WHERE category_id = $1';
    const countResult = await this.db.query(countQuery, [id]);
    category.item_count = parseInt(countResult.rows[0].count || '0');
    
    return category;
  }

  async findBySlug(slug: string): Promise<Category | null> {
    const query = 'SELECT * FROM categories WHERE slug = $1';
    const result = await this.db.query(query, [slug]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const category = result.rows[0];
    // Calculate item_count
    const countQuery = 'SELECT COUNT(*) as count FROM menu_items WHERE category_id = $1';
    const countResult = await this.db.query(countQuery, [category.id]);
    category.item_count = parseInt(countResult.rows[0].count || '0');
    
    return category;
  }

  async findAll(params: CategorySearchParams): Promise<CategoryListResponse> {
    const limit = params.limit || 100;
    const page = params.page || 1;
    const offset = (page - 1) * limit;
    
    let whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.search) {
      whereConditions.push(`(name ILIKE $${paramIndex} OR slug ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    if (params.is_active !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`);
      queryParams.push(params.is_active);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const allowedSortFields = ['display_order', 'name', 'created_at'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'display_order';
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'ASC'; // Default asc for display_order
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}`;

    const countQuery = `SELECT COUNT(*) as total FROM categories ${whereClause}`;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT c.*, 
        (SELECT COUNT(*) FROM menu_items WHERE category_id = c.id) as item_count
      FROM categories c
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    return {
      categories: result.rows,
      total,
      page,
      limit,
    };
  }

  async update(id: number, categoryData: UpdateCategoryDTO): Promise<Category | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (categoryData.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(categoryData.name);
    }
    if (categoryData.slug !== undefined) {
      // Check if slug exists (excluding current category)
      const existing = await this.findBySlug(categoryData.slug);
      if (existing && existing.id !== id) {
        throw new Error(`Category with slug "${categoryData.slug}" already exists`);
      }
      updates.push(`slug = $${paramIndex++}`);
      values.push(categoryData.slug);
    } else if (categoryData.name !== undefined) {
      // Auto-generate slug if name changed
      const existing = await this.findById(id);
      if (existing && categoryData.name !== existing.name) {
        const newSlug = this.generateSlug(categoryData.name);
        const slugExists = await this.findBySlug(newSlug);
        const finalSlug = slugExists && slugExists.id !== id ? `${newSlug}-${id}` : newSlug;
        updates.push(`slug = $${paramIndex++}`);
        values.push(finalSlug);
      }
    }
    if (categoryData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(categoryData.description || null);
    }
    if (categoryData.image_url !== undefined) {
      updates.push(`image_url = $${paramIndex++}`);
      values.push(categoryData.image_url || null);
    }
    if (categoryData.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(categoryData.icon || null);
    }
    if (categoryData.display_order !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      values.push(categoryData.display_order);
    }
    if (categoryData.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(categoryData.is_active);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE categories
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
    // Check if category has menu items
    const countQuery = 'SELECT COUNT(*) as count FROM menu_items WHERE category_id = $1';
    const countResult = await this.db.query(countQuery, [id]);
    const itemCount = parseInt(countResult.rows[0].count || '0');
    
    if (itemCount > 0) {
      throw new Error(`Cannot delete category with ${itemCount} associated menu items`);
    }

    const query = 'DELETE FROM categories WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  async deleteMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    // Check for items
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const checkQuery = `SELECT category_id, COUNT(*) as count FROM menu_items WHERE category_id IN (${placeholders}) GROUP BY category_id`;
    const checkResult = await this.db.query(checkQuery, ids);
    
    if (checkResult.rows.length > 0) {
      const categoriesWithItems = checkResult.rows.map((r: any) => r.category_id).join(', ');
      throw new Error(`Cannot delete categories with IDs: ${categoriesWithItems} - they have associated menu items`);
    }

    const query = `DELETE FROM categories WHERE id IN (${placeholders})`;
    const result = await this.db.query(query, ids);
    return result.rowCount || 0;
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM categories';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total);
  }

  async updateItemCount(categoryId: number): Promise<void> {
    // This is handled automatically in queries, but can be used for manual updates
    const countQuery = 'SELECT COUNT(*) as count FROM menu_items WHERE category_id = $1';
    const countResult = await this.db.query(countQuery, [categoryId]);
    const count = parseInt(countResult.rows[0].count || '0');
    // Note: We don't store item_count in the table, it's calculated on-the-fly
  }
}
