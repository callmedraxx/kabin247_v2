import { AddonItem, AddonItemSearchParams, AddonItemListResponse, CreateAddonItemDTO, UpdateAddonItemDTO } from '../models/addon-item';
import { AddonItemRepository } from './addon-item.repository';

export class InMemoryAddonItemRepository implements AddonItemRepository {
  private addonItems: AddonItem[] = [];
  private nextId: number = 1;

  async create(addonItemData: CreateAddonItemDTO): Promise<AddonItem> {
    const now = new Date();

    const newAddonItem: AddonItem = {
      id: this.nextId++,
      name: addonItemData.name,
      description: addonItemData.description,
      price: addonItemData.price,
      category: addonItemData.category,
      image_url: addonItemData.image_url,
      is_active: addonItemData.is_active !== undefined ? addonItemData.is_active : true,
      created_at: now,
      updated_at: now,
    };

    this.addonItems.push(newAddonItem);
    return newAddonItem;
  }

  async findById(id: number): Promise<AddonItem | null> {
    return this.addonItems.find(a => a.id === id) || null;
  }

  async findAll(params: AddonItemSearchParams): Promise<AddonItemListResponse> {
    let filtered = [...this.addonItems];

    // Apply search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(item => {
        return (
          item.name?.toLowerCase().includes(searchLower) ||
          item.description?.toLowerCase().includes(searchLower) ||
          item.category?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply category filter
    if (params.category) {
      filtered = filtered.filter(item => item.category === params.category);
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

    return {
      addon_items: paginated,
      total,
      page,
      limit,
    };
  }

  async update(id: number, addonItemData: UpdateAddonItemDTO): Promise<AddonItem | null> {
    const index = this.addonItems.findIndex(a => a.id === id);
    if (index === -1) return null;

    this.addonItems[index] = {
      ...this.addonItems[index],
      ...addonItemData,
      updated_at: new Date(),
    };

    return this.addonItems[index];
  }

  async delete(id: number): Promise<boolean> {
    const index = this.addonItems.findIndex(a => a.id === id);
    if (index === -1) return false;

    this.addonItems.splice(index, 1);
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
    return this.addonItems.length;
  }
}
