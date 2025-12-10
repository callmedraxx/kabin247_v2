import { DatabaseAdapter } from '../database/adapter';
import { MenuItem, MenuItemVariant, MenuItemSearchParams, MenuItemListResponse, CreateMenuItemDTO, UpdateMenuItemDTO } from '../models/menu-item';
import { MenuItemRepository } from './menu-item.repository';

export class PostgreSQLMenuItemRepository implements MenuItemRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(menuItemData: CreateMenuItemDTO): Promise<MenuItem> {
    // Resolve category ID from slug or ID if provided
    let categoryId: number | null = null;
    if (menuItemData.category) {
      const isNumeric = /^\d+$/.test(menuItemData.category);
      if (isNumeric) {
        categoryId = parseInt(menuItemData.category);
      } else {
        const catQuery = 'SELECT id FROM categories WHERE slug = $1';
        const catResult = await this.db.query(catQuery, [menuItemData.category]);
        if (catResult.rows.length === 0) {
          throw new Error(`Category not found: ${menuItemData.category}`);
        }
        categoryId = catResult.rows[0].id;
      }
    }

    // Insert menu item
    const itemQuery = `
      INSERT INTO menu_items (
        item_name, item_description, food_type, category_id, image_url,
        tax_rate, service_charge, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `;
    
    const itemResult = await this.db.query(itemQuery, [
      menuItemData.item_name,
      menuItemData.item_description || null,
      menuItemData.food_type,
      categoryId,
      menuItemData.image_url || null,
      menuItemData.tax_rate || null,
      menuItemData.service_charge || null,
      menuItemData.is_active !== undefined ? menuItemData.is_active : true,
    ]);

    const menuItem = itemResult.rows[0];

    // Insert variants if provided
    const variants: MenuItemVariant[] = [];
    if (menuItemData.variants && menuItemData.variants.length > 0) {
      for (let i = 0; i < menuItemData.variants.length; i++) {
        const variant = menuItemData.variants[i];
        const variantQuery = `
          INSERT INTO menu_item_variants (
            menu_item_id, portion_size, price, sort_order
          ) VALUES ($1, $2, $3, $4)
          RETURNING *
        `;
        const variantResult = await this.db.query(variantQuery, [
          menuItem.id,
          variant.portion_size,
          variant.price,
          i,
        ]);
        variants.push(variantResult.rows[0]);
      }
    }

    // Get category slug for response if category exists
    let categorySlug: string | undefined = undefined;
    if (menuItem.category_id) {
      const catSlugQuery = 'SELECT slug FROM categories WHERE id = $1';
      const catSlugResult = await this.db.query(catSlugQuery, [menuItem.category_id]);
      categorySlug = catSlugResult.rows[0]?.slug || menuItem.category_id?.toString();
    }

    return {
      ...menuItem,
      category: categorySlug,
      variants,
    };
  }

  async findById(id: number): Promise<MenuItem | null> {
    const itemQuery = 'SELECT * FROM menu_items WHERE id = $1';
    const itemResult = await this.db.query(itemQuery, [id]);
    
    if (itemResult.rows.length === 0) {
      return null;
    }

    const menuItem = itemResult.rows[0];

    // Get variants
    const variantsQuery = `
      SELECT * FROM menu_item_variants
      WHERE menu_item_id = $1
      ORDER BY sort_order ASC, id ASC
    `;
    const variantsResult = await this.db.query(variantsQuery, [id]);
    
    // Get category slug/name if category exists
    let category: string | undefined = undefined;
    if (menuItem.category_id) {
      const categoryQuery = 'SELECT slug FROM categories WHERE id = $1';
      const categoryResult = await this.db.query(categoryQuery, [menuItem.category_id]);
      category = categoryResult.rows[0]?.slug || menuItem.category_id?.toString();
    }

    return {
      ...menuItem,
      category,
      variants: variantsResult.rows,
    };
  }

  async findAll(params: MenuItemSearchParams): Promise<MenuItemListResponse> {
    const limit = params.limit || 50;
    const page = params.page || 1;
    const offset = (page - 1) * limit;
    
    let whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.search) {
      whereConditions.push(`(mi.item_name ILIKE $${paramIndex} OR mi.item_description ILIKE $${paramIndex})`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    if (params.category) {
      // Check if category is ID or slug
      const isNumeric = /^\d+$/.test(params.category);
      if (isNumeric) {
        whereConditions.push(`mi.category_id = $${paramIndex}`);
        queryParams.push(parseInt(params.category));
      } else {
        whereConditions.push(`c.slug = $${paramIndex}`);
        queryParams.push(params.category);
      }
      paramIndex++;
    }

    if (params.food_type && params.food_type !== 'all') {
      whereConditions.push(`mi.food_type = $${paramIndex}`);
      queryParams.push(params.food_type);
      paramIndex++;
    }

    if (params.is_active !== undefined) {
      whereConditions.push(`mi.is_active = $${paramIndex}`);
      queryParams.push(params.is_active);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const allowedSortFields = ['id', 'item_name', 'created_at', 'updated_at'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'created_at';
    const sortOrder = params.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = `ORDER BY mi.${sortBy} ${sortOrder}`;

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM menu_items mi
      ${params.category && !/^\d+$/.test(params.category) ? 'LEFT JOIN categories c ON mi.category_id = c.id' : ''}
      ${whereClause}
    `;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT mi.*, c.slug as category_slug
      FROM menu_items mi
      LEFT JOIN categories c ON mi.category_id = c.id
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    // Get variants for each item
    const itemsWithVariants = await Promise.all(
      result.rows.map(async (item: any) => {
        const variantsQuery = `
          SELECT * FROM menu_item_variants
          WHERE menu_item_id = $1
          ORDER BY sort_order ASC, id ASC
        `;
        const variantsResult = await this.db.query(variantsQuery, [item.id]);
        const category = item.category_id 
          ? (item.category_slug || item.category_id?.toString())
          : undefined;
        return {
          ...item,
          category,
          variants: variantsResult.rows,
        };
      })
    );

    return {
      menu_items: itemsWithVariants,
      total,
      page,
      limit,
    };
  }

  async update(id: number, menuItemData: UpdateMenuItemDTO): Promise<MenuItem | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (menuItemData.item_name !== undefined) {
      updates.push(`item_name = $${paramIndex++}`);
      values.push(menuItemData.item_name);
    }
    if (menuItemData.item_description !== undefined) {
      updates.push(`item_description = $${paramIndex++}`);
      values.push(menuItemData.item_description || null);
    }
    if (menuItemData.food_type !== undefined) {
      updates.push(`food_type = $${paramIndex++}`);
      values.push(menuItemData.food_type);
    }
    if (menuItemData.category !== undefined) {
      // Resolve category ID from slug or ID
      let categoryId: number;
      const isNumeric = /^\d+$/.test(menuItemData.category);
      if (isNumeric) {
        categoryId = parseInt(menuItemData.category);
      } else {
        const catQuery = 'SELECT id FROM categories WHERE slug = $1';
        const catResult = await this.db.query(catQuery, [menuItemData.category]);
        if (catResult.rows.length === 0) {
          throw new Error(`Category not found: ${menuItemData.category}`);
        }
        categoryId = catResult.rows[0].id;
      }
      updates.push(`category_id = $${paramIndex++}`);
      values.push(categoryId);
    }
    if (menuItemData.image_url !== undefined) {
      updates.push(`image_url = $${paramIndex++}`);
      values.push(menuItemData.image_url || null);
    }
    if (menuItemData.tax_rate !== undefined) {
      updates.push(`tax_rate = $${paramIndex++}`);
      values.push(menuItemData.tax_rate || null);
    }
    if (menuItemData.service_charge !== undefined) {
      updates.push(`service_charge = $${paramIndex++}`);
      values.push(menuItemData.service_charge || null);
    }
    if (menuItemData.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(menuItemData.is_active);
    }

    // Handle variants update
    if (menuItemData.variants && menuItemData.variants.length > 0) {
      // Delete existing variants
      await this.db.query('DELETE FROM menu_item_variants WHERE menu_item_id = $1', [id]);
      
      // Insert new variants
      for (let i = 0; i < menuItemData.variants.length; i++) {
        const variant = menuItemData.variants[i];
        await this.db.query(
          `INSERT INTO menu_item_variants (menu_item_id, portion_size, price, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [id, variant.portion_size, variant.price, i]
        );
      }
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE menu_items
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
    // Variants will be cascade deleted
    const query = 'DELETE FROM menu_items WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  async deleteMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const query = `DELETE FROM menu_items WHERE id IN (${placeholders})`;
    const result = await this.db.query(query, ids);
    return result.rowCount || 0;
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM menu_items';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total);
  }
}
