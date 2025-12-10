import { InventoryItem, InventorySearchParams, InventoryListResponse, CreateInventoryItemDTO, UpdateInventoryItemDTO } from '../models/inventory';
import { InventoryRepository } from './inventory.repository';

export class InMemoryInventoryRepository implements InventoryRepository {
  private inventoryItems: InventoryItem[] = [];
  private nextId: number = 1;

  private calculateStatus(item: InventoryItem): 'in_stock' | 'low_stock' | 'out_of_stock' {
    if (item.current_stock === 0) {
      return 'out_of_stock';
    }
    if (item.current_stock <= item.min_stock_level) {
      return 'low_stock';
    }
    return 'in_stock';
  }

  async create(inventoryItemData: CreateInventoryItemDTO): Promise<InventoryItem> {
    const now = new Date();

    const newItem: InventoryItem = {
      id: this.nextId++,
      item_name: inventoryItemData.item_name,
      category: inventoryItemData.category,
      current_stock: inventoryItemData.current_stock,
      min_stock_level: inventoryItemData.min_stock_level,
      max_stock_level: inventoryItemData.max_stock_level,
      unit: inventoryItemData.unit,
      unit_price: inventoryItemData.unit_price,
      supplier: inventoryItemData.supplier,
      location: inventoryItemData.location,
      notes: inventoryItemData.notes,
      last_updated: now,
      created_at: now,
      updated_at: now,
    };

    newItem.status = this.calculateStatus(newItem);
    this.inventoryItems.push(newItem);
    return newItem;
  }

  async findById(id: number): Promise<InventoryItem | null> {
    const item = this.inventoryItems.find(i => i.id === id);
    if (!item) return null;
    return { ...item, status: this.calculateStatus(item) };
  }

  async findAll(params: InventorySearchParams): Promise<InventoryListResponse> {
    let filtered = [...this.inventoryItems];

    // Apply search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(item => {
        return (
          item.item_name?.toLowerCase().includes(searchLower) ||
          item.supplier?.toLowerCase().includes(searchLower) ||
          item.location?.toLowerCase().includes(searchLower) ||
          item.category?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply category filter
    if (params.category) {
      filtered = filtered.filter(item => item.category === params.category);
    }

    // Apply status filter
    if (params.status && params.status !== 'all') {
      filtered = filtered.filter(item => {
        const status = this.calculateStatus(item);
        return status === params.status;
      });
    }

    // Apply sorting
    const sortBy = params.sortBy || 'last_updated';
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

    // Calculate status for each item
    const itemsWithStatus = paginated.map(item => ({
      ...item,
      status: this.calculateStatus(item),
    }));

    return {
      inventory_items: itemsWithStatus,
      total,
      page,
      limit,
    };
  }

  async update(id: number, inventoryItemData: UpdateInventoryItemDTO): Promise<InventoryItem | null> {
    const index = this.inventoryItems.findIndex(i => i.id === id);
    if (index === -1) return null;

    const now = new Date();
    this.inventoryItems[index] = {
      ...this.inventoryItems[index],
      ...inventoryItemData,
      last_updated: inventoryItemData.current_stock !== undefined ? now : this.inventoryItems[index].last_updated,
      updated_at: now,
    };

    return this.findById(id);
  }

  async updateStock(id: number, stock: number, notes?: string): Promise<InventoryItem | null> {
    const index = this.inventoryItems.findIndex(i => i.id === id);
    if (index === -1) return null;

    const now = new Date();
    this.inventoryItems[index] = {
      ...this.inventoryItems[index],
      current_stock: stock,
      notes: notes || this.inventoryItems[index].notes,
      last_updated: now,
      updated_at: now,
    };

    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const index = this.inventoryItems.findIndex(i => i.id === id);
    if (index === -1) return false;

    this.inventoryItems.splice(index, 1);
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

  async findLowStock(status?: 'low_stock' | 'out_of_stock'): Promise<InventoryItem[]> {
    const items = this.inventoryItems.map(item => ({
      ...item,
      status: this.calculateStatus(item),
    }));

    if (status) {
      return items.filter(item => item.status === status);
    }

    return items.filter(item => item.status === 'low_stock' || item.status === 'out_of_stock');
  }

  async count(): Promise<number> {
    return this.inventoryItems.length;
  }
}
