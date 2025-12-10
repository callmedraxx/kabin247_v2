import { Caterer, CatererSearchParams, CatererListResponse, CreateCatererDTO } from '../models/caterer';
import { CatererRepository } from './caterer.repository';
import { normalizeCatererData } from '../utils/caterer-validation';

export class InMemoryCatererRepository implements CatererRepository {
  private caterers: Caterer[] = [];
  private nextId: number = 1;

  async create(caterer: CreateCatererDTO): Promise<Caterer> {
    const now = new Date();
    const newCaterer: Caterer = {
      id: this.nextId++,
      ...caterer,
      created_at: now,
      updated_at: now,
    };
    this.caterers.push(newCaterer);
    return newCaterer;
  }

  async findById(id: number): Promise<Caterer | null> {
    return this.caterers.find(c => c.id === id) || null;
  }

  async findAll(params: CatererSearchParams): Promise<CatererListResponse> {
    let filtered = [...this.caterers];

    // Apply search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(caterer => {
        return (
          caterer.caterer_name?.toLowerCase().includes(searchLower) ||
          caterer.caterer_number?.toLowerCase().includes(searchLower) ||
          caterer.caterer_email?.toLowerCase().includes(searchLower) ||
          caterer.airport_code_iata?.toLowerCase().includes(searchLower) ||
          caterer.airport_code_icao?.toLowerCase().includes(searchLower) ||
          caterer.time_zone?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply sorting
    if (params.sortBy) {
      const sortBy = params.sortBy as keyof Caterer;
      const sortOrder = params.sortOrder || 'asc';
      filtered.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    const total = filtered.length;

    // Apply pagination
    const offset = params.offset ?? (params.page && params.limit ? (params.page - 1) * params.limit : 0);
    const limit = params.limit || 50;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      caterers: paginated,
      total,
      page: params.page || Math.floor(offset / limit) + 1,
      limit,
      offset,
    };
  }

  async update(id: number, caterer: Partial<CreateCatererDTO>): Promise<Caterer | null> {
    const index = this.caterers.findIndex(c => c.id === id);
    if (index === -1) return null;

    this.caterers[index] = {
      ...this.caterers[index],
      ...caterer,
      updated_at: new Date(),
    };
    return this.caterers[index];
  }

  async delete(id: number): Promise<boolean> {
    const index = this.caterers.findIndex(c => c.id === id);
    if (index === -1) return false;
    this.caterers.splice(index, 1);
    return true;
  }

  async deleteMany(ids: number[]): Promise<number> {
    let deleted = 0;
    ids.forEach(id => {
      const index = this.caterers.findIndex(c => c.id === id);
      if (index !== -1) {
        this.caterers.splice(index, 1);
        deleted++;
      }
    });
    return deleted;
  }

  async count(): Promise<number> {
    return this.caterers.length;
  }

  async findDuplicate(caterer: CreateCatererDTO): Promise<Caterer | null> {
    const normalized = normalizeCatererData(caterer);
    
    return this.caterers.find(c => {
      return (
        c.caterer_name === normalized.caterer_name &&
        c.caterer_number === normalized.caterer_number &&
        (c.caterer_email || '') === (normalized.caterer_email || '') &&
        (c.airport_code_iata || '') === (normalized.airport_code_iata || '') &&
        (c.airport_code_icao || '') === (normalized.airport_code_icao || '') &&
        (c.time_zone || '') === (normalized.time_zone || '')
      );
    }) || null;
  }
}

