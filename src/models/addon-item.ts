export interface AddonItem {
  id?: number;
  name: string;
  description?: string;
  price: number;
  category?: string; // Category ID or slug
  image_url?: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateAddonItemDTO {
  name: string;
  description?: string;
  price: number;
  category?: string;
  image_url?: string;
  is_active?: boolean;
}

export interface UpdateAddonItemDTO {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  image_url?: string;
  is_active?: boolean;
}

export interface AddonItemSearchParams {
  search?: string;
  category?: string;
  is_active?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AddonItemListResponse {
  addon_items: AddonItem[];
  total: number;
  page: number;
  limit: number;
}
