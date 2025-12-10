export interface TaxCharge {
  id?: number;
  name: string;
  type: 'tax' | 'service_charge' | 'delivery_fee' | 'other';
  rate: number;
  is_percentage: boolean;
  applies_to: 'all' | 'category' | 'location' | 'item';
  category?: string; // Category ID or slug
  location?: string;
  min_amount?: number;
  max_amount?: number;
  description?: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateTaxChargeDTO {
  name: string;
  type: 'tax' | 'service_charge' | 'delivery_fee' | 'other';
  rate: number;
  is_percentage: boolean;
  applies_to: 'all' | 'category' | 'location' | 'item';
  category?: string;
  location?: string;
  min_amount?: number;
  max_amount?: number;
  description?: string;
  is_active?: boolean;
}

export interface UpdateTaxChargeDTO {
  name?: string;
  type?: 'tax' | 'service_charge' | 'delivery_fee' | 'other';
  rate?: number;
  is_percentage?: boolean;
  applies_to?: 'all' | 'category' | 'location' | 'item';
  category?: string;
  location?: string;
  min_amount?: number;
  max_amount?: number;
  description?: string;
  is_active?: boolean;
}

export interface TaxChargeSearchParams {
  search?: string;
  type?: string;
  applies_to?: string;
  is_active?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface TaxChargeListResponse {
  tax_charges: TaxCharge[];
  total: number;
  page: number;
  limit: number;
}
