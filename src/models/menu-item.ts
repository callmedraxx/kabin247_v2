export interface MenuItemVariant {
  id?: number;
  menu_item_id?: number;
  portion_size: string;
  price: number;
  sort_order?: number;
}

export interface MenuItem {
  id?: number;
  item_name: string;
  item_description?: string;
  food_type: 'veg' | 'non_veg';
  category?: string; // Category ID or slug
  image_url?: string;
  variants?: MenuItemVariant[];
  tax_rate?: number;
  service_charge?: number;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateMenuItemDTO {
  item_name: string;
  item_description?: string;
  food_type: 'veg' | 'non_veg';
  category?: string;
  image_url?: string;
  variants?: Array<{
    portion_size: string;
    price: number;
  }>;
  tax_rate?: number;
  service_charge?: number;
  is_active?: boolean;
}

export interface UpdateMenuItemDTO {
  item_name?: string;
  item_description?: string;
  food_type?: 'veg' | 'non_veg';
  category?: string;
  image_url?: string;
  variants?: Array<{
    id?: number;
    portion_size: string;
    price: number;
  }>;
  tax_rate?: number;
  service_charge?: number;
  is_active?: boolean;
}

export interface MenuItemSearchParams {
  search?: string;
  category?: string;
  food_type?: string;
  is_active?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface MenuItemListResponse {
  menu_items: MenuItem[];
  total: number;
  page: number;
  limit: number;
}

export interface MenuItemStatusUpdateDTO {
  is_active: boolean;
}
