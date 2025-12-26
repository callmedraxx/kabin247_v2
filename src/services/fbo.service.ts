import { FBO, CreateFBODTO, FBOSearchParams, FBOListResponse } from '../models/fbo';
import { getFBORepository } from '../repositories';
import { Logger } from '../utils/logger';

export class FBOService {
  private repository = getFBORepository();

  async createFBO(data: CreateFBODTO): Promise<FBO> {
    if (!data.fbo_name || data.fbo_name.trim().length === 0) {
      throw new Error('FBO name is required');
    }

    return this.repository.create(data);
  }

  async getFBOById(id: number): Promise<FBO | null> {
    return this.repository.findById(id);
  }

  async listFBOs(params: FBOSearchParams): Promise<FBOListResponse> {
    return this.repository.findAll(params);
  }

  async updateFBO(id: number, data: Partial<CreateFBODTO>): Promise<FBO | null> {
    if (data.fbo_name !== undefined && (!data.fbo_name || data.fbo_name.trim().length === 0)) {
      throw new Error('FBO name cannot be empty');
    }

    return this.repository.update(id, data);
  }

  async deleteFBO(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async getFBOCount(): Promise<number> {
    return this.repository.count();
  }
}
