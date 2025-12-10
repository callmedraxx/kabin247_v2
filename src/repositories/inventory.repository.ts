import { InventoryItem, InventorySearchParams, InventoryListResponse, CreateInventoryItemDTO, UpdateInventoryItemDTO } from '../models/inventory';

export interface InventoryRepository {
  create(inventoryItem: CreateInventoryItemDTO): Promise<InventoryItem>;
  findById(id: number): Promise<InventoryItem | null>;
  findAll(params: InventorySearchParams): Promise<InventoryListResponse>;
  update(id: number, inventoryItem: UpdateInventoryItemDTO): Promise<InventoryItem | null>;
  updateStock(id: number, stock: number, notes?: string): Promise<InventoryItem | null>;
  delete(id: number): Promise<boolean>;
  deleteMany(ids: number[]): Promise<number>;
  findLowStock(status?: 'low_stock' | 'out_of_stock'): Promise<InventoryItem[]>;
  count(): Promise<number>;
}
