import { InventoryItem, CreateInventoryItemDTO, UpdateInventoryItemDTO, InventorySearchParams, InventoryListResponse, StockUpdateDTO } from '../models/inventory';
import { getInventoryRepository } from '../repositories';
import { validateInventoryItem, normalizeInventoryItemData } from '../utils/inventory-validation';
import { Logger } from '../utils/logger';

export class InventoryService {
  private repository = getInventoryRepository();

  async createInventoryItem(data: CreateInventoryItemDTO): Promise<InventoryItem> {
    const normalized = normalizeInventoryItemData(data);
    const validation = validateInventoryItem(normalized);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return this.repository.create(normalized);
  }

  async getInventoryItemById(id: number): Promise<InventoryItem | null> {
    return this.repository.findById(id);
  }

  async listInventoryItems(params: InventorySearchParams): Promise<InventoryListResponse> {
    return this.repository.findAll(params);
  }

  async updateInventoryItem(id: number, data: UpdateInventoryItemDTO): Promise<InventoryItem | null> {
    const normalized = normalizeInventoryItemData(data);
    
    if (Object.keys(normalized).length > 0) {
      const validation = validateInventoryItem(normalized);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
    }

    return this.repository.update(id, normalized);
  }

  async updateStock(id: number, stockData: StockUpdateDTO): Promise<InventoryItem | null> {
    if (stockData.current_stock < 0) {
      throw new Error('current_stock must be a non-negative number');
    }

    return this.repository.updateStock(id, stockData.current_stock, stockData.notes);
  }

  async deleteInventoryItem(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async deleteInventoryItems(ids: number[]): Promise<number> {
    return this.repository.deleteMany(ids);
  }

  async getLowStockItems(status?: 'low_stock' | 'out_of_stock'): Promise<InventoryItem[]> {
    return this.repository.findLowStock(status);
  }
}
