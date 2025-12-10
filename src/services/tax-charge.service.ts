import { TaxCharge, CreateTaxChargeDTO, UpdateTaxChargeDTO, TaxChargeSearchParams, TaxChargeListResponse } from '../models/tax-charge';
import { getTaxChargeRepository, getCategoryRepository } from '../repositories';
import { validateTaxCharge, normalizeTaxChargeData } from '../utils/tax-charge-validation';
import { Logger } from '../utils/logger';

export class TaxChargeService {
  private repository = getTaxChargeRepository();
  private categoryRepository = getCategoryRepository();

  private async validateCategory(categoryIdOrSlug?: string): Promise<void> {
    if (!categoryIdOrSlug) return;
    
    const isNumeric = /^\d+$/.test(categoryIdOrSlug);
    const category = isNumeric 
      ? await this.categoryRepository.findById(parseInt(categoryIdOrSlug))
      : await this.categoryRepository.findBySlug(categoryIdOrSlug);
    
    if (!category) {
      throw new Error(`Category not found: ${categoryIdOrSlug}`);
    }
  }

  async createTaxCharge(data: CreateTaxChargeDTO): Promise<TaxCharge> {
    const normalized = normalizeTaxChargeData(data);
    const validation = validateTaxCharge(normalized);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Validate category if applies_to is 'category'
    if (normalized.applies_to === 'category' && normalized.category) {
      await this.validateCategory(normalized.category);
    }

    return this.repository.create(normalized);
  }

  async getTaxChargeById(id: number): Promise<TaxCharge | null> {
    return this.repository.findById(id);
  }

  async listTaxCharges(params: TaxChargeSearchParams): Promise<TaxChargeListResponse> {
    return this.repository.findAll(params);
  }

  async updateTaxCharge(id: number, data: UpdateTaxChargeDTO): Promise<TaxCharge | null> {
    const normalized = normalizeTaxChargeData(data);
    
    if (Object.keys(normalized).length > 0) {
      const validation = validateTaxCharge(normalized);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
    }

    // Validate category if applies_to is 'category'
    if (normalized.applies_to === 'category' && normalized.category) {
      await this.validateCategory(normalized.category);
    }

    return this.repository.update(id, normalized);
  }

  async deleteTaxCharge(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async deleteTaxCharges(ids: number[]): Promise<number> {
    return this.repository.deleteMany(ids);
  }
}
