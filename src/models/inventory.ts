export interface InventoryItem {
  id?: number;
  item_name: string;
  category: 'ingredients' | 'beverages' | 'packaging' | 'utensils' | 'cleaning' | 'other';
  current_stock: number;
  min_stock_level: number;
  max_stock_level: number;
  unit: 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'box' | 'pack';
  unit_price?: number;
  supplier?: string;
  location?: string;
  notes?: string;
  status?: 'in_stock' | 'low_stock' | 'out_of_stock'; // Calculated field
  last_updated?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateInventoryItemDTO {
  item_name: string;
  category: 'ingredients' | 'beverages' | 'packaging' | 'utensils' | 'cleaning' | 'other';
  current_stock: number;
  min_stock_level: number;
  max_stock_level: number;
  unit: 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'box' | 'pack';
  unit_price?: number;
  supplier?: string;
  location?: string;
  notes?: string;
}

export interface UpdateInventoryItemDTO {
  item_name?: string;
  category?: 'ingredients' | 'beverages' | 'packaging' | 'utensils' | 'cleaning' | 'other';
  current_stock?: number;
  min_stock_level?: number;
  max_stock_level?: number;
  unit?: 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'box' | 'pack';
  unit_price?: number;
  supplier?: string;
  location?: string;
  notes?: string;
}

export interface InventorySearchParams {
  search?: string;
  category?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface InventoryListResponse {
  inventory_items: InventoryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface StockUpdateDTO {
  current_stock: number;
  notes?: string;
}
