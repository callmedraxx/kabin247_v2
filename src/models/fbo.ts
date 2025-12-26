export interface FBO {
  id?: number;
  fbo_name: string;
  fbo_email?: string;
  fbo_phone?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateFBODTO {
  fbo_name: string;
  fbo_email?: string;
  fbo_phone?: string;
}

export interface UpdateFBODTO {
  fbo_name?: string;
  fbo_email?: string;
  fbo_phone?: string;
}

export interface FBOSearchParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface FBOListResponse {
  fbos: FBO[];
  total: number;
  page: number;
  limit: number;
}
