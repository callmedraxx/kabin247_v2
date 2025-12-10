import { AddonItem, CreateAddonItemDTO, UpdateAddonItemDTO, AddonItemSearchParams, AddonItemListResponse } from '../models/addon-item';
import { getAddonItemRepository, getCategoryRepository } from '../repositories';
import { validateAddonItem, normalizeAddonItemData } from '../utils/addon-item-validation';
import { Logger } from '../utils/logger';

export class AddonItemService {
  private repository = getAddonItemRepository();
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

  async createAddonItem(data: CreateAddonItemDTO): Promise<AddonItem> {
    const normalized = normalizeAddonItemData(data);
    const validation = validateAddonItem(normalized);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Validate category if provided
    if (normalized.category) {
      await this.validateCategory(normalized.category);
    }

    return this.repository.create(normalized);
  }

  async getAddonItemById(id: number): Promise<AddonItem | null> {
    return this.repository.findById(id);
  }

  async listAddonItems(params: AddonItemSearchParams): Promise<AddonItemListResponse> {
    return this.repository.findAll(params);
  }

  async updateAddonItem(id: number, data: UpdateAddonItemDTO): Promise<AddonItem | null> {
    const normalized = normalizeAddonItemData(data);
    
    if (Object.keys(normalized).length > 0) {
      const validation = validateAddonItem(normalized);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
    }

    // Validate category if provided
    if (normalized.category !== undefined) {
      await this.validateCategory(normalized.category);
    }

    return this.repository.update(id, normalized);
  }

  async deleteAddonItem(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async deleteAddonItems(ids: number[]): Promise<number> {
    return this.repository.deleteMany(ids);
  }
}
