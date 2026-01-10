export interface Client {
  id?: number;
  full_name: string;
  company_name?: string;
  full_address: string;
  email?: string;
  contact_number?: string;
  additional_emails?: string[];
  square_customer_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateClientDTO {
  full_name: string;
  company_name?: string;
  full_address: string;
  email: string;
  contact_number?: string;
  additional_emails?: string[];
}

export interface ClientSearchParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  offset?: number;
}

export interface ClientListResponse {
  clients: Client[];
  total: number;
  page: number;
  limit: number;
  offset: number;
}
