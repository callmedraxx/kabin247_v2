import { FBO, FBOSearchParams, FBOListResponse, CreateFBODTO } from '../models/fbo';

export interface FBORepository {
  create(fbo: CreateFBODTO): Promise<FBO>;
  findById(id: number): Promise<FBO | null>;
  findAll(params: FBOSearchParams): Promise<FBOListResponse>;
  update(id: number, fbo: Partial<CreateFBODTO>): Promise<FBO | null>;
  delete(id: number): Promise<boolean>;
  count(): Promise<number>;
}
