import { MenuItem, MenuItemVariant, MenuItemSearchParams, MenuItemListResponse, CreateMenuItemDTO, UpdateMenuItemDTO } from '../models/menu-item';
import { MenuItemRepository } from './menu-item.repository';

interface CatererPrice {
  id: number;
  variant_id: number;
  caterer_id: number;
  price: number;
}

export class InMemoryMenuItemRepository implements MenuItemRepository {
  private menuItems: MenuItem[] = [];
  private variants: MenuItemVariant[] = [];
  private catererPrices: CatererPrice[] = [];
  private nextId: number = 1;
  private nextVariantId: number = 1;
  private nextCatererPriceId: number = 1;

  async create(menuItemData: CreateMenuItemDTO): Promise<MenuItem> {
    const now = new Date();

    const newMenuItem: MenuItem = {
      id: this.nextId++,
      item_name: menuItemData.item_name,
      item_description: menuItemData.item_description,
      food_type: menuItemData.food_type,
      category: menuItemData.category,
      image_url: menuItemData.image_url,
      tax_rate: menuItemData.tax_rate,
      service_charge: menuItemData.service_charge,
      is_active: menuItemData.is_active !== undefined ? menuItemData.is_active : true,
      created_at: now,
      updated_at: now,
    };

    this.menuItems.push(newMenuItem);

    // Create variants if provided
    if (menuItemData.variants && menuItemData.variants.length > 0) {
      const itemVariants: MenuItemVariant[] = menuItemData.variants.map((variant, index) => {
        const variantId = this.nextVariantId++;
        const newVariant: MenuItemVariant = {
          id: variantId,
          menu_item_id: newMenuItem.id,
          portion_size: variant.portion_size,
          price: variant.price,
          sort_order: index,
        };

        // Add caterer prices if provided
        if (variant.caterer_prices && variant.caterer_prices.length > 0) {
          const variantCatererPrices = variant.caterer_prices.map(cp => ({
            id: this.nextCatererPriceId++,
            variant_id: variantId,
            caterer_id: cp.caterer_id,
            price: cp.price,
          }));
          this.catererPrices.push(...variantCatererPrices);
          newVariant.caterer_prices = variantCatererPrices.map(cp => ({
            caterer_id: cp.caterer_id,
            price: cp.price,
          }));
        }

        return newVariant;
      });

      this.variants.push(...itemVariants);
      newMenuItem.variants = itemVariants;
    } else {
      newMenuItem.variants = [];
    }

    return newMenuItem;
  }

  async findById(id: number): Promise<MenuItem | null> {
    const menuItem = this.menuItems.find(m => m.id === id);
    if (!menuItem) return null;

    const itemVariants = this.variants
      .filter(v => v.menu_item_id === id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(variant => {
        const catererPrices = this.catererPrices
          .filter(cp => cp.variant_id === variant.id)
          .map(cp => ({ caterer_id: cp.caterer_id, price: cp.price }));
        
        return {
          ...variant,
          caterer_prices: catererPrices.length > 0 ? catererPrices : undefined,
        };
      });

    return {
      ...menuItem,
      variants: itemVariants,
    };
  }

  async findAll(params: MenuItemSearchParams): Promise<MenuItemListResponse> {
    let filtered = [...this.menuItems];

    // Apply search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(item => {
        return (
          item.item_name?.toLowerCase().includes(searchLower) ||
          item.item_description?.toLowerCase().includes(searchLower) ||
          item.category?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply category filter
    if (params.category) {
      filtered = filtered.filter(item => item.category === params.category);
    }

    // Apply food_type filter
    if (params.food_type && params.food_type !== 'all') {
      filtered = filtered.filter(item => item.food_type === params.food_type);
    }

    // Apply active filter
    if (params.is_active !== undefined) {
      filtered = filtered.filter(item => item.is_active === params.is_active);
    }

    // Apply sorting
    const sortBy = params.sortBy || 'created_at';
    const sortOrder = params.sortOrder || 'desc';
    filtered.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const total = filtered.length;

    // Apply pagination
    const limit = params.limit || 50;
    const page = params.page || 1;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    // Add variants to each item
    const itemsWithVariants = paginated.map(item => {
      const itemVariants = this.variants
        .filter(v => v.menu_item_id === item.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(variant => {
          const catererPrices = this.catererPrices
            .filter(cp => cp.variant_id === variant.id)
            .map(cp => ({ caterer_id: cp.caterer_id, price: cp.price }));
          
          return {
            ...variant,
            caterer_prices: catererPrices.length > 0 ? catererPrices : undefined,
          };
        });
      return { ...item, variants: itemVariants };
    });

    return {
      menu_items: itemsWithVariants,
      total,
      page,
      limit,
    };
  }

  async update(id: number, menuItemData: UpdateMenuItemDTO): Promise<MenuItem | null> {
    const index = this.menuItems.findIndex(m => m.id === id);
    if (index === -1) return null;

    const existing = this.menuItems[index];

    // Handle variants update
    if (menuItemData.variants && menuItemData.variants.length > 0) {
      // Get existing variant IDs before deletion
      const existingVariantIds = this.variants
        .filter(v => v.menu_item_id === id)
        .map(v => v.id!);
      
      // Delete existing caterer prices for variants
      this.catererPrices = this.catererPrices.filter(
        cp => !existingVariantIds.includes(cp.variant_id)
      );
      
      // Delete existing variants
      this.variants = this.variants.filter(v => v.menu_item_id !== id);
      
      // Create new variants
      const newVariants: MenuItemVariant[] = menuItemData.variants.map((variant, idx) => {
        const variantId = variant.id || this.nextVariantId++;
        const newVariant: MenuItemVariant = {
          id: variantId,
          menu_item_id: id,
          portion_size: variant.portion_size,
          price: variant.price,
          sort_order: idx,
        };

        // Add caterer prices if provided
        if (variant.caterer_prices && variant.caterer_prices.length > 0) {
          // Remove existing caterer prices for this variant (if updating)
          this.catererPrices = this.catererPrices.filter(cp => cp.variant_id !== variantId);
          
          const variantCatererPrices = variant.caterer_prices.map(cp => ({
            id: this.nextCatererPriceId++,
            variant_id: variantId,
            caterer_id: cp.caterer_id,
            price: cp.price,
          }));
          this.catererPrices.push(...variantCatererPrices);
          newVariant.caterer_prices = variantCatererPrices.map(cp => ({
            caterer_id: cp.caterer_id,
            price: cp.price,
          }));
        }

        return newVariant;
      });
      this.variants.push(...newVariants);
    }

    this.menuItems[index] = {
      ...existing,
      ...menuItemData,
      updated_at: new Date(),
    };

    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const index = this.menuItems.findIndex(m => m.id === id);
    if (index === -1) return false;

    this.menuItems.splice(index, 1);
    // Cascade delete variants and caterer prices
    const variantIds = this.variants
      .filter(v => v.menu_item_id === id)
      .map(v => v.id!);
    this.variants = this.variants.filter(v => v.menu_item_id !== id);
    this.catererPrices = this.catererPrices.filter(cp => !variantIds.includes(cp.variant_id));
    return true;
  }

  async deleteMany(ids: number[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  async count(): Promise<number> {
    return this.menuItems.length;
  }

  async getPriceForVariant(variantId: number, catererId: number | null): Promise<number | null> {
    // If caterer_id is provided, try to get caterer-specific price first
    if (catererId !== null) {
      const catererPrice = this.catererPrices.find(
        cp => cp.variant_id === variantId && cp.caterer_id === catererId
      );
      
      if (catererPrice) {
        return catererPrice.price;
      }
    }
    
    // Fallback to base variant price
    const variant = this.variants.find(v => v.id === variantId);
    if (variant) {
      return variant.price;
    }
    
    return null;
  }
}
