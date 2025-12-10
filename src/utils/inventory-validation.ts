import { CreateInventoryItemDTO, UpdateInventoryItemDTO } from '../models/inventory';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateInventoryItem(inventoryItem: CreateInventoryItemDTO | UpdateInventoryItemDTO): ValidationResult {
  const errors: string[] = [];

  if ('item_name' in inventoryItem && !inventoryItem.item_name) {
    errors.push('item_name is required');
  }

  if ('category' in inventoryItem && inventoryItem.category) {
    const validCategories = ['ingredients', 'beverages', 'packaging', 'utensils', 'cleaning', 'other'];
    if (!validCategories.includes(inventoryItem.category)) {
      errors.push(`category must be one of: ${validCategories.join(', ')}`);
    }
  }

  if ('current_stock' in inventoryItem && inventoryItem.current_stock !== undefined) {
    if (typeof inventoryItem.current_stock !== 'number' || inventoryItem.current_stock < 0) {
      errors.push('current_stock must be a non-negative number');
    }
  }

  if ('min_stock_level' in inventoryItem && inventoryItem.min_stock_level !== undefined) {
    if (typeof inventoryItem.min_stock_level !== 'number' || inventoryItem.min_stock_level < 0) {
      errors.push('min_stock_level must be a non-negative number');
    }
  }

  if ('max_stock_level' in inventoryItem && inventoryItem.max_stock_level !== undefined) {
    if (typeof inventoryItem.max_stock_level !== 'number' || inventoryItem.max_stock_level < 0) {
      errors.push('max_stock_level must be a non-negative number');
    }
  }

  if ('min_stock_level' in inventoryItem && 'max_stock_level' in inventoryItem && 
      inventoryItem.min_stock_level !== undefined && inventoryItem.max_stock_level !== undefined) {
    if (inventoryItem.min_stock_level > inventoryItem.max_stock_level) {
      errors.push('min_stock_level cannot be greater than max_stock_level');
    }
  }

  if ('unit' in inventoryItem && inventoryItem.unit) {
    const validUnits = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'pack'];
    if (!validUnits.includes(inventoryItem.unit)) {
      errors.push(`unit must be one of: ${validUnits.join(', ')}`);
    }
  }

  if ('unit_price' in inventoryItem && inventoryItem.unit_price !== undefined) {
    if (typeof inventoryItem.unit_price !== 'number' || inventoryItem.unit_price < 0) {
      errors.push('unit_price must be a non-negative number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeInventoryItemData<T extends CreateInventoryItemDTO | UpdateInventoryItemDTO>(inventoryItem: T): T {
  const normalized = { ...inventoryItem } as T;

  if ('item_name' in normalized && normalized.item_name) {
    normalized.item_name = normalized.item_name.trim();
  }

  if ('supplier' in normalized && normalized.supplier) {
    normalized.supplier = normalized.supplier.trim();
  }

  if ('location' in normalized && normalized.location) {
    normalized.location = normalized.location.trim();
  }

  return normalized;
}
