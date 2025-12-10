export interface Caterer {
  id?: number;
  caterer_name: string;
  caterer_number: string;
  caterer_email?: string;
  airport_code_iata?: string;
  airport_code_icao?: string;
  time_zone?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateCatererDTO {
  caterer_name: string;
  caterer_number: string;
  caterer_email?: string;
  airport_code_iata?: string;
  airport_code_icao?: string;
  time_zone?: string;
}

export interface CatererSearchParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  offset?: number;
}

export interface CatererListResponse {
  caterers: Caterer[];
  total: number;
  page: number;
  limit: number;
  offset: number;
}

