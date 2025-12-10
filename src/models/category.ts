export interface Category {
  id?: number;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  icon?: string;
  display_order: number;
  item_count?: number; // Calculated field
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateCategoryDTO {
  name: string;
  slug?: string; // Auto-generated if not provided
  description?: string;
  image_url?: string;
  icon?: string;
  display_order: number;
  is_active?: boolean;
}

export interface UpdateCategoryDTO {
  name?: string;
  slug?: string;
  description?: string;
  image_url?: string;
  icon?: string;
  display_order?: number;
  is_active?: boolean;
}

export interface CategorySearchParams {
  search?: string;
  is_active?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CategoryListResponse {
  categories: Category[];
  total: number;
  page: number;
  limit: number;
}
