import { TaxCharge, TaxChargeSearchParams, TaxChargeListResponse, CreateTaxChargeDTO, UpdateTaxChargeDTO } from '../models/tax-charge';
import { TaxChargeRepository } from './tax-charge.repository';

export class InMemoryTaxChargeRepository implements TaxChargeRepository {
  private taxCharges: TaxCharge[] = [];
  private nextId: number = 1;

  async create(taxChargeData: CreateTaxChargeDTO): Promise<TaxCharge> {
    const now = new Date();

    const newTaxCharge: TaxCharge = {
      id: this.nextId++,
      name: taxChargeData.name,
      type: taxChargeData.type,
      rate: taxChargeData.rate,
      is_percentage: taxChargeData.is_percentage,
      applies_to: taxChargeData.applies_to,
      category: taxChargeData.category,
      location: taxChargeData.location,
      min_amount: taxChargeData.min_amount,
      max_amount: taxChargeData.max_amount,
      description: taxChargeData.description,
      is_active: taxChargeData.is_active !== undefined ? taxChargeData.is_active : true,
      created_at: now,
      updated_at: now,
    };

    this.taxCharges.push(newTaxCharge);
    return newTaxCharge;
  }

  async findById(id: number): Promise<TaxCharge | null> {
    return this.taxCharges.find(t => t.id === id) || null;
  }

  async findAll(params: TaxChargeSearchParams): Promise<TaxChargeListResponse> {
    let filtered = [...this.taxCharges];

    // Apply search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(item => {
        return (
          item.name?.toLowerCase().includes(searchLower) ||
          item.description?.toLowerCase().includes(searchLower) ||
          item.type?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply type filter
    if (params.type && params.type !== 'all') {
      filtered = filtered.filter(item => item.type === params.type);
    }

    // Apply applies_to filter
    if (params.applies_to) {
      filtered = filtered.filter(item => item.applies_to === params.applies_to);
    }

    // Apply active filter
    if (params.is_active !== undefined) {
      filtered = filtered.filter(item => item.is_active === params.is_active);
    }

    // Apply sorting
    const sortBy = params.sortBy || 'created_at';
    const sortOrder = params.sortOrder || 'desc';
    filtered.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const total = filtered.length;

    // Apply pagination
    const limit = params.limit || 50;
    const page = params.page || 1;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      tax_charges: paginated,
      total,
      page,
      limit,
    };
  }

  async update(id: number, taxChargeData: UpdateTaxChargeDTO): Promise<TaxCharge | null> {
    const index = this.taxCharges.findIndex(t => t.id === id);
    if (index === -1) return null;

    this.taxCharges[index] = {
      ...this.taxCharges[index],
      ...taxChargeData,
      updated_at: new Date(),
    };

    return this.taxCharges[index];
  }

  async delete(id: number): Promise<boolean> {
    const index = this.taxCharges.findIndex(t => t.id === id);
    if (index === -1) return false;

    this.taxCharges.splice(index, 1);
    return true;
  }

  async deleteMany(ids: number[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  async count(): Promise<number> {
    return this.taxCharges.length;
  }
}
