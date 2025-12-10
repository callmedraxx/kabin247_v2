export interface Airport {
  id?: number;
  airport_name: string;
  fbo_name: string;
  fbo_email?: string;
  fbo_phone?: string;
  airport_code_iata?: string;
  airport_code_icao?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateAirportDTO {
  airport_name: string;
  fbo_name: string;
  fbo_email?: string;
  fbo_phone?: string;
  airport_code_iata?: string;
  airport_code_icao?: string;
}

export interface AirportSearchParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  offset?: number;
}

export interface AirportListResponse {
  airports: Airport[];
  total: number;
  page: number;
  limit: number;
  offset: number;
}

