import { MenuItem, MenuItemVariant, MenuItemSearchParams, MenuItemListResponse, CreateMenuItemDTO, UpdateMenuItemDTO } from '../models/menu-item';
import { MenuItemRepository } from './menu-item.repository';

export class InMemoryMenuItemRepository implements MenuItemRepository {
  private menuItems: MenuItem[] = [];
  private variants: MenuItemVariant[] = [];
  private nextId: number = 1;
  private nextVariantId: number = 1;

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
      const itemVariants: MenuItemVariant[] = menuItemData.variants.map((variant, index) => ({
        id: this.nextVariantId++,
        menu_item_id: newMenuItem.id,
        portion_size: variant.portion_size,
        price: variant.price,
        sort_order: index,
      }));

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
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

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
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
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
      // Delete existing variants
      this.variants = this.variants.filter(v => v.menu_item_id !== id);
      
      // Create new variants
      const newVariants: MenuItemVariant[] = menuItemData.variants.map((variant, idx) => ({
        id: variant.id || this.nextVariantId++,
        menu_item_id: id,
        portion_size: variant.portion_size,
        price: variant.price,
        sort_order: idx,
      }));
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
    // Cascade delete variants
    this.variants = this.variants.filter(v => v.menu_item_id !== id);
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
}
