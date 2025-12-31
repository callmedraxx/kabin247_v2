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

    // Insert variants if provided, or create a default variant if price is provided directly
    const variants: MenuItemVariant[] = [];
    
    // Determine variants to insert
    let variantsToInsert = menuItemData.variants || [];
    
    // If no variants but price is provided directly, create a default variant
    if (variantsToInsert.length === 0 && menuItemData.price !== undefined && menuItemData.price > 0) {
      variantsToInsert = [{ portion_size: '1', price: menuItemData.price }];
    }
    
    if (variantsToInsert.length > 0) {
      for (let i = 0; i < variantsToInsert.length; i++) {
        const variant = variantsToInsert[i];
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
        const insertedVariant = variantResult.rows[0];
        
        // Insert caterer prices if provided
        if (variant.caterer_prices && variant.caterer_prices.length > 0) {
          for (const catererPrice of variant.caterer_prices) {
            await this.db.query(
              `INSERT INTO menu_item_variant_caterer_prices (variant_id, caterer_id, price)
               VALUES ($1, $2, $3)
               ON CONFLICT (variant_id, caterer_id) DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()`,
              [insertedVariant.id, catererPrice.caterer_id, catererPrice.price]
            );
          }
          
          // Fetch all caterer prices for this variant to include in response
          const catererPricesQuery = `
            SELECT caterer_id, price
            FROM menu_item_variant_caterer_prices
            WHERE variant_id = $1
          `;
          const catererPricesResult = await this.db.query(catererPricesQuery, [insertedVariant.id]);
          insertedVariant.caterer_prices = catererPricesResult.rows;
        }
        
        variants.push(insertedVariant);
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
    
    // Get caterer prices for all variants
    const variantsWithCatererPrices = await Promise.all(
      variantsResult.rows.map(async (variant: any) => {
        const catererPricesQuery = `
          SELECT caterer_id, price
          FROM menu_item_variant_caterer_prices
          WHERE variant_id = $1
        `;
        const catererPricesResult = await this.db.query(catererPricesQuery, [variant.id]);
        return {
          ...variant,
          caterer_prices: catererPricesResult.rows.length > 0 ? catererPricesResult.rows : undefined,
        };
      })
    );
    
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
      variants: variantsWithCatererPrices,
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
        
        // Get caterer prices for all variants
        const variantsWithCatererPrices = await Promise.all(
          variantsResult.rows.map(async (variant: any) => {
            const catererPricesQuery = `
              SELECT caterer_id, price
              FROM menu_item_variant_caterer_prices
              WHERE variant_id = $1
            `;
            const catererPricesResult = await this.db.query(catererPricesQuery, [variant.id]);
            return {
              ...variant,
              caterer_prices: catererPricesResult.rows.length > 0 ? catererPricesResult.rows : undefined,
            };
          })
        );
        
        const category = item.category_id 
          ? (item.category_slug || item.category_id?.toString())
          : undefined;
        return {
          ...item,
          category,
          variants: variantsWithCatererPrices,
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
    // Determine variants to update - if price is provided without variants, create a default variant
    let variantsToUpdate = menuItemData.variants || [];
    
    if (variantsToUpdate.length === 0 && menuItemData.price !== undefined && menuItemData.price > 0) {
      // Create a default variant with the provided price
      variantsToUpdate = [{ portion_size: '1', price: menuItemData.price }];
    }
    
    if (variantsToUpdate.length > 0) {
      // Get existing variant IDs before deletion (for cascading caterer prices)
      const existingVariantsQuery = 'SELECT id FROM menu_item_variants WHERE menu_item_id = $1';
      const existingVariantsResult = await this.db.query(existingVariantsQuery, [id]);
      const existingVariantIds = existingVariantsResult.rows.map((v: any) => v.id);
      
      // Delete existing caterer prices for variants (cascade will handle this, but explicit for clarity)
      if (existingVariantIds.length > 0) {
        await this.db.query(
          `DELETE FROM menu_item_variant_caterer_prices WHERE variant_id = ANY($1)`,
          [existingVariantIds]
        );
      }
      
      // Delete existing variants
      await this.db.query('DELETE FROM menu_item_variants WHERE menu_item_id = $1', [id]);
      
      // Insert new variants
      for (let i = 0; i < variantsToUpdate.length; i++) {
        const variant = variantsToUpdate[i];
        const variantInsertQuery = `
          INSERT INTO menu_item_variants (menu_item_id, portion_size, price, sort_order)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `;
        const variantInsertResult = await this.db.query(variantInsertQuery, [
          id, 
          variant.portion_size, 
          variant.price, 
          i
        ]);
        const variantId = variantInsertResult.rows[0].id;
        
        // Insert caterer prices if provided
        if (variant.caterer_prices && variant.caterer_prices.length > 0) {
          for (const catererPrice of variant.caterer_prices) {
            await this.db.query(
              `INSERT INTO menu_item_variant_caterer_prices (variant_id, caterer_id, price)
               VALUES ($1, $2, $3)
               ON CONFLICT (variant_id, caterer_id) DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()`,
              [variantId, catererPrice.caterer_id, catererPrice.price]
            );
          }
        }
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

  async getPriceForVariant(variantId: number, catererId: number | null): Promise<number | null> {
    // If caterer_id is provided, try to get caterer-specific price first
    if (catererId !== null) {
      const catererPriceQuery = `
        SELECT price
        FROM menu_item_variant_caterer_prices
        WHERE variant_id = $1 AND caterer_id = $2
      `;
      const catererPriceResult = await this.db.query(catererPriceQuery, [variantId, catererId]);
      
      if (catererPriceResult.rows.length > 0) {
        return parseFloat(catererPriceResult.rows[0].price);
      }
    }
    
    // Fallback to base variant price
    const variantQuery = 'SELECT price FROM menu_item_variants WHERE id = $1';
    const variantResult = await this.db.query(variantQuery, [variantId]);
    
    if (variantResult.rows.length > 0) {
      return parseFloat(variantResult.rows[0].price);
    }
    
    return null;
  }
}
