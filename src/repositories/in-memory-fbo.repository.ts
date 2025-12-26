import { FBO, FBOSearchParams, FBOListResponse, CreateFBODTO } from '../models/fbo';
import { FBORepository } from './fbo.repository';

export class InMemoryFBORepository implements FBORepository {
  private fbos: FBO[] = [];
  private nextId: number = 1;

  async create(fbo: CreateFBODTO): Promise<FBO> {
    const now = new Date();
    const newFBO: FBO = {
      id: this.nextId++,
      ...fbo,
      created_at: now,
      updated_at: now,
    };
    this.fbos.push(newFBO);
    return newFBO;
  }

  async findById(id: number): Promise<FBO | null> {
    return this.fbos.find(f => f.id === id) || null;
  }

  async findAll(params: FBOSearchParams): Promise<FBOListResponse> {
    let filtered = [...this.fbos];

    // Apply search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(fbo => {
        return (
          fbo.fbo_name?.toLowerCase().includes(searchLower) ||
          fbo.fbo_email?.toLowerCase().includes(searchLower) ||
          fbo.fbo_phone?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply sorting
    if (params.sortBy) {
      const sortBy = params.sortBy as keyof FBO;
      const sortOrder = params.sortOrder || 'asc';
      filtered.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortOrder === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        return 0;
      });
    } else {
      // Default sort by name
      filtered.sort((a, b) => a.fbo_name.localeCompare(b.fbo_name));
    }

    const total = filtered.length;
    const page = params.page || 1;
    const limit = params.limit || 10;
    const offset = (page - 1) * limit;

    const paginated = filtered.slice(offset, offset + limit);

    return {
      fbos: paginated,
      total,
      page,
      limit,
    };
  }

  async update(id: number, fbo: Partial<CreateFBODTO>): Promise<FBO | null> {
    const index = this.fbos.findIndex(f => f.id === id);
    if (index === -1) {
      return null;
    }

    const updated: FBO = {
      ...this.fbos[index],
      ...fbo,
      updated_at: new Date(),
    };
    this.fbos[index] = updated;
    return updated;
  }

  async delete(id: number): Promise<boolean> {
    const index = this.fbos.findIndex(f => f.id === id);
    if (index === -1) {
      return false;
    }
    this.fbos.splice(index, 1);
    return true;
  }

  async count(): Promise<number> {
    return this.fbos.length;
  }
}
